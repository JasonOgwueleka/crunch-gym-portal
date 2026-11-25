import { Router } from 'express';
import { query, one, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, badRequest, notFound, forbidden, requireFields, toInt, buildUpdate } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { processPayment } from '../utils/payments.js';
import { sendEmail } from '../utils/mailer.js';
import { addMonths, addDays, todayStr } from '../utils/domain.js';

const router = Router();

const SELECT = `
  select m.*, p.name as plan_name, p.price_cents, p.duration_months,
         u.full_name as member_name, u.email as member_email,
         (m.status = 'active' and current_date between m.start_date and m.end_date) as is_current
    from gym_v1.memberships m
    join gym_v1.membership_plans p on p.id = m.plan_id
    join gym_v1.users u on u.id = m.user_id`;

// Member: own memberships (newest first)
router.get('/mine', requireAuth, async (req, res) => {
  const { rows } = await query(`${SELECT} where m.user_id = $1 order by m.end_date desc, m.id desc`, [req.user.id]);
  res.json(rows);
});

/**
 * Member: buy or renew a membership through the simulated payment step.
 * - No current membership: a new one starts today.
 * - Current membership exists: it is renewed (extended from its end date, switching to the chosen plan).
 */
router.post('/checkout', requireRole('member'), async (req, res) => {
  requireFields(req.body, ['plan_id', 'card_number', 'card_name', 'expiry', 'cvc']);
  const plan = await one('select * from gym_v1.membership_plans where id = $1 and is_active', [toInt(req.body.plan_id, 'plan_id')]);
  if (!plan) throw notFound('That plan is not available');

  const result = processPayment({
    cardNumber: req.body.card_number,
    cardName: req.body.card_name,
    expiry: req.body.expiry,
    cvc: req.body.cvc,
    amountCents: plan.price_cents,
  });

  const outcome = await withTransaction(async (db) => {
    let membership = null;
    let action = 'purchase';
    if (result.ok) {
      const { rows: current } = await db.query(
        `select * from gym_v1.memberships
          where user_id = $1 and status = 'active' and end_date >= current_date
          order by end_date desc limit 1 for update`,
        [req.user.id],
      );
      if (current[0]) {
        action = 'renew';
        const newEnd = addMonths(current[0].end_date, plan.duration_months);
        ({ rows: [membership] } = await db.query(
          `update gym_v1.memberships set plan_id = $2, end_date = $3, cancelled_at = null
            where id = $1 returning *`,
          [current[0].id, plan.id, newEnd],
        ));
      } else {
        const start = todayStr();
        const end = addDays(addMonths(start, plan.duration_months), -1);
        ({ rows: [membership] } = await db.query(
          `insert into gym_v1.memberships (user_id, plan_id, status, start_date, end_date, auto_renew)
           values ($1, $2, 'active', $3, $4, $5) returning *`,
          [req.user.id, plan.id, start, end, Boolean(req.body.auto_renew)],
        ));
      }
    }
    const { rows: [payment] } = await db.query(
      `insert into gym_v1.payments
         (user_id, membership_id, plan_id, amount_cents, status, card_brand, card_last4,
          cardholder_name, reference, description, failure_reason)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
      [
        req.user.id,
        membership?.id ?? null,
        plan.id,
        plan.price_cents,
        result.ok ? 'succeeded' : 'failed',
        result.brand,
        result.last4,
        String(req.body.card_name).trim(),
        result.reference,
        `${action === 'renew' ? 'Renewal' : 'Purchase'}: ${plan.name}`,
        result.ok ? null : result.reason,
      ],
    );
    return { membership, payment, action };
  });

  await audit(req, result.ok ? `membership.${outcome.action}` : 'payment.failed', 'payment', outcome.payment.id, {
    plan: plan.name,
    amount_cents: plan.price_cents,
    reference: outcome.payment.reference,
    reason: result.ok ? undefined : result.reason,
  });

  if (!result.ok) {
    return res.status(402).json({ error: `Payment failed: ${result.reason}`, payment: outcome.payment });
  }

  sendEmail({
    to: req.user.email,
    subject: `Crunch Gym receipt ${outcome.payment.reference}`,
    text: `Hi ${req.user.full_name},\n\nThanks for your payment of EUR ${(plan.price_cents / 100).toFixed(2)} for ${plan.name}.\nYour membership is active until ${outcome.membership.end_date}.\n\nReference: ${outcome.payment.reference}`,
  });
  res.status(201).json(outcome);
});

// Member cancels own membership; admin can cancel any
router.post('/:id/cancel', requireAuth, async (req, res) => {
  const id = toInt(req.params.id);
  const m = await one('select * from gym_v1.memberships where id = $1', [id]);
  if (!m) throw notFound('Membership not found');
  if (req.user.role !== 'admin' && m.user_id !== req.user.id) throw forbidden();
  if (m.status !== 'active') throw badRequest('Only active memberships can be cancelled');
  const updated = await one(
    `update gym_v1.memberships set status = 'cancelled', cancelled_at = now(), auto_renew = false
      where id = $1 returning *`,
    [id],
  );
  await audit(req, 'membership.cancel', 'membership', id, { user_id: m.user_id });
  res.json(updated);
});

// Member toggles auto-renew on own membership
router.patch('/:id/auto-renew', requireAuth, async (req, res) => {
  const id = toInt(req.params.id);
  const m = await one('select * from gym_v1.memberships where id = $1', [id]);
  if (!m) throw notFound('Membership not found');
  if (req.user.role !== 'admin' && m.user_id !== req.user.id) throw forbidden();
  const updated = await one('update gym_v1.memberships set auto_renew = $2 where id = $1 returning *', [id, Boolean(req.body?.auto_renew)]);
  await audit(req, 'membership.auto_renew', 'membership', id, { auto_renew: updated.auto_renew });
  res.json(updated);
});

// ---- Admin CRUD ----------------------------------------------------------

router.get('/', requireRole('admin'), async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`m.status = $${params.length}`);
  }
  if (req.query.user_id) {
    params.push(toInt(req.query.user_id, 'user_id'));
    where.push(`m.user_id = $${params.length}`);
  }
  const { rows } = await query(
    `${SELECT} ${where.length ? `where ${where.join(' and ')}` : ''} order by m.created_at desc`,
    params,
  );
  res.json(rows);
});

router.get('/:id', requireAuth, async (req, res) => {
  const m = await one(`${SELECT} where m.id = $1`, [toInt(req.params.id)]);
  if (!m) throw notFound('Membership not found');
  if (req.user.role !== 'admin' && m.user_id !== req.user.id) throw forbidden();
  res.json(m);
});

// Admin: create a membership directly (e.g. complimentary), no payment
router.post('/', requireRole('admin'), async (req, res) => {
  requireFields(req.body, ['user_id', 'plan_id', 'start_date', 'end_date']);
  const b = req.body;
  const target = await one('select role from gym_v1.users where id = $1', [toInt(b.user_id, 'user_id')]);
  if (!target) throw notFound('User not found');
  if (target.role !== 'member') throw badRequest('Memberships can only be given to members');
  const m = await one(
    `insert into gym_v1.memberships (user_id, plan_id, status, start_date, end_date, auto_renew)
     values ($1, $2, coalesce($3, 'active'), $4, $5, coalesce($6, false)) returning *`,
    [b.user_id, b.plan_id, b.status || null, b.start_date, b.end_date, b.auto_renew ?? null],
  );
  await audit(req, 'membership.create', 'membership', m.id, b);
  res.status(201).json(m);
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  const id = toInt(req.params.id);
  const { sets, values } = buildUpdate(req.body, ['plan_id', 'status', 'start_date', 'end_date', 'auto_renew'], 2);
  if (!sets.length) throw badRequest('Nothing to update');
  if (req.body.status === 'cancelled') sets.push('cancelled_at = coalesce(cancelled_at, now())');
  const m = await one(`update gym_v1.memberships set ${sets.join(', ')} where id = $1 returning *`, [id, ...values]);
  if (!m) throw notFound('Membership not found');
  await audit(req, 'membership.update', 'membership', id, req.body);
  res.json(m);
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = toInt(req.params.id);
  const m = await one('delete from gym_v1.memberships where id = $1 returning *', [id]);
  if (!m) throw new HttpError(404, 'Membership not found');
  await audit(req, 'membership.delete', 'membership', id, { user_id: m.user_id });
  res.json({ ok: true });
});

export default router;
