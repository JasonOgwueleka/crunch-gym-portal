import { Router } from 'express';
import { query, one } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, notFound, requireFields, toInt } from '../utils/http.js';
import { audit } from '../utils/audit.js';

const router = Router();

const SELECT = `
  select a.*, m.full_name as member_name, m.email as member_email,
         t.full_name as trainer_name, b.full_name as assigned_by_name
    from gym_v1.trainer_assignments a
    join gym_v1.users m on m.id = a.member_id
    join gym_v1.users t on t.id = a.trainer_id
    left join gym_v1.users b on b.id = a.assigned_by`;

// Member: their assigned trainer
router.get('/mine', requireRole('member'), async (req, res) => {
  const row = await one(
    `select a.id, a.trainer_id, a.assigned_at, t.full_name as trainer_name, t.email as trainer_email,
            tp.bio, tp.specialties
       from gym_v1.trainer_assignments a
       join gym_v1.users t on t.id = a.trainer_id
       left join gym_v1.trainer_profiles tp on tp.user_id = a.trainer_id
      where a.member_id = $1`,
    [req.user.id],
  );
  res.json(row);
});

router.use(requireRole('admin'));

async function validatePair(memberId, trainerId) {
  const m = await one('select role from gym_v1.users where id = $1', [memberId]);
  const t = await one('select role from gym_v1.users where id = $1', [trainerId]);
  if (!m || m.role !== 'member') throw badRequest('Selected member is not a member');
  if (!t || t.role !== 'trainer') throw badRequest('Selected trainer is not a trainer');
}

router.get('/', async (req, res) => {
  const { rows } = await query(`${SELECT} order by t.full_name, m.full_name`);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const row = await one(`${SELECT} where a.id = $1`, [toInt(req.params.id)]);
  if (!row) throw notFound('Assignment not found');
  res.json(row);
});

router.post('/', async (req, res) => {
  requireFields(req.body, ['member_id', 'trainer_id']);
  const memberId = toInt(req.body.member_id, 'member_id');
  const trainerId = toInt(req.body.trainer_id, 'trainer_id');
  await validatePair(memberId, trainerId);
  const existing = await one('select id from gym_v1.trainer_assignments where member_id = $1', [memberId]);
  if (existing) throw badRequest('This member already has a trainer. Edit the existing assignment instead.');
  const row = await one(
    `insert into gym_v1.trainer_assignments (member_id, trainer_id, assigned_by, notes)
     values ($1, $2, $3, $4) returning *`,
    [memberId, trainerId, req.user.id, req.body.notes || null],
  );
  await audit(req, 'assignment.create', 'trainer_assignment', row.id, { member_id: memberId, trainer_id: trainerId });
  res.status(201).json(row);
});

router.put('/:id', async (req, res) => {
  const id = toInt(req.params.id);
  const existing = await one('select * from gym_v1.trainer_assignments where id = $1', [id]);
  if (!existing) throw notFound('Assignment not found');
  const trainerId = req.body.trainer_id ? toInt(req.body.trainer_id, 'trainer_id') : existing.trainer_id;
  const memberId = req.body.member_id ? toInt(req.body.member_id, 'member_id') : existing.member_id;
  await validatePair(memberId, trainerId);
  const row = await one(
    `update gym_v1.trainer_assignments
        set member_id = $2, trainer_id = $3, notes = $4, assigned_by = $5,
            assigned_at = case when trainer_id <> $3 then now() else assigned_at end
      where id = $1 returning *`,
    [id, memberId, trainerId, req.body.notes === undefined ? existing.notes : req.body.notes || null, req.user.id],
  );
  await audit(req, 'assignment.update', 'trainer_assignment', id, {
    member_id: memberId, trainer_id: trainerId, previous_trainer_id: existing.trainer_id,
  });
  res.json(row);
});

router.delete('/:id', async (req, res) => {
  const row = await one('delete from gym_v1.trainer_assignments where id = $1 returning *', [toInt(req.params.id)]);
  if (!row) throw notFound('Assignment not found');
  await audit(req, 'assignment.delete', 'trainer_assignment', row.id, { member_id: row.member_id, trainer_id: row.trainer_id });
  res.json({ ok: true });
});

export default router;
