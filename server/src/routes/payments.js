import { Router } from 'express';
import { query, one, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { badRequest, notFound, forbidden, toInt, buildUpdate } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { sendEmail } from '../utils/mailer.js';

const router = Router();

const SELECT = `
  select pay.*, u.full_name as member_name, u.email as member_email, p.name as plan_name,
         coalesce((select sum(r.amount_cents) from gym_v0.refunds r where r.payment_id = pay.id), 0)::int as refunded_cents
    from gym_v0.payments pay
    left join gym_v0.users u on u.id = pay.user_id
    left join gym_v0.membership_plans p on p.id = pay.plan_id`;

router.get('/mine', requireAuth, async (req, res) => {
  const { rows } = await query(`${SELECT} where pay.user_id = $1 order by pay.created_at desc`, [req.user.id]);
  res.json(rows);
});

// ---- Refunds (admin) ------------------------------------------------------
// Declared before /:id so that "/refunds" is not treated as a payment id.

router.get('/refunds', requireRole('admin'), async (req, res) => {
  const { rows } = await query(
    `select r.*, pay.reference, pay.amount_cents as payment_amount_cents,
            u.full_name as member_name, a.full_name as issued_by_name
       from gym_v0.refunds r
       join gym_v0.payments pay on pay.id = r.payment_id
       left join gym_v0.users u on u.id = pay.user_id
       left join gym_v0.users a on a.id = r.issued_by
      order by r.created_at desc`,
  );
  res.json(rows);
});

router.put('/refunds/:refundId', requireRole('admin'), async (req, res) => {
  const id = toInt(req.params.refundId);
  const r = await one('update gym_v0.refunds set reason = $2 where id = $1 returning *', [id, req.body?.reason ?? null]);
  if (!r) throw notFound('Refund not found');
  await audit(req, 'refund.update', 'refund', id, { reason: r.reason });
  res.json(r);
});

// Voiding a refund removes it and recalculates the payment status
router.delete('/refunds/:refundId', requireRole('admin'), async (req, res) => {
  const id = toInt(req.params.refundId);
  const r = await withTransaction(async (db) => {
    const { rows } = await db.query('delete from gym_v0.refunds where id = $1 returning *', [id]);
    if (!rows[0]) throw notFound('Refund not found');
    await recalcPaymentStatus(db, rows[0].payment_id);
    return rows[0];
  });
  await audit(req, 'refund.void', 'refund', id, { payment_id: r.payment_id, amount_cents: r.amount_cents });
  res.json({ ok: true });
});

// ---- Payments (admin) -----------------------------------------------------

router.get('/', requireRole('admin'), async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.status) {
    params.push(req.query.status);
    where.push(`pay.status = $${params.length}`);
  }
  if (req.query.user_id) {
    params.push(toInt(req.query.user_id, 'user_id'));
    where.push(`pay.user_id = $${params.length}`);
  }
  const { rows } = await query(
    `${SELECT} ${where.length ? `where ${where.join(' and ')}` : ''} order by pay.created_at desc`,
    params,
  );
  res.json(rows);
});

router.get('/:id', requireAuth, async (req, res) => {
  const pay = await one(`${SELECT} where pay.id = $1`, [toInt(req.params.id)]);
  if (!pay) throw notFound('Payment not found');
  if (req.user.role !== 'admin' && pay.user_id !== req.user.id) throw forbidden();
  const { rows: refunds } = await query('select * from gym_v0.refunds where payment_id = $1 order by created_at', [pay.id]);
  res.json({ ...pay, refunds });
});

// Admin can correct a payment's description or status
router.put('/:id', requireRole('admin'), async (req, res) => {
  const id = toInt(req.params.id);
  const { sets, values } = buildUpdate(req.body, ['description', 'status', 'cardholder_name'], 2);
  if (!sets.length) throw badRequest('Nothing to update');
  const pay = await one(`update gym_v0.payments set ${sets.join(', ')} where id = $1 returning *`, [id, ...values]);
  if (!pay) throw notFound('Payment not found');
  await audit(req, 'payment.update', 'payment', id, req.body);
  res.json(pay);
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = toInt(req.params.id);
  const pay = await one('delete from gym_v0.payments where id = $1 returning *', [id]);
  if (!pay) throw notFound('Payment not found');
  await audit(req, 'payment.delete', 'payment', id, { reference: pay.reference, amount_cents: pay.amount_cents });
  res.json({ ok: true });
});

/**
 * Admin issues a (simulated) refund. Defaults to the full remaining amount.
 * Optionally ends the linked membership.
 */
router.post('/:id/refund', requireRole('admin'), async (req, res) => {
  const id = toInt(req.params.id);
  const b = req.body || {};
  const outcome = await withTransaction(async (db) => {
    const { rows } = await db.query('select * from gym_v0.payments where id = $1 for update', [id]);
    const pay = rows[0];
    if (!pay) throw notFound('Payment not found');
    if (!['succeeded', 'partially_refunded'].includes(pay.status)) throw badRequest('Only successful payments can be refunded');
    const { rows: [sum] } = await db.query(
      'select coalesce(sum(amount_cents), 0)::int as refunded from gym_v0.refunds where payment_id = $1',
      [id],
    );
    const remaining = pay.amount_cents - sum.refunded;
    const amount = b.amount_cents === undefined || b.amount_cents === '' || b.amount_cents === null
      ? remaining
      : Number(b.amount_cents);
    if (!Number.isInteger(amount) || amount <= 0) throw badRequest('Refund amount must be a positive number of cents');
    if (amount > remaining) throw badRequest(`Refund cannot exceed the remaining ${(remaining / 100).toFixed(2)}`);

    const { rows: [refund] } = await db.query(
      `insert into gym_v0.refunds (payment_id, amount_cents, reason, issued_by)
       values ($1, $2, $3, $4) returning *`,
      [id, amount, b.reason || null, req.user.id],
    );
    await recalcPaymentStatus(db, id);
    if (b.cancel_membership && pay.membership_id) {
      await db.query(
        `update gym_v0.memberships set status = 'refunded', cancelled_at = now(), auto_renew = false where id = $1`,
        [pay.membership_id],
      );
    }
    const { rows: [user] } = await db.query('select email, full_name from gym_v0.users where id = $1', [pay.user_id]);
    return { refund, pay, user };
  });

  await audit(req, 'refund.issue', 'payment', id, {
    refund_id: outcome.refund.id,
    amount_cents: outcome.refund.amount_cents,
    reason: outcome.refund.reason,
    cancel_membership: Boolean(b.cancel_membership),
  });
  if (outcome.user) {
    sendEmail({
      to: outcome.user.email,
      subject: `Refund issued for ${outcome.pay.reference}`,
      text: `Hi ${outcome.user.full_name},\n\nWe have refunded EUR ${(outcome.refund.amount_cents / 100).toFixed(2)} to your card ending ${outcome.pay.card_last4}.\nReason: ${outcome.refund.reason || 'n/a'}`,
    });
  }
  res.status(201).json(outcome.refund);
});

async function recalcPaymentStatus(db, paymentId) {
  await db.query(
    `update gym_v0.payments pay set status = case
        when r.total = 0 then 'succeeded'
        when r.total >= pay.amount_cents then 'refunded'
        else 'partially_refunded' end
       from (select coalesce(sum(amount_cents), 0) as total from gym_v0.refunds where payment_id = $1) r
      where pay.id = $1 and pay.status <> 'failed'`,
    [paymentId],
  );
}

export default router;
