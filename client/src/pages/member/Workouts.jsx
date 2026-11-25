import { useApi } from '../../lib/api.js';
import { date } from '../../lib/format.js';
import { Badge, Card, Empty, Loading, PageHeader } from '../../components/ui.jsx';

export default function Workouts() {
  const { data, error } = useApi('/workout-plans');
  return (
    <div>
      <PageHeader title="Workout plans" subtitle="Plans written for you by your trainer." />
      {error && <div className="alert alert-error">{error}</div>}
      {!data ? (
        <Loading />
      ) : !data.length ? (
        <Card>
          <Empty>Your trainer hasn't shared a workout plan yet.</Empty>
        </Card>
      ) : (
        data.map((p) => (
          <Card key={p.id} title={p.title} actions={<Badge value={p.is_active ? 'active' : 'inactive'} />}>
            <p className="muted small">
              By {p.trainer_name || 'your trainer'}
              {p.start_date && ` · from ${date(p.start_date)}`}
              {p.end_date && ` to ${date(p.end_date)}`}
            </p>
            {p.goal && (
              <p>
                <strong>Goal:</strong> {p.goal}
              </p>
            )}
            {p.description && <p>{p.description}</p>}
            {p.exercises && <pre className="exercises">{p.exercises}</pre>}
          </Card>
        ))
      )}
    </div>
  );
}
