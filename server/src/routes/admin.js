import { Router } from 'express';
import { query, one } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { notFound } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { toCsv } from '../utils/csv.js';
import { ACTIVE_MEMBERSHIP_SQL } from '../utils/domain.js';

/** Admin-only: audit log, dashboard summary and CSV reports. */
const router = Router();
router.use(requireRole('admin'));

router.get('/audit-logs', async (req, res) => {
  const params = [];
  const where = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (req.query.action) add(`a.action ilike ?`, `%${req.query.action}%`);
  if (req.query.actor) add(`(a.actor_email ilike ? )`, `%${req.query.actor}%`);
  if (req.query.entity_type) add(`a.entity_type = ?`, req.query.entity_type);
  if (req.query.from) add(`a.created_at >= ?::date`, req.query.from);
  if (req.query.to) add(`a.created_at < (?::date + 1)`, req.query.to);
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const whereSql = where.length ? `where ${where.join(' and ')}` : '';
  const [{ rows }, total] = await Promise.all([
    query(`select a.* from gym_v1.audit_logs a ${whereSql} order by a.created_at desc limit ${limit} offset ${offset}`, params),
    one(`select count(*)::int as n from gym_v1.audit_logs a ${whereSql}`, params),
  ]);
  res.json({ rows, total: total.n, limit, offset });
});

router.get('/summary', async (req, res) => {
  const stats = await one(`
    select
      (select count(*) from gym_v1.users where role = 'member')::int as members,
      (select count(*) from gym_v1.users u where u.role = 'member' and ${ACTIVE_MEMBERSHIP_SQL('u')})::int as active_members,
      (select count(*) from gym_v1.users where role = 'trainer')::int as trainers,
      (select count(*) from gym_v1.check_ins where checked_in_at::date = current_date)::int as check_ins_today,
      (select coalesce(sum(amount_cents), 0) from gym_v1.payments
        where status in ('succeeded', 'partially_refunded', 'refunded')
          and created_at >= date_trunc('month', now()))::int as revenue_month_cents,
      (select coalesce(sum(amount_cents), 0) from gym_v1.refunds
        where created_at >= date_trunc('month', now()))::int as refunds_month_cents,
      (select count(*) from gym_v1.certifications where status = 'pending')::int as pending_certifications,
      (select count(*) from gym_v1.group_classes where start_at::date = current_date and status = 'scheduled')::int as classes_today,
      (select count(*) from gym_v1.users u where u.role = 'member'
         and not exists (select 1 from gym_v1.trainer_assignments ta where ta.member_id = u.id))::int as unassigned_members
  `);
  res.json(stats);
});

const REPORTS = {
  members: {
    sql: `select u.id, u.full_name, u.email, u.phone, u.created_at, u.is_active,
                 ${ACTIVE_MEMBERSHIP_SQL('u')} as membership_active,
                 t.full_name as trainer
            from gym_v1.users u
            left join gym_v1.trainer_assignments ta on ta.member_id = u.id
            left join gym_v1.users t on t.id = ta.trainer_id
           where u.role = 'member' order by u.full_name`,
  },
  memberships: {
    sql: `select m.id, u.full_name as member, u.email, p.name as plan, m.status, m.start_date, m.end_date,
                 m.auto_renew, m.cancelled_at, m.created_at
            from gym_v1.memberships m
            join gym_v1.users u on u.id = m.user_id
            join gym_v1.membership_plans p on p.id = m.plan_id
           order by m.created_at desc`,
  },
  payments: {
    sql: `select pay.id, pay.reference, pay.created_at, u.full_name as member, u.email, p.name as plan,
                 pay.amount_cents, pay.currency, pay.status, pay.card_brand, pay.card_last4, pay.failure_reason,
                 coalesce((select sum(r.amount_cents) from gym_v1.refunds r where r.payment_id = pay.id), 0) as refunded_cents
            from gym_v1.payments pay
            left join gym_v1.users u on u.id = pay.user_id
            left join gym_v1.membership_plans p on p.id = pay.plan_id
           order by pay.created_at desc`,
  },
  refunds: {
    sql: `select r.id, r.created_at, pay.reference, u.full_name as member, r.amount_cents, r.reason, a.full_name as issued_by
            from gym_v1.refunds r
            join gym_v1.payments pay on pay.id = r.payment_id
            left join gym_v1.users u on u.id = pay.user_id
            left join gym_v1.users a on a.id = r.issued_by
           order by r.created_at desc`,
  },
  'check-ins': {
    sql: `select ci.id, ci.checked_in_at, u.full_name as member, u.email, ci.membership_active,
                 s.full_name as checked_in_by, ci.notes
            from gym_v1.check_ins ci
            join gym_v1.users u on u.id = ci.member_id
            left join gym_v1.users s on s.id = ci.checked_in_by
           order by ci.checked_in_at desc`,
  },
  'class-attendance': {
    sql: `select c.id as class_id, c.title, c.start_at, t.full_name as trainer, c.capacity, c.status,
                 count(b.id) filter (where b.status in ('booked', 'attended')) as booked,
                 count(b.id) filter (where b.status = 'attended') as attended,
                 count(b.id) filter (where b.status = 'no_show') as no_show,
                 count(b.id) filter (where b.status = 'cancelled') as cancelled
            from gym_v1.group_classes c
            left join gym_v1.users t on t.id = c.trainer_id
            left join gym_v1.class_bookings b on b.class_id = c.id
           group by c.id, t.full_name
           order by c.start_at desc`,
  },
  'pt-sessions': {
    sql: `select s.id, s.start_at, s.end_at, t.full_name as trainer, m.full_name as member, s.status
            from gym_v1.pt_sessions s
            join gym_v1.users t on t.id = s.trainer_id
            join gym_v1.users m on m.id = s.member_id
           order by s.start_at desc`,
  },
  'audit-log': {
    sql: `select id, created_at, actor_email, actor_role, action, entity_type, entity_id, ip_address, details
            from gym_v1.audit_logs order by created_at desc limit 10000`,
  },
};

router.get('/reports', (req, res) => {
  res.json(Object.keys(REPORTS));
});

router.get('/reports/:name', async (req, res) => {
  const name = String(req.params.name).replace(/\.csv$/, '');
  const report = REPORTS[name];
  if (!report) throw notFound('Unknown report');
  const { rows, fields } = await query(report.sql);
  const csv = toCsv(
    rows.map((r) => (r.details ? { ...r, details: JSON.stringify(r.details) } : r)),
    fields.map((f) => f.name),
  );
  await audit(req, 'report.export', 'report', name, { rows: rows.length });
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="crunch-${name}-${stamp}.csv"`);
  res.send(csv);
});

export default router;
