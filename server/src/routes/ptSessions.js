import { Router } from 'express';
import { query, one, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { badRequest, notFound, forbidden, requireFields, toInt, conflict } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { getAssignedTrainerId, hasActiveMembership } from '../utils/domain.js';

const router = Router();
const STATUSES = ['booked', 'cancelled', 'completed', 'no_show'];

const SELECT = `
  select s.*, t.full_name as trainer_name, m.full_name as member_name, m.email as member_email
    from gym_v0.pt_sessions s
    join gym_v0.users t on t.id = s.trainer_id
    join gym_v0.users m on m.id = s.member_id`;

router.get('/', requireAuth, async (req, res) => {
  const { role, id } = req.user;
  let rows;
  if (role === 'member') {
    ({ rows } = await query(`${SELECT} where s.member_id = $1 order by s.start_at desc`, [id]));
  } else if (role === 'trainer') {
    ({ rows } = await query(`${SELECT} where s.trainer_id = $1 order by s.start_at desc`, [id]));
  } else if (role === 'admin') {
    ({ rows } = await query(`${SELECT} order by s.start_at desc`));
  } else {
    throw forbidden();
  }
  res.json(rows);
});

async function loadSession(req) {
  const s = await one(`${SELECT} where s.id = $1`, [toInt(req.params.id)]);
  if (!s) throw notFound('Session not found');
  const { role, id } = req.user;
  if (role === 'admin') return s;
  if (role === 'member' && s.member_id === id) return s;
  if (role === 'trainer' && s.trainer_id === id) return s;
  throw forbidden();
}

router.get('/:id', requireAuth, async (req, res) => {
  res.json(await loadSession(req));
});

// Member books an open slot of their assigned trainer
router.post('/', requireRole('member'), async (req, res) => {
  requireFields(req.body, ['availability_id']);
  const trainerId = await getAssignedTrainerId(req.user.id);
  if (!trainerId) throw badRequest('You do not have an assigned trainer yet');
  if (!(await hasActiveMembership(req.user.id))) throw badRequest('You need an active membership to book sessions');

  const session = await withTransaction(async (db) => {
    const { rows } = await db.query(
      'select * from gym_v0.trainer_availability where id = $1 for update',
      [toInt(req.body.availability_id, 'availability_id')],
    );
    const slot = rows[0];
    if (!slot || slot.trainer_id !== trainerId) throw notFound('That slot is not available');
    if (new Date(slot.start_at) <= new Date()) throw badRequest('That slot is in the past');
    const { rows: taken } = await db.query(
      `select 1 from gym_v0.pt_sessions where availability_id = $1 and status in ('booked', 'completed')`,
      [slot.id],
    );
    if (taken.length) throw conflict('That slot has just been booked by someone else');
    const { rows: [s] } = await db.query(
      `insert into gym_v0.pt_sessions (trainer_id, member_id, availability_id, start_at, end_at, member_notes)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [trainerId, req.user.id, slot.id, slot.start_at, slot.end_at, req.body.member_notes || null],
    );
    return s;
  });
  await audit(req, 'pt_session.book', 'pt_session', session.id, { trainer_id: trainerId, start_at: session.start_at });
  res.status(201).json(session);
});

// Admin can create a session directly
router.post('/admin', requireRole('admin'), async (req, res) => {
  requireFields(req.body, ['trainer_id', 'member_id', 'start_at', 'end_at']);
  const b = req.body;
  const s = await one(
    `insert into gym_v0.pt_sessions (trainer_id, member_id, start_at, end_at, status, member_notes)
     values ($1, $2, $3, $4, coalesce($5, 'booked'), $6) returning *`,
    [b.trainer_id, b.member_id, b.start_at, b.end_at, b.status || null, b.member_notes || null],
  );
  await audit(req, 'pt_session.create', 'pt_session', s.id, b);
  res.status(201).json(s);
});

/**
 * Update a session.
 * - Member: can change their notes while booked.
 * - Trainer: can change status (e.g. completed / no_show).
 * - Admin: status, notes, times.
 */
router.put('/:id', requireAuth, async (req, res) => {
  const s = await loadSession(req);
  const b = req.body || {};
  const { role } = req.user;
  let updated;
  if (role === 'member') {
    if (s.status !== 'booked') throw badRequest('Only upcoming sessions can be changed');
    updated = await one('update gym_v0.pt_sessions set member_notes = $2 where id = $1 returning *', [s.id, b.member_notes || null]);
  } else {
    if (b.status && !STATUSES.includes(b.status)) throw badRequest('Invalid status');
    updated = await one(
      `update gym_v0.pt_sessions set
          status = coalesce($2, status),
          member_notes = case when $5 then $3 else member_notes end,
          start_at = coalesce($4::timestamptz, start_at),
          end_at = coalesce($6::timestamptz, end_at)
        where id = $1 returning *`,
      [
        s.id,
        b.status || null,
        b.member_notes || null,
        role === 'admin' ? b.start_at || null : null,
        role === 'admin' && b.member_notes !== undefined,
        role === 'admin' ? b.end_at || null : null,
      ],
    );
  }
  await audit(req, 'pt_session.update', 'pt_session', s.id, b);
  res.json(updated);
});

router.post('/:id/cancel', requireAuth, async (req, res) => {
  const s = await loadSession(req);
  if (s.status !== 'booked') throw badRequest('Only booked sessions can be cancelled');
  const updated = await one(`update gym_v0.pt_sessions set status = 'cancelled' where id = $1 returning *`, [s.id]);
  await audit(req, 'pt_session.cancel', 'pt_session', s.id);
  res.json(updated);
});

router.delete('/:id', requireRole('trainer', 'admin'), async (req, res) => {
  const s = await loadSession(req);
  await query('delete from gym_v0.pt_sessions where id = $1', [s.id]);
  await audit(req, 'pt_session.delete', 'pt_session', s.id);
  res.json({ ok: true });
});

export default router;
