import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { dateTime, time, weekday } from '../../lib/format.js';
import { Alert, Badge, Card, ConfirmButton, Empty, Loading, Modal, PageHeader } from '../../components/ui.jsx';

export default function Training() {
  const { user } = useAuth();
  const trainer = useApi('/assignments/mine');
  const slots = useApi('/availability');
  const sessions = useApi('/pt-sessions');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [booking, setBooking] = useState(null);
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState(null);

  const reload = () => {
    slots.reload();
    sessions.reload();
  };

  const confirmBooking = async () => {
    setError(null);
    try {
      await api('/pt-sessions', { method: 'POST', body: { availability_id: booking.id, member_notes: notes } });
      setMessage(`Session booked for ${dateTime(booking.start_at)}.`);
      setBooking(null);
      setNotes('');
      reload();
    } catch (e) {
      setError(e.message);
      setBooking(null);
    }
  };

  const cancel = async (s) => {
    setError(null);
    try {
      await api(`/pt-sessions/${s.id}/cancel`, { method: 'POST' });
      setMessage('Session cancelled.');
      reload();
    } catch (e) {
      setError(e.message);
    }
  };

  const saveNotes = async () => {
    try {
      await api(`/pt-sessions/${editing.id}`, { method: 'PUT', body: { member_notes: editing.member_notes } });
      setEditing(null);
      sessions.reload();
    } catch (e) {
      setError(e.message);
    }
  };

  if (trainer.loading) return <Loading />;

  const groups = [];
  for (const s of slots.data || []) {
    const key = new Date(s.start_at).toDateString();
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, label: weekday(s.start_at), items: [] }));
    g.items.push(s);
  }
  const now = new Date();

  return (
    <div>
      <PageHeader title="Personal training" subtitle="Book 1:1 sessions with your assigned trainer." />
      <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>
      <Alert onClose={() => setError(null)}>{error}</Alert>
      {!trainer.data ? (
        <Card>
          <Empty>You haven't been assigned a personal trainer yet. Our team will assign one soon.</Empty>
        </Card>
      ) : (
        <>
          <Card title={`Your trainer: ${trainer.data.trainer_name}`} actions={<Link to="/messages" className="btn btn-sm">Message</Link>}>
            <p className="muted small">{trainer.data.specialties}</p>
            <p>{trainer.data.bio}</p>
          </Card>
          <Card title="Available slots">
            {!user.membership_active && <Alert kind="info">You need an active membership to book sessions.</Alert>}
            {slots.loading && !slots.data ? (
              <Loading />
            ) : !groups.length ? (
              <Empty>No open slots right now. Check back soon.</Empty>
            ) : (
              groups.map((g) => (
                <div key={g.key} className="slot-day">
                  <h4>{g.label}</h4>
                  <div className="slot-row">
                    {g.items.map((s) => (
                      <button key={s.id} type="button" className="slot" onClick={() => setBooking(s)} disabled={!user.membership_active}>
                        {time(s.start_at)}–{time(s.end_at)}
                        {s.notes && <small>{s.notes}</small>}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </Card>
        </>
      )}
      <Card title="My sessions">
        {sessions.data?.length ? (
          <table className="table">
            <thead>
              <tr><th>When</th><th>Trainer</th><th>Your notes</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {sessions.data.map((s) => (
                <tr key={s.id}>
                  <td>{dateTime(s.start_at)}</td>
                  <td>{s.trainer_name}</td>
                  <td className="small">{s.member_notes}</td>
                  <td><Badge value={s.status} /></td>
                  <td className="actions">
                    {s.status === 'booked' && new Date(s.start_at) > now && (
                      <>
                        <button type="button" className="btn btn-sm" onClick={() => setEditing({ ...s })}>Edit notes</button>
                        <ConfirmButton className="btn btn-sm btn-danger" confirmText="Cancel session?" onConfirm={() => cancel(s)}>Cancel</ConfirmButton>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No sessions yet.</Empty>
        )}
      </Card>

      {booking && (
        <Modal title="Book this session?" onClose={() => setBooking(null)}>
          <p>
            <strong>{dateTime(booking.start_at)}</strong> – {time(booking.end_at)} with {booking.trainer_name}
          </p>
          <div className="field">
            <label htmlFor="pt-notes">Anything your trainer should know? (optional)</label>
            <textarea id="pt-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setBooking(null)}>Back</button>
            <button type="button" className="btn btn-primary" onClick={confirmBooking}>Confirm booking</button>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal title="Edit session notes" onClose={() => setEditing(null)}>
          <div className="field">
            <label htmlFor="edit-notes">Notes for your trainer</label>
            <textarea id="edit-notes" rows={4} value={editing.member_notes || ''} onChange={(e) => setEditing({ ...editing, member_notes: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={saveNotes}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
