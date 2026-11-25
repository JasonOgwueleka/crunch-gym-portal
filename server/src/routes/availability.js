import { Router } from 'express';
import { query, one } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { badRequest, notFound, forbidden, requireFields, toInt, conflict } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { getAssignedTrainerId } from '../utils/domain.js';

const router = Router();

const SELECT = `
  select a.*, t.full_name as trainer_name,
         s.id as session_id, s.status as session_status, s.member_id, m.full_name as member_name
    from gym_v0.trainer_availability a
    join gym_v0.users t on t.id = a.trainer_id
    left join gym_v0.pt_sessions s on s.availability_id = a.id and s.status in ('booked', 'completed')
    left join gym_v0.users m on m.id = s.member_id`;

/**
 * Trainer: own slots (past week onwards).
 * Member: open future slots of their assigned trainer.
 * Admin: everything, optional ?trainer_id.
 */
router.get('/', requireAuth, async (req, res) => {
  const { role, id } = req.user;
  if (role === 'trainer') {
    const { rows } = await query(
      `${SELECT} where a.trainer_id = $1 and a.end_at >= now() - interval '7 days' order by a.start_at`,
      [id],
    );
    return res.json(rows);
  }
  if (role === 'member') {
    const trainerId = await getAssignedTrainerId(id);
    if (!trainerId) return res.json([]);
    const { rows } = await query(
      `${SELECT} where a.trainer_id = $1 and a.start_at > now() and s.id is null order by a.start_at`,
      [trainerId],
    );
    return res.json(rows);
  }
  if (role === 'admin') {
    const params = [];
    let where = '';
    if (req.query.trainer_id) {
      params.push(toInt(req.query.trainer_id, 'trainer_id'));
      where = 'where a.trainer_id = $1';
    }
    const { rows } = await query(`${SELECT} ${where} order by a.start_at desc`, params);
    return res.json(rows);
  }
  throw forbidden();
});

async function assertNoOverlap(trainerId, startAt, endAt, excludeId = null) {
  const clash = await one(
    `select id from gym_v0.trainer_availability
      where trainer_id = $1 and id <> coalesce($4, -1)
        and tstzrange(start_at, end_at) && tstzrange($2::timestamptz, $3::timestamptz)`,
    [trainerId, startAt, endAt, excludeId],
  );
  if (clash) throw conflict('This slot overlaps another of your availability slots');
}

router.post('/', requireRole('trainer', 'admin'), async (req, res) => {
  requireFields(req.body, ['start_at', 'end_at']);
  const trainerId = req.user.role === 'trainer' ? req.user.id : toInt(req.body.trainer_id, 'trainer_id');
  if (new Date(req.body.end_at) <= new Date(req.body.start_at)) throw badRequest('End time must be after start time');
  await assertNoOverlap(trainerId, req.body.start_at, req.body.end_at);
  const slot = await one(
    `insert into gym_v0.trainer_availability (trainer_id, start_at, end_at, notes)
     values ($1, $2, $3, $4) returning *`,
    [trainerId, req.body.start_at, req.body.end_at, req.body.notes || null],
  );
  await audit(req, 'availability.create', 'trainer_availability', slot.id, { start_at: slot.start_at });
  res.status(201).json(slot);
});

async function loadOwnedSlot(req) {
  const slot = await one(`${SELECT} where a.id = $1`, [toInt(req.params.id)]);
  if (!slot) throw notFound('Slot not found');
  if (req.user.role === 'trainer' && slot.trainer_id !== req.user.id) throw forbidden();
  return slot;
}

router.get('/:id', requireRole('trainer', 'admin'), async (req, res) => {
  res.json(await loadOwnedSlot(req));
});

router.put('/:id', requireRole('trainer', 'admin'), async (req, res) => {
  const slot = await loadOwnedSlot(req);
  if (slot.session_id) throw conflict('This slot is booked. Cancel the session before changing it.');
  const startAt = req.body.start_at || slot.start_at;
  const endAt = req.body.end_at || slot.end_at;
  if (new Date(endAt) <= new Date(startAt)) throw badRequest('End time must be after start time');
  await assertNoOverlap(slot.trainer_id, startAt, endAt, slot.id);
  const updated = await one(
    `update gym_v0.trainer_availability set start_at = $2, end_at = $3, notes = $4 where id = $1 returning *`,
    [slot.id, startAt, endAt, req.body.notes === undefined ? slot.notes : req.body.notes || null],
  );
  await audit(req, 'availability.update', 'trainer_availability', slot.id, req.body);
  res.json(updated);
});

router.delete('/:id', requireRole('trainer', 'admin'), async (req, res) => {
  const slot = await loadOwnedSlot(req);
  if (slot.session_id && slot.session_status === 'booked') {
    throw conflict('This slot is booked. Cancel the session before deleting it.');
  }
  await query('delete from gym_v0.trainer_availability where id = $1', [slot.id]);
  await audit(req, 'availability.delete', 'trainer_availability', slot.id);
  res.json({ ok: true });
});

export default router;
