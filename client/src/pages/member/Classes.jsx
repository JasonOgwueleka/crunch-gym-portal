import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { dateTime } from '../../lib/format.js';
import { Alert, Badge, Card, ConfirmButton, Empty, Loading, PageHeader, Tabs } from '../../components/ui.jsx';
import TimetableList from '../../components/TimetableList.jsx';

export default function MemberClasses() {
  const { user } = useAuth();
  const timetable = useApi('/classes');
  const bookings = useApi('/classes/bookings/mine');
  const [tab, setTab] = useState('timetable');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const run = async (fn, ok) => {
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(ok);
      timetable.reload();
      bookings.reload();
    } catch (e) {
      setError(e.message);
    }
  };

  const book = (c) => run(() => api(`/classes/${c.id}/book`, { method: 'POST' }), `Booked: ${c.title} on ${dateTime(c.start_at)}`);
  const cancel = (classId, title) => run(() => api(`/classes/${classId}/book`, { method: 'DELETE' }), `Cancelled your booking for ${title}`);

  const now = new Date();
  const upcoming = (bookings.data || []).filter((b) => new Date(b.start_at) > now);
  const past = (bookings.data || []).filter((b) => new Date(b.start_at) <= now);

  return (
    <div>
      <PageHeader title="Group classes" subtitle="Book a place in any upcoming class." />
      {!user.membership_active && (
        <Alert kind="info">
          You need an active membership to book classes. <Link to="/membership">Choose a plan</Link>.
        </Alert>
      )}
      <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>
      <Alert onClose={() => setError(null)}>{error}</Alert>
      <Tabs
        tabs={[
          { id: 'timetable', label: 'Timetable' },
          { id: 'mine', label: 'My bookings', count: upcoming.filter((b) => b.status === 'booked').length },
          { id: 'history', label: 'History' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <Card>
        {tab === 'timetable' &&
          (timetable.data ? (
            <TimetableList
              classes={timetable.data}
              renderAction={(c) =>
                c.my_booking_status === 'booked' ? (
                  <ConfirmButton className="btn btn-sm" confirmText="Cancel booking?" onConfirm={() => cancel(c.id, c.title)}>
                    Cancel
                  </ConfirmButton>
                ) : c.status === 'scheduled' && new Date(c.start_at) > now ? (
                  <button type="button" className="btn btn-primary btn-sm" disabled={c.booked_count >= c.capacity} onClick={() => book(c)}>
                    {c.booked_count >= c.capacity ? 'Full' : 'Book'}
                  </button>
                ) : null
              }
            />
          ) : (
            <Loading />
          ))}
        {tab !== 'timetable' &&
          (() => {
            const list = tab === 'mine' ? upcoming : past;
            if (!list.length) return <Empty>No bookings.</Empty>;
            return (
              <table className="table">
                <thead>
                  <tr><th>Class</th><th>When</th><th>Trainer</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {list.map((b) => (
                    <tr key={b.id}>
                      <td>{b.title}<div className="muted small">{b.room}</div></td>
                      <td>{dateTime(b.start_at)}</td>
                      <td>{b.trainer_name}</td>
                      <td><Badge value={b.class_status === 'cancelled' ? 'cancelled' : b.status} /></td>
                      <td className="actions">
                        {tab === 'mine' && b.status === 'booked' && (
                          <ConfirmButton className="btn btn-sm" confirmText="Cancel booking?" onConfirm={() => cancel(b.class_id, b.title)}>
                            Cancel
                          </ConfirmButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
      </Card>
    </div>
  );
}
