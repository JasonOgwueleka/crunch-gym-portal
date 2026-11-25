import { Router } from 'express';
import { query, one, withTransaction } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, notFound, forbidden, requireFields, toInt, buildUpdate, conflict } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { hasActiveMembership } from '../utils/domain.js';

const router = Router();
const FIELDS = ['title', 'description', 'trainer_id', 'room', 'start_at', 'end_at', 'capacity', 'status'];

const LIVE = `('booked', 'attended')`;

/**
 * Public timetable. By default shows classes from now onwards.
 * Query: from, to (ISO), trainer_id, mine=1 (trainer's own classes), all=1 (include past)
 */
router.get('/', async (req, res) => {
  const params = [req.user?.id ?? null];
  const where = [];
  if (req.query.from) {
    params.push(req.query.from);
    where.push(`c.start_at >= $${params.length}`);
  } else if (req.query.all !== '1') {
    where.push(`c.end_at >= now()`);
  }
  if (req.query.to) {
    params.push(req.query.to);
    where.push(`c.start_at < $${params.length}`);
  }
  if (req.query.trainer_id) {
    params.push(toInt(req.query.trainer_id, 'trainer_id'));
    where.push(`c.trainer_id = $${params.length}`);
  }
  if (req.query.mine === '1' && req.user?.role === 'trainer') {
    where.push(`c.trainer_id = $1`);
  }
  // Visitors and members don't see cancelled classes in the timetable
  if (!req.user || req.user.role === 'member') where.push(`c.status <> 'cancelled'`);

  const { rows } = await query(
    `select c.*, t.full_name as trainer_name,
            (select count(*) from gym_v1.class_bookings b where b.class_id = c.id and b.status in ${LIVE})::int as booked_count,
            (select b.status from gym_v1.class_bookings b where b.class_id = c.id and b.member_id = $1) as my_booking_status
       from gym_v1.group_classes c
       left join gym_v1.users t on t.id = c.trainer_id
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by c.start_at ${req.query.all === '1' ? 'desc' : 'asc'}`,
    params,
  );
  res.json(rows);
});

// Member: own class bookings
router.get('/bookings/mine', requireRole('member'), async (req, res) => {
  const { rows } = await query(
    `select b.*, c.title, c.start_at, c.end_at, c.room, c.status as class_status, t.full_name as trainer_name
       from gym_v1.class_bookings b
       join gym_v1.group_classes c on c.id = b.class_id
       left join gym_v1.users t on t.id = c.trainer_id
      where b.member_id = $1
      order by c.start_at desc`,
    [req.user.id],
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const c = await one(
    `select c.*, t.full_name as trainer_name,
            (select count(*) from gym_v1.class_bookings b where b.class_id = c.id and b.status in ${LIVE})::int as booked_count
       from gym_v1.group_classes c left join gym_v1.users t on t.id = c.trainer_id
      where c.id = $1`,
    [toInt(req.params.id)],
  );
  if (!c) throw notFound('Class not found');
  res.json(c);
});

async function loadOwnedClass(req) {
  const c = await one('select * from gym_v1.group_classes where id = $1', [toInt(req.params.id)]);
  if (!c) throw notFound('Class not found');
  if (req.user.role === 'trainer' && c.trainer_id !== req.user.id) throw forbidden('You can only manage classes you run');
  return c;
}

router.post('/', requireRole('admin', 'trainer'), async (req, res) => {
  requireFields(req.body, ['title', 'start_at', 'end_at']);
  const b = req.body;
  const trainerId = req.user.role === 'trainer' ? req.user.id : (b.trainer_id || null);
  if (trainerId) {
    const t = await one(`select 1 from gym_v1.users where id = $1 and role = 'trainer'`, [trainerId]);
    if (!t) throw badRequest('Selected trainer does not exist');
  }
  const c = await one(
    `insert into gym_v1.group_classes (title, description, trainer_id, room, start_at, end_at, capacity, status)
     values ($1, $2, $3, $4, $5, $6, coalesce($7, 20), coalesce($8, 'scheduled')) returning *`,
    [b.title, b.description || null, trainerId, b.room || null, b.start_at, b.end_at, b.capacity || null, b.status || null],
  );
  await audit(req, 'class.create', 'group_class', c.id, { title: c.title, start_at: c.start_at });
  res.status(201).json(c);
});

router.put('/:id', requireRole('admin', 'trainer'), async (req, res) => {
  const existing = await loadOwnedClass(req);
  const allowed = req.user.role === 'trainer' ? FIELDS.filter((f) => f !== 'trainer_id') : FIELDS;
  const { sets, values } = buildUpdate(req.body, allowed, 2);
  if (!sets.length) throw badRequest('Nothing to update');
  const c = await one(`update gym_v1.group_classes set ${sets.join(', ')} where id = $1 returning *`, [existing.id, ...values]);
  await audit(req, 'class.update', 'group_class', c.id, req.body);
  res.json(c);
});

router.delete('/:id', requireRole('admin', 'trainer'), async (req, res) => {
  const existing = await loadOwnedClass(req);
  await query('delete from gym_v1.group_classes where id = $1', [existing.id]);
  await audit(req, 'class.delete', 'group_class', existing.id, { title: existing.title });
  res.json({ ok: true });
});

// ---- Bookings --------------------------------------------------------------

router.post('/:id/book', requireRole('member'), async (req, res) => {
  const classId = toInt(req.params.id);
  if (!(await hasActiveMembership(req.user.id))) {
    throw badRequest('You need an active membership to book classes');
  }
  const booking = await withTransaction(async (db) => {
    const { rows } = await db.query('select * from gym_v1.group_classes where id = $1 for update', [classId]);
    const c = rows[0];
    if (!c) throw notFound('Class not found');
    if (c.status !== 'scheduled') throw badRequest('This class is not open for booking');
    if (new Date(c.start_at) <= new Date()) throw badRequest('This class has already started');
    const { rows: [count] } = await db.query(
      `select count(*)::int as n from gym_v1.class_bookings where class_id = $1 and status in ${LIVE}`,
      [classId],
    );
    const { rows: existing } = await db.query(
      'select * from gym_v1.class_bookings where class_id = $1 and member_id = $2',
      [classId, req.user.id],
    );
    if (existing[0] && existing[0].status === 'booked') throw conflict('You have already booked this class');
    if (count.n >= c.capacity) throw conflict('This class is full');
    const { rows: [b] } = await db.query(
      `insert into gym_v1.class_bookings (class_id, member_id, status) values ($1, $2, 'booked')
       on conflict (class_id, member_id) do update set status = 'booked' returning *`,
      [classId, req.user.id],
    );
    return b;
  });
  await audit(req, 'class.book', 'class_booking', booking.id, { class_id: classId });
  res.status(201).json(booking);
});

router.delete('/:id/book', requireRole('member'), async (req, res) => {
  const classId = toInt(req.params.id);
  const b = await one(
    `update gym_v1.class_bookings set status = 'cancelled'
      where class_id = $1 and member_id = $2 and status = 'booked' returning *`,
    [classId, req.user.id],
  );
  if (!b) throw notFound('You do not have a booking for this class');
  await audit(req, 'class.cancel_booking', 'class_booking', b.id, { class_id: classId });
  res.json(b);
});

// Roster for the class trainer or admin
router.get('/:id/bookings', requireRole('admin', 'trainer'), async (req, res) => {
  const c = await loadOwnedClass(req);
  const { rows } = await query(
    `select b.*, u.full_name as member_name, u.email as member_email, u.phone as member_phone
       from gym_v1.class_bookings b join gym_v1.users u on u.id = b.member_id
      where b.class_id = $1 order by u.full_name`,
    [c.id],
  );
  res.json(rows);
});

// Trainer/admin marks attendance (or admin changes a booking)
router.patch('/:id/bookings/:bookingId', requireRole('admin', 'trainer'), async (req, res) => {
  const c = await loadOwnedClass(req);
  const status = req.body?.status;
  if (!['booked', 'cancelled', 'attended', 'no_show'].includes(status)) throw badRequest('Invalid status');
  const b = await one(
    'update gym_v1.class_bookings set status = $3 where id = $1 and class_id = $2 returning *',
    [toInt(req.params.bookingId), c.id, status],
  );
  if (!b) throw notFound('Booking not found');
  await audit(req, 'class.booking_status', 'class_booking', b.id, { status });
  res.json(b);
});

router.delete('/:id/bookings/:bookingId', requireRole('admin', 'trainer'), async (req, res) => {
  const c = await loadOwnedClass(req);
  const b = await one(
    'delete from gym_v1.class_bookings where id = $1 and class_id = $2 returning *',
    [toInt(req.params.bookingId), c.id],
  );
  if (!b) throw notFound('Booking not found');
  await audit(req, 'class.booking_delete', 'class_booking', b.id, { class_id: c.id, member_id: b.member_id });
  res.json({ ok: true });
});

export default router;
