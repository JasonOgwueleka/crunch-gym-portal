import { Router } from 'express';
import { query, one } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { notFound, requireFields, toInt, conflict, badRequest } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { ACTIVE_MEMBERSHIP_SQL, hasActiveMembership } from '../utils/domain.js';

const router = Router();

// Member: own visit history
router.get('/mine', requireRole('member'), async (req, res) => {
  const { rows } = await query(
    'select id, checked_in_at, membership_active from gym_v0.check_ins where member_id = $1 order by checked_in_at desc limit 50',
    [req.user.id],
  );
  res.json(rows);
});

router.use(requireRole('front_desk', 'admin'));

// Search members and show whether their membership is active
router.get('/members', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const { rows } = await query(
    `select u.id, u.full_name, u.email, u.phone, u.is_active,
            ${ACTIVE_MEMBERSHIP_SQL('u')} as membership_active,
            cur.plan_name, cur.end_date, cur.status as membership_status,
            (select max(checked_in_at) from gym_v0.check_ins ci where ci.member_id = u.id) as last_check_in
       from gym_v0.users u
       left join lateral (
         select p.name as plan_name, m.end_date, m.status
           from gym_v0.memberships m join gym_v0.membership_plans p on p.id = m.plan_id
          where m.user_id = u.id order by m.end_date desc limit 1
       ) cur on true
      where u.role = 'member'
        and ($1 = '' or u.full_name ilike '%' || $1 || '%' or u.email ilike '%' || $1 || '%' or u.phone ilike '%' || $1 || '%'
             or u.id::text = $1)
      order by u.full_name
      limit 50`,
    [q],
  );
  res.json(rows);
});

// Check-ins for a given day (default today)
router.get('/', async (req, res) => {
  const { rows } = await query(
    `select ci.*, u.full_name as member_name, u.email as member_email, s.full_name as checked_in_by_name
       from gym_v0.check_ins ci
       join gym_v0.users u on u.id = ci.member_id
       left join gym_v0.users s on s.id = ci.checked_in_by
      where ci.checked_in_at::date = coalesce($1::date, current_date)
      order by ci.checked_in_at desc`,
    [req.query.date || null],
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  requireFields(req.body, ['member_id']);
  const memberId = toInt(req.body.member_id, 'member_id');
  const member = await one(`select id, full_name, is_active from gym_v0.users where id = $1 and role = 'member'`, [memberId]);
  if (!member) throw notFound('Member not found');
  if (!member.is_active) throw badRequest('This account is deactivated');
  const active = await hasActiveMembership(memberId);
  if (!active && !req.body.override) {
    throw conflict(`${member.full_name} does not have an active membership`);
  }
  const ci = await one(
    `insert into gym_v0.check_ins (member_id, checked_in_by, membership_active, notes)
     values ($1, $2, $3, $4) returning *`,
    [memberId, req.user.id, active, req.body.notes || null],
  );
  await audit(req, active ? 'checkin.create' : 'checkin.override', 'check_in', ci.id, { member_id: memberId, membership_active: active });
  res.status(201).json(ci);
});

router.put('/:id', async (req, res) => {
  const ci = await one('update gym_v0.check_ins set notes = $2 where id = $1 returning *', [toInt(req.params.id), req.body?.notes || null]);
  if (!ci) throw notFound('Check-in not found');
  await audit(req, 'checkin.update', 'check_in', ci.id);
  res.json(ci);
});

router.delete('/:id', async (req, res) => {
  const ci = await one('delete from gym_v0.check_ins where id = $1 returning *', [toInt(req.params.id)]);
  if (!ci) throw notFound('Check-in not found');
  await audit(req, 'checkin.delete', 'check_in', ci.id, { member_id: ci.member_id });
  res.json({ ok: true });
});

export default router;
