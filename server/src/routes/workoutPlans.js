import { Router } from 'express';
import { query, one } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { badRequest, notFound, forbidden, requireFields, toInt, buildUpdate } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { assertCanViewMember, assertTrainerOf } from '../utils/domain.js';

const router = Router();
const FIELDS = ['title', 'goal', 'description', 'exercises', 'start_date', 'end_date', 'is_active'];

const SELECT = `
  select w.*, t.full_name as trainer_name, m.full_name as member_name
    from gym_v1.workout_plans w
    left join gym_v1.users t on t.id = w.trainer_id
    join gym_v1.users m on m.id = w.member_id`;

/**
 * Member: their own plans.
 * Trainer: plans for their assigned clients (?member_id to filter).
 * Admin: all plans (?member_id to filter).
 */
router.get('/', requireAuth, async (req, res) => {
  const { role, id } = req.user;
  const memberId = req.query.member_id ? toInt(req.query.member_id, 'member_id') : null;
  let rows;
  if (role === 'member') {
    ({ rows } = await query(`${SELECT} where w.member_id = $1 order by w.is_active desc, w.created_at desc`, [id]));
  } else if (role === 'trainer') {
    ({ rows } = await query(
      `${SELECT} join gym_v1.trainer_assignments ta on ta.member_id = w.member_id and ta.trainer_id = $1
        where ($2::int is null or w.member_id = $2) order by w.created_at desc`,
      [id, memberId],
    ));
  } else if (role === 'admin') {
    ({ rows } = await query(`${SELECT} where ($1::int is null or w.member_id = $1) order by w.created_at desc`, [memberId]));
  } else {
    throw forbidden();
  }
  res.json(rows);
});

router.get('/:id', requireAuth, async (req, res) => {
  const plan = await one(`${SELECT} where w.id = $1`, [toInt(req.params.id)]);
  if (!plan) throw notFound('Workout plan not found');
  await assertCanViewMember(req.user, plan.member_id);
  res.json(plan);
});

router.post('/', requireRole('trainer', 'admin'), async (req, res) => {
  requireFields(req.body, ['member_id', 'title']);
  const memberId = toInt(req.body.member_id, 'member_id');
  await assertTrainerOf(req.user, memberId);
  const b = req.body;
  const trainerId = req.user.role === 'trainer' ? req.user.id : (b.trainer_id || null);
  const plan = await one(
    `insert into gym_v1.workout_plans (trainer_id, member_id, title, goal, description, exercises, start_date, end_date, is_active)
     values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, true)) returning *`,
    [trainerId, memberId, b.title, b.goal || null, b.description || null, b.exercises || null, b.start_date || null, b.end_date || null, b.is_active ?? null],
  );
  await audit(req, 'workout_plan.create', 'workout_plan', plan.id, { member_id: memberId, title: plan.title });
  res.status(201).json(plan);
});

router.put('/:id', requireRole('trainer', 'admin'), async (req, res) => {
  const existing = await one('select * from gym_v1.workout_plans where id = $1', [toInt(req.params.id)]);
  if (!existing) throw notFound('Workout plan not found');
  await assertTrainerOf(req.user, existing.member_id);
  const { sets, values } = buildUpdate(req.body, FIELDS, 2);
  if (!sets.length) throw badRequest('Nothing to update');
  const plan = await one(`update gym_v1.workout_plans set ${sets.join(', ')} where id = $1 returning *`, [existing.id, ...values]);
  await audit(req, 'workout_plan.update', 'workout_plan', plan.id, { member_id: plan.member_id });
  res.json(plan);
});

router.delete('/:id', requireRole('trainer', 'admin'), async (req, res) => {
  const existing = await one('select * from gym_v1.workout_plans where id = $1', [toInt(req.params.id)]);
  if (!existing) throw notFound('Workout plan not found');
  await assertTrainerOf(req.user, existing.member_id);
  await query('delete from gym_v1.workout_plans where id = $1', [existing.id]);
  await audit(req, 'workout_plan.delete', 'workout_plan', existing.id, { member_id: existing.member_id });
  res.json({ ok: true });
});

export default router;
