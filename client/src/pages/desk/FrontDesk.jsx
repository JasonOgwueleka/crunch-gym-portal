import { useEffect, useState } from 'react';
import { api, useApi } from '../../lib/api.js';
import { date, dateTime, time, todayInput } from '../../lib/format.js';
import { Alert, Badge, Card, ConfirmButton, Empty, Loading, Modal, PageHeader } from '../../components/ui.jsx';

export default function FrontDesk() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [day, setDay] = useState(todayInput());
  const checkins = useApi(`/checkins?date=${day}`);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [override, setOverride] = useState(null);
  const [editing, setEditing] = useState(null);

  const search = async (term = q) => {
    setErr(null);
    try {
      setResults(await api(`/checkins/members?q=${encodeURIComponent(term)}`));
    } catch (e) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => search(q), 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkIn = async (m, force = false, notes = '') => {
    setErr(null);
    setMsg(null);
    try {
      await api('/checkins', { method: 'POST', body: { member_id: m.id, override: force, notes } });
      setMsg(`${m.full_name} checked in at ${time(new Date())}.`);
      setOverride(null);
      checkins.reload();
      search(q);
    } catch (e) {
      if (e.status === 409) setOverride(m);
      else setErr(e.message);
    }
  };

  return (
    <div>
      <PageHeader title="Front desk" subtitle="Find a member, check their membership and check them in." />
      <Alert kind="success" onClose={() => setMsg(null)}>{msg}</Alert>
      <Alert onClose={() => setErr(null)}>{err}</Alert>
      <Card title="Find member">
        <input
          className="search search-lg"
          type="search"
          autoFocus
          placeholder="Search by name, email, phone or member ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {!results ? (
          <Loading />
        ) : !results.length ? (
          <Empty>No members match “{q}”.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>ID</th><th>Member</th><th>Membership</th><th>Plan / expires</th><th>Last visit</th><th /></tr>
            </thead>
            <tbody>
              {results.map((m) => (
                <tr key={m.id} className={m.membership_active ? '' : 'row-warn'}>
                  <td className="muted">#{m.id}</td>
                  <td><strong>{m.full_name}</strong><div className="muted small">{m.email} · {m.phone}</div></td>
                  <td>
                    {!m.is_active ? (
                      <Badge tone="red">Account disabled</Badge>
                    ) : m.membership_active ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="red">Not active</Badge>
                    )}
                  </td>
                  <td className="small">{m.plan_name ? `${m.plan_name} · ${date(m.end_date)}` : '—'}</td>
                  <td className="small">{dateTime(m.last_check_in) || '—'}</td>
                  <td className="actions">
                    <button type="button" className={`btn btn-sm ${m.membership_active ? 'btn-primary' : ''}`} disabled={!m.is_active} onClick={() => checkIn(m)}>
                      Check in
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card
        title="Check-ins"
        actions={<input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day" />}
      >
        {!checkins.data ? (
          <Loading />
        ) : !checkins.data.length ? (
          <Empty>No check-ins on this day.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Time</th><th>Member</th><th>Membership</th><th>Checked in by</th><th>Notes</th><th className="actions-col">Actions</th></tr>
            </thead>
            <tbody>
              {checkins.data.map((c) => (
                <tr key={c.id}>
                  <td>{time(c.checked_in_at)}</td>
                  <td>{c.member_name}</td>
                  <td><Badge tone={c.membership_active ? 'green' : 'red'}>{c.membership_active ? 'Active' : 'Override'}</Badge></td>
                  <td className="small">{c.checked_in_by_name}</td>
                  <td className="small">{c.notes}</td>
                  <td className="actions">
                    <button type="button" className="btn btn-sm" onClick={() => setEditing({ ...c })}>Notes</button>
                    <ConfirmButton onConfirm={async () => { await api(`/checkins/${c.id}`, { method: 'DELETE' }); checkins.reload(); }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {override && <OverrideModal member={override} onClose={() => setOverride(null)} onConfirm={(notes) => checkIn(override, true, notes)} />}
      {editing && (
        <Modal title={`Notes for ${editing.member_name}`} onClose={() => setEditing(null)}>
          <div className="field">
            <label htmlFor="ci-notes">Notes</label>
            <textarea id="ci-notes" rows={3} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                await api(`/checkins/${editing.id}`, { method: 'PUT', body: { notes: editing.notes } });
                setEditing(null);
                checkins.reload();
              }}
            >
              Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function OverrideModal({ member, onClose, onConfirm }) {
  const [notes, setNotes] = useState('');
  return (
    <Modal title="No active membership" onClose={onClose}>
      <Alert kind="info">
        <strong>{member.full_name}</strong> does not have an active membership
        {member.plan_name ? ` (last plan: ${member.plan_name}, ended ${date(member.end_date)})` : ''}. Ask them to renew at the
        desk or online, or record a one-off override.
      </Alert>
      <div className="field">
        <label htmlFor="override-notes">Reason for override</label>
        <input id="override-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Day pass paid in cash" />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Don't check in</button>
        <button type="button" className="btn btn-danger" onClick={() => onConfirm(notes)}>Check in anyway</button>
      </div>
    </Modal>
  );
}
