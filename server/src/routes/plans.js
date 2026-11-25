import { Router } from 'express';
import { query, one } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { notFound, requireFields, toInt, buildUpdate, badRequest } from '../utils/http.js';
import { audit } from '../utils/audit.js';

const router = Router();
const FIELDS = ['name', 'description', 'price_cents', 'duration_months', 'features', 'is_active'];

// Public: active plans. Admins can pass ?all=1 to include inactive plans.
router.get('/', async (req, res) => {
  const all = req.query.all === '1' && req.user?.role === 'admin';
  const { rows } = await query(
    `select p.*,
            (select count(*) from gym_v0.memberships m where m.plan_id = p.id)::int as membership_count
       from gym_v0.membership_plans p
      ${all ? '' : 'where p.is_active'}
      order by p.price_cents`,
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const plan = await one('select * from gym_v0.membership_plans where id = $1', [toInt(req.params.id)]);
  if (!plan || (!plan.is_active && req.user?.role !== 'admin')) throw notFound('Plan not found');
  res.json(plan);
});

router.post('/', requireRole('admin'), async (req, res) => {
  requireFields(req.body, ['name', 'price_cents', 'duration_months']);
  const b = req.body;
  const plan = await one(
    `insert into gym_v0.membership_plans (name, description, price_cents, duration_months, features, is_active)
     values ($1, $2, $3, $4, $5, coalesce($6, true)) returning *`,
    [b.name, b.description || null, b.price_cents, b.duration_months, b.features || null, b.is_active ?? null],
  );
  await audit(req, 'plan.create', 'membership_plan', plan.id, { name: plan.name, price_cents: plan.price_cents });
  res.status(201).json(plan);
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  const id = toInt(req.params.id);
  const { sets, values } = buildUpdate(req.body, FIELDS, 2);
  if (!sets.length) throw badRequest('Nothing to update');
  const plan = await one(`update gym_v0.membership_plans set ${sets.join(', ')} where id = $1 returning *`, [id, ...values]);
  if (!plan) throw notFound('Plan not found');
  await audit(req, 'plan.update', 'membership_plan', id, req.body);
  res.json(plan);
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = toInt(req.params.id);
  const used = await one('select count(*)::int as n from gym_v0.memberships where plan_id = $1', [id]);
  if (used.n > 0) {
    throw badRequest('This plan has memberships. Mark it inactive instead of deleting it.');
  }
  const plan = await one('delete from gym_v0.membership_plans where id = $1 returning *', [id]);
  if (!plan) throw notFound('Plan not found');
  await audit(req, 'plan.delete', 'membership_plan', id, { name: plan.name });
  res.json({ ok: true });
});

export default router;
