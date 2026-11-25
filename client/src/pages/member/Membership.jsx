import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, useApi } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { date, dateTime, money } from '../../lib/format.js';
import { Alert, Badge, Card, ConfirmButton, Empty, Loading, Modal, PageHeader } from '../../components/ui.jsx';
import { PlanGrid } from '../public/PublicPages.jsx';

export default function Membership() {
  const { refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data: plans } = useApi('/plans');
  const memberships = useApi('/memberships/mine');
  const payments = useApi('/payments/mine');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const current = memberships.data?.find((m) => m.is_current);
  const checkoutPlan = plans?.find((p) => String(p.id) === params.get('plan'));

  const reloadAll = () => {
    memberships.reload();
    payments.reload();
    refresh();
  };

  const cancel = async (m) => {
    setError(null);
    try {
      await api(`/memberships/${m.id}/cancel`, { method: 'POST' });
      setMessage('Your membership has been cancelled.');
      reloadAll();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleAutoRenew = async (m) => {
    await api(`/memberships/${m.id}/auto-renew`, { method: 'PATCH', body: { auto_renew: !m.auto_renew } });
    memberships.reload();
  };

  return (
    <div>
      <PageHeader title="Membership" subtitle="Buy, renew or cancel your membership. Payments are simulated." />
      <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>
      <Alert onClose={() => setError(null)}>{error}</Alert>

      <Card title="Current membership">
        {memberships.loading && !memberships.data ? (
          <Loading />
        ) : current ? (
          <div className="current-membership">
            <div>
              <h3>{current.plan_name} <Badge value="active" /></h3>
              <p className="muted">
                {date(current.start_date)} – {date(current.end_date)}
              </p>
              <label className="checkbox">
                <input type="checkbox" checked={current.auto_renew} onChange={() => toggleAutoRenew(current)} />
                <span>Auto-renew at the end of the term</span>
              </label>
            </div>
            <div className="row-actions">
              <button type="button" className="btn btn-primary" onClick={() => setParams({ plan: current.plan_id })}>
                Renew
              </button>
              <ConfirmButton className="btn btn-danger" confirmText="Click again to cancel" onConfirm={() => cancel(current)}>
                Cancel membership
              </ConfirmButton>
            </div>
          </div>
        ) : (
          <Empty>You don't have an active membership. Choose a plan below to get started.</Empty>
        )}
      </Card>

      <h2 className="section-title">{current ? 'Renew or switch plan' : 'Choose a plan'}</h2>
      {plans ? (
        <PlanGrid
          plans={plans}
          renderAction={(p) => (
            <button type="button" className="btn btn-primary btn-block" onClick={() => setParams({ plan: p.id })}>
              {current ? (current.plan_id === p.id ? 'Renew' : 'Switch & renew') : 'Buy'} – {money(p.price_cents)}
            </button>
          )}
        />
      ) : (
        <Loading />
      )}

      <div className="grid-2 mt">
        <Card title="Membership history">
          {memberships.data?.length ? (
            <table className="table">
              <thead>
                <tr><th>Plan</th><th>Dates</th><th>Status</th></tr>
              </thead>
              <tbody>
                {memberships.data.map((m) => (
                  <tr key={m.id}>
                    <td>{m.plan_name}</td>
                    <td>{date(m.start_date)} – {date(m.end_date)}</td>
                    <td><Badge value={m.is_current ? 'active' : m.status === 'active' ? 'expired' : m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty />
          )}
        </Card>
        <Card title="Payments">
          {payments.data?.length ? (
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {payments.data.map((p) => (
                  <tr key={p.id}>
                    <td>{dateTime(p.created_at)}</td>
                    <td>
                      {p.description}
                      <div className="muted small">{p.card_brand} •••• {p.card_last4} · {p.reference}</div>
                    </td>
                    <td>
                      {money(p.amount_cents)}
                      {p.refunded_cents > 0 && <div className="small text-purple">−{money(p.refunded_cents)} refunded</div>}
                    </td>
                    <td><Badge value={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>No payments yet.</Empty>
          )}
        </Card>
      </div>

      {checkoutPlan && (
        <Checkout
          plan={checkoutPlan}
          renewing={Boolean(current)}
          onClose={() => setParams({})}
          onPaid={(result) => {
            setParams({});
            setMessage(
              `Payment ${result.payment.reference} approved. Your membership is active until ${date(result.membership.end_date)}.`,
            );
            reloadAll();
          }}
          onFailed={() => payments.reload()}
        />
      )}
    </div>
  );
}

function Checkout({ plan, renewing, onClose, onPaid, onFailed }) {
  const { user } = useAuth();
  const [card, setCard] = useState({ card_name: user.full_name, card_number: '', expiry: '', cvc: '', auto_renew: false });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setCard((c) => ({ ...c, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const pay = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api('/memberships/checkout', { method: 'POST', body: { plan_id: plan.id, ...card } });
      onPaid(result);
    } catch (err) {
      setError(err.message);
      onFailed();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`${renewing ? 'Renew' : 'Buy'}: ${plan.name}`} onClose={onClose}>
      <form className="form" onSubmit={pay}>
        <div className="checkout-summary">
          <span>{plan.name} ({plan.duration_months} month{plan.duration_months > 1 ? 's' : ''})</span>
          <strong>{money(plan.price_cents)}</strong>
        </div>
        <Alert kind="info">
          This is a simulated payment. Use any card number, e.g. <code>4242 4242 4242 4242</code>. Numbers ending in{' '}
          <code>0002</code> are declined and <code>9995</code> have insufficient funds.
        </Alert>
        <Alert>{error}</Alert>
        <div className="field">
          <label htmlFor="card_name">Name on card</label>
          <input id="card_name" required value={card.card_name} onChange={set('card_name')} autoComplete="cc-name" />
        </div>
        <div className="field">
          <label htmlFor="card_number">Card number</label>
          <input id="card_number" required inputMode="numeric" placeholder="4242 4242 4242 4242" value={card.card_number} onChange={set('card_number')} autoComplete="cc-number" />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="expiry">Expiry (MM/YY)</label>
            <input id="expiry" required placeholder="12/29" value={card.expiry} onChange={set('expiry')} autoComplete="cc-exp" />
          </div>
          <div className="field">
            <label htmlFor="cvc">CVC</label>
            <input id="cvc" required inputMode="numeric" placeholder="123" value={card.cvc} onChange={set('cvc')} autoComplete="cc-csc" />
          </div>
        </div>
        {!renewing && (
          <label className="checkbox">
            <input type="checkbox" checked={card.auto_renew} onChange={set('auto_renew')} />
            <span>Auto-renew at the end of the term</span>
          </label>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Processing…' : `Pay ${money(plan.price_cents)}`}</button>
        </div>
      </form>
    </Modal>
  );
}
