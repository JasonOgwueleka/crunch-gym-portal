import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { money } from '../../lib/format.js';
import { Card, Empty, Loading, PageHeader, Alert } from '../../components/ui.jsx';
import TimetableList from '../../components/TimetableList.jsx';

export function Home() {
  const { user } = useAuth();
  const { data: plans } = useApi('/plans');
  return (
    <div>
      <section className="hero">
        <div>
          <h1>Train harder. Feel stronger.</h1>
          <p>
            Crunch Gym gives you a fully equipped gym floor, more than 25 group classes a week and personal trainers who
            build plans around you.
          </p>
          <div className="hero-actions">
            {!user && (
              <Link to="/register" className="btn btn-primary btn-lg">
                Become a member
              </Link>
            )}
            <Link to="/timetable" className="btn btn-lg">
              View class timetable
            </Link>
          </div>
        </div>
      </section>
      <div className="grid-3">
        <Card title="Group classes">
          <p className="muted">Spin, HIIT, yoga, Pilates, Boxfit and more. Book a place online in seconds.</p>
        </Card>
        <Card title="Personal training">
          <p className="muted">Get an assigned trainer, book 1:1 sessions and follow workout plans written for you.</p>
        </Card>
        <Card title="Track progress">
          <p className="muted">Log your weight and measurements, upload progress photos and message your trainer.</p>
        </Card>
      </div>
      <h2 className="section-title">Membership plans</h2>
      {plans ? <PlanGrid plans={plans} /> : <Loading />}
    </div>
  );
}

export function PlanGrid({ plans, renderAction }) {
  if (!plans.length) return <Empty>No plans available right now.</Empty>;
  return (
    <div className="plan-grid">
      {plans.map((p) => (
        <div key={p.id} className="plan">
          <h3>{p.name}</h3>
          <div className="plan-price">
            {money(p.price_cents)}
            <small> / {p.duration_months === 1 ? 'month' : `${p.duration_months} months`}</small>
          </div>
          <p className="muted">{p.description}</p>
          {p.features && (
            <ul className="plan-features">
              {p.features.split('\n').filter(Boolean).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          {renderAction && <div className="plan-action">{renderAction(p)}</div>}
        </div>
      ))}
    </div>
  );
}

export function Plans() {
  const { user } = useAuth();
  const { data, error } = useApi('/plans');
  return (
    <div>
      <PageHeader title="Membership plans" subtitle="Simple pricing with no joining fee." />
      <Alert>{error}</Alert>
      {data ? (
        <PlanGrid
          plans={data}
          renderAction={(p) =>
            !user ? (
              <Link to="/register" className="btn btn-primary btn-block">
                Join with {p.name}
              </Link>
            ) : user.role === 'member' ? (
              <Link to={`/membership?plan=${p.id}`} className="btn btn-primary btn-block">
                Choose plan
              </Link>
            ) : null
          }
        />
      ) : (
        <Loading />
      )}
    </div>
  );
}

export function Timetable() {
  const { user } = useAuth();
  const { data, error } = useApi('/classes');
  return (
    <div>
      <PageHeader
        title="Class timetable"
        subtitle="Upcoming group classes. Members can book from their Classes page."
        actions={
          user?.role === 'member' ? (
            <Link to="/classes" className="btn btn-primary">
              Book classes
            </Link>
          ) : !user ? (
            <Link to="/login" className="btn btn-primary">
              Log in to book
            </Link>
          ) : null
        }
      />
      <Alert>{error}</Alert>
      <Card>{data ? <TimetableList classes={data} /> : <Loading />}</Card>
    </div>
  );
}

export function Trainers() {
  const { data } = useApi('/trainers');
  return (
    <div>
      <PageHeader title="Our trainers" subtitle="Members are assigned a personal trainer by our team." />
      {!data ? (
        <Loading />
      ) : (
        <div className="grid-3">
          {data.map((t) => (
            <Card key={t.id} title={t.full_name}>
              <p className="muted small">{t.specialties}</p>
              <p>{t.bio}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotFound() {
  return (
    <Card title="Page not found">
      <p className="muted">That page does not exist.</p>
      <Link to="/" className="btn">
        Back home
      </Link>
    </Card>
  );
}

export function useFormState(initial) {
  const [values, setValues] = useState(initial);
  const bind = (name) => ({
    name,
    id: name,
    value: values[name],
    onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });
  return [values, bind, setValues];
}

export function useSubmit(fn) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return { submit, error, setError, busy };
}

export function useGoHome() {
  const navigate = useNavigate();
  return navigate;
}
