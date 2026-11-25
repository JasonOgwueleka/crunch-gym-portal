import { time, weekday } from '../lib/format.js';
import { Badge, Empty } from './ui.jsx';

/** Classes grouped by day. `renderAction(cls)` adds a button per class (e.g. Book). */
export default function TimetableList({ classes, renderAction }) {
  if (!classes?.length) return <Empty>No classes scheduled for this period.</Empty>;
  const groups = [];
  for (const c of classes) {
    const key = new Date(c.start_at).toDateString();
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, label: weekday(c.start_at), items: [] }));
    g.items.push(c);
  }
  return (
    <div className="timetable">
      {groups.map((g) => (
        <div key={g.key} className="tt-day">
          <h3>{g.label}</h3>
          <ul className="tt-list">
            {g.items.map((c) => {
              const spaces = c.capacity - c.booked_count;
              return (
                <li key={c.id} className={`tt-item ${c.status === 'cancelled' ? 'tt-cancelled' : ''}`}>
                  <div className="tt-time">
                    {time(c.start_at)}
                    <small>{time(c.end_at)}</small>
                  </div>
                  <div className="tt-main">
                    <div className="tt-title">
                      {c.title} {c.status !== 'scheduled' && <Badge value={c.status} />}
                      {c.my_booking_status && c.my_booking_status !== 'cancelled' && <Badge value={c.my_booking_status}>You're {c.my_booking_status}</Badge>}
                    </div>
                    <div className="muted small">
                      {c.trainer_name || 'TBC'} · {c.room || 'Studio'}
                      {c.description ? ` · ${c.description}` : ''}
                    </div>
                  </div>
                  <div className="tt-spaces">
                    <span className={spaces <= 0 ? 'text-red' : spaces <= 3 ? 'text-amber' : 'muted'}>
                      {spaces <= 0 ? 'Full' : `${spaces} of ${c.capacity} spaces`}
                    </span>
                  </div>
                  {renderAction && <div className="tt-action">{renderAction(c)}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
