import { Link } from 'react-router-dom';
import { useApi } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { date, dateTime } from '../../lib/format.js';
import { Badge, Card, Empty, PageHeader, Stat } from '../../components/ui.jsx';

export default function MemberDashboard() {
  const { user } = useAuth();
  const { data: memberships } = useApi('/memberships/mine');
  const { data: bookings } = useApi('/classes/bookings/mine');
  const { data: sessions } = useApi('/pt-sessions');
  const { data: visits } = useApi('/checkins/mine');
  const { data: trainer } = useApi('/assignments/mine');

  const current = memberships?.find((m) => m.is_current);
  const now = new Date();
  const upcomingClasses = (bookings || []).filter((b) => b.status === 'booked' && new Date(b.start_at) > now).reverse();
  const upcomingSessions = (sessions || []).filter((s) => s.status === 'booked' && new Date(s.start_at) > now).reverse();

  return (
    <div>
      <PageHeader title={`Hi ${user.full_name.split(' ')[0]} 👋`} subtitle="Here's what's coming up." />
      <div className="stats">
        <Stat
          label="Membership"
          value={current ? <Badge value="active" /> : <Badge value="inactive">None active</Badge>}
          hint={current ? `${current.plan_name} · until ${date(current.end_date)}` : <Link to="/membership">Choose a plan</Link>}
        />
        <Stat label="Upcoming classes" value={upcomingClasses.length} />
        <Stat label="Upcoming PT sessions" value={upcomingSessions.length} />
        <Stat label="Visits (last 50)" value={visits?.length ?? '–'} hint={visits?.[0] ? `Last: ${dateTime(visits[0].checked_in_at)}` : null} />
      </div>
      <div className="grid-2">
        <Card title="Your next classes" actions={<Link to="/classes" className="btn btn-sm">Book classes</Link>}>
          {upcomingClasses.length ? (
            <ul className="list">
              {upcomingClasses.slice(0, 5).map((b) => (
                <li key={b.id}>
                  <strong>{b.title}</strong>
                  <span className="muted">{dateTime(b.start_at)} · {b.room}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No classes booked.</Empty>
          )}
        </Card>
        <Card title="Personal training" actions={<Link to="/training" className="btn btn-sm">Book a session</Link>}>
          <p className="muted">
            Your trainer: <strong>{trainer?.trainer_name || 'not assigned yet'}</strong>
          </p>
          {upcomingSessions.length ? (
            <ul className="list">
              {upcomingSessions.slice(0, 5).map((s) => (
                <li key={s.id}>
                  <strong>{dateTime(s.start_at)}</strong>
                  <span className="muted">with {s.trainer_name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No upcoming sessions.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}
