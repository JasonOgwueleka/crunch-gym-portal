import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, useApi } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { date, dateTime, time, titleCase } from '../../lib/format.js';
import CrudPage from '../../components/CrudPage.jsx';
import EntityForm from '../../components/EntityForm.jsx';
import { Alert, Badge, Card, ConfirmButton, Empty, Loading, Modal, PageHeader, Stat, Tabs, YesNo } from '../../components/ui.jsx';
import { HealthSummary } from '../member/Health.jsx';
import { LOG_COLUMNS, PhotoGrid, WeightChart } from '../member/Progress.jsx';

// ---------------------------------------------------------------------------
export function TrainerHome() {
  const { user } = useAuth();
  const { data: clients } = useApi('/clients');
  const { data: sessions } = useApi('/pt-sessions');
  const { data: classes } = useApi('/classes?mine=1');
  const { data: certs } = useApi('/certifications');
  const now = new Date();
  const upcoming = (sessions || []).filter((s) => s.status === 'booked' && new Date(s.start_at) > now).reverse();
  return (
    <div>
      <PageHeader title={`Welcome, ${user.full_name.split(' ')[0]}`} subtitle="Your clients, sessions and classes at a glance." />
      <div className="stats">
        <Stat label="Assigned clients" value={clients?.length ?? '–'} />
        <Stat label="Upcoming PT sessions" value={upcoming.length} />
        <Stat label="Upcoming classes" value={classes?.filter((c) => c.status === 'scheduled').length ?? '–'} />
        <Stat label="Pending certifications" value={certs?.filter((c) => c.status === 'pending').length ?? '–'} />
      </div>
      <div className="grid-2">
        <Card title="Next PT sessions" actions={<Link to="/trainer/sessions" className="btn btn-sm">All sessions</Link>}>
          {upcoming.length ? (
            <ul className="list">
              {upcoming.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <strong>{dateTime(s.start_at)}</strong>
                  <Link to={`/trainer/clients/${s.member_id}`}>{s.member_name}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No upcoming sessions.</Empty>
          )}
        </Card>
        <Card title="Your next classes" actions={<Link to="/trainer/classes" className="btn btn-sm">My classes</Link>}>
          {classes?.length ? (
            <ul className="list">
              {classes.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <strong>{c.title}</strong>
                  <span className="muted">{dateTime(c.start_at)} · {c.booked_count}/{c.capacity}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No upcoming classes.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function ClientList() {
  const { data, error } = useApi('/clients');
  return (
    <div>
      <PageHeader title="My clients" subtitle="Members assigned to you by the gym." />
      <Alert>{error}</Alert>
      <Card>
        {!data ? (
          <Loading />
        ) : !data.length ? (
          <Empty>No clients have been assigned to you yet.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Contact</th><th>Membership</th><th>Questionnaire</th><th>Last progress</th><th>Next session</th><th /></tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/trainer/clients/${c.id}`}><strong>{c.full_name}</strong></Link></td>
                  <td className="small">{c.email}<div className="muted">{c.phone}</div></td>
                  <td><Badge value={c.membership_active ? 'active' : 'inactive'} /></td>
                  <td><YesNo value={c.has_questionnaire} yes="On file" no="Missing" /></td>
                  <td>{date(c.last_progress_on) || '—'}</td>
                  <td>{dateTime(c.next_session_at) || '—'}</td>
                  <td className="actions">
                    <Link className="btn btn-sm" to={`/trainer/clients/${c.id}`}>Open</Link>
                    <Link className="btn btn-sm" to={`/messages?with=${c.id}`}>Message</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

const PLAN_FIELDS = [
  { name: 'title', label: 'Title', required: true, wide: true },
  { name: 'goal', label: 'Goal' },
  { name: 'is_active', label: 'Active plan', type: 'checkbox', default: true },
  { name: 'start_date', label: 'Start date', type: 'date' },
  { name: 'end_date', label: 'End date', type: 'date' },
  { name: 'description', label: 'Description', type: 'textarea', wide: true, rows: 3 },
  { name: 'exercises', label: 'Exercises (one per line)', type: 'textarea', wide: true, rows: 8 },
];

export function ClientDetail() {
  const { memberId } = useParams();
  const { data, error, reload } = useApi(`/clients/${memberId}`);
  const [tab, setTab] = useState('overview');
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Loading />;
  const { member } = data;
  const sessionOptions = data.pt_sessions.map((s) => ({ value: s.id, label: `${dateTime(s.start_at)} (${titleCase(s.status)})` }));

  return (
    <div>
      <PageHeader
        title={member.full_name}
        subtitle={`${member.email}${member.phone ? ` · ${member.phone}` : ''}`}
        actions={<Link to={`/messages?with=${member.id}`} className="btn">Message</Link>}
      />
      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'plans', label: 'Workout plans', count: data.workout_plans.length },
          { id: 'notes', label: 'Session notes', count: data.session_notes.length },
          { id: 'progress', label: 'Progress', count: data.progress_logs.length },
          { id: 'health', label: 'Health' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'overview' && (
        <div className="grid-2">
          <Card title="Member">
            <dl className="dl">
              <div><dt>Membership</dt><dd><Badge value={member.membership_active ? 'active' : 'inactive'} /></dd></div>
              <div><dt>Date of birth</dt><dd>{date(member.date_of_birth) || '—'}</dd></div>
              <div><dt>Assigned to you</dt><dd>{date(member.assigned_at)}</dd></div>
              <div><dt>Assignment notes</dt><dd>{member.assignment_notes || '—'}</dd></div>
            </dl>
          </Card>
          <Card title="PT sessions">
            {data.pt_sessions.length ? (
              <ul className="list">
                {data.pt_sessions.slice(0, 8).map((s) => (
                  <li key={s.id}>
                    <strong>{dateTime(s.start_at)}</strong> <Badge value={s.status} />
                    {s.member_notes && <span className="muted small">“{s.member_notes}”</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No sessions yet.</Empty>
            )}
          </Card>
        </div>
      )}
      {tab === 'plans' && (
        <CrudPage
          embedded
          title="Workout plans"
          endpoint="/workout-plans"
          listUrl={`/workout-plans?member_id=${member.id}`}
          createLabel="New plan"
          fields={PLAN_FIELDS}
          toPayload={(v) => ({ ...v, member_id: member.id })}
          columns={[
            { key: 'title', label: 'Title', render: (r) => <><strong>{r.title}</strong><div className="muted small">{r.goal}</div></> },
            { key: 'dates', label: 'Dates', render: (r) => `${date(r.start_date) || '—'} → ${date(r.end_date) || 'ongoing'}` },
            { key: 'is_active', label: 'Status', render: (r) => <Badge value={r.is_active ? 'active' : 'inactive'} /> },
            { key: 'updated_at', label: 'Updated', render: (r) => dateTime(r.updated_at) },
          ]}
          emptyText="No workout plans yet."
        />
      )}
      {tab === 'notes' && (
        <CrudPage
          embedded
          title="Session notes"
          endpoint="/session-notes"
          listUrl={`/session-notes?member_id=${member.id}`}
          createLabel="New note"
          fields={[
            { name: 'title', label: 'Title', required: true, wide: true },
            { name: 'pt_session_id', label: 'Related session', type: 'select', options: sessionOptions, wide: true },
            { name: 'content', label: 'Notes', type: 'textarea', required: true, wide: true, rows: 6 },
          ]}
          toPayload={(v) => ({ ...v, member_id: member.id, pt_session_id: v.pt_session_id || null })}
          columns={[
            { key: 'title', label: 'Title', render: (r) => <strong>{r.title}</strong> },
            { key: 'content', label: 'Notes', render: (r) => <span className="pre small">{r.content}</span> },
            { key: 'session_start_at', label: 'Session', render: (r) => dateTime(r.session_start_at) || '—' },
            { key: 'created_at', label: 'Written', render: (r) => dateTime(r.created_at) },
          ]}
          emptyText="No notes yet."
        />
      )}
      {tab === 'progress' && (
        <>
          <Card title="Weight trend">
            {data.progress_logs.length >= 2 ? <WeightChart logs={data.progress_logs} /> : <Empty>Not enough data yet.</Empty>}
          </Card>
          <Card title="Progress log">
            {data.progress_logs.length ? (
              <table className="table">
                <thead><tr>{LOG_COLUMNS.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {data.progress_logs.map((r) => (
                    <tr key={r.id}>{LOG_COLUMNS.map((c) => <td key={c.key}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>No entries yet.</Empty>
            )}
          </Card>
          <Card title="Progress photos">
            <PhotoGrid photos={data.progress_photos} />
          </Card>
        </>
      )}
      {tab === 'health' && (
        <Card title="Health questionnaire">
          <HealthSummary q={data.health} />
        </Card>
      )}
      <button type="button" className="btn btn-ghost mt" onClick={reload}>Refresh</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function Availability() {
  return (
    <CrudPage
      title="Availability"
      subtitle="Add the times members can book personal training with you. Booked slots can't be edited."
      endpoint="/availability"
      createLabel="Add slot"
      fields={[
        { name: 'start_at', label: 'Start', type: 'datetime', required: true },
        { name: 'end_at', label: 'End', type: 'datetime', required: true },
        { name: 'notes', label: 'Notes', wide: true },
      ]}
      columns={[
        { key: 'start_at', label: 'Date', render: (r) => new Date(r.start_at).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' }) },
        { key: 'time', label: 'Time', render: (r) => `${time(r.start_at)}–${time(r.end_at)}` },
        { key: 'notes', label: 'Notes' },
        {
          key: 'status',
          label: 'Status',
          render: (r) =>
            r.session_id ? (
              <span><Badge value={r.session_status} /> {r.member_name}</span>
            ) : new Date(r.end_at) < new Date() ? (
              <Badge value="expired">Past</Badge>
            ) : (
              <Badge tone="green">Open</Badge>
            ),
        },
      ]}
      canEdit={(r) => !r.session_id}
      canDelete={(r) => r.session_status !== 'booked'}
      emptyText="You have no availability set. Add a slot so members can book you."
    />
  );
}

// ---------------------------------------------------------------------------
export function TrainerSessions({ admin = false }) {
  const { data, error, reload } = useApi('/pt-sessions');
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [creating, setCreating] = useState(false);
  const members = useApi(admin ? '/users?role=member' : null);
  const trainers = useApi(admin ? '/trainers' : null);
  const [filter, setFilter] = useState('upcoming');

  const act = async (fn, ok) => {
    setErr(null);
    try {
      await fn();
      setMsg(ok);
      reload();
    } catch (e) {
      setErr(e.message);
    }
  };
  const setStatus = (s, status) => act(() => api(`/pt-sessions/${s.id}`, { method: 'PUT', body: { status } }), `Marked as ${titleCase(status)}.`);
  const now = new Date();
  const list = (data || []).filter((s) => (filter === 'upcoming' ? new Date(s.end_at) >= now : filter === 'past' ? new Date(s.end_at) < now : true));

  return (
    <div>
      <PageHeader
        title="PT sessions"
        subtitle={admin ? 'All personal training sessions.' : 'Sessions members have booked with you.'}
        actions={admin && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>+ New session</button>}
      />
      <Alert kind="success" onClose={() => setMsg(null)}>{msg}</Alert>
      <Alert onClose={() => setErr(null)}>{err || error}</Alert>
      <Tabs tabs={[{ id: 'upcoming', label: 'Upcoming' }, { id: 'past', label: 'Past' }, { id: 'all', label: 'All' }]} active={filter} onChange={setFilter} />
      <Card>
        {!data ? (
          <Loading />
        ) : !list.length ? (
          <Empty>No sessions.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>When</th>{admin && <th>Trainer</th>}<th>Member</th><th>Member notes</th><th>Status</th><th className="actions-col">Actions</th></tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>{dateTime(s.start_at)}–{time(s.end_at)}</td>
                  {admin && <td>{s.trainer_name}</td>}
                  <td>{admin ? s.member_name : <Link to={`/trainer/clients/${s.member_id}`}>{s.member_name}</Link>}</td>
                  <td className="small">{s.member_notes}</td>
                  <td><Badge value={s.status} /></td>
                  <td className="actions">
                    {s.status === 'booked' && new Date(s.start_at) <= now && (
                      <>
                        <button type="button" className="btn btn-sm" onClick={() => setStatus(s, 'completed')}>Completed</button>
                        <button type="button" className="btn btn-sm" onClick={() => setStatus(s, 'no_show')}>No-show</button>
                      </>
                    )}
                    {s.status === 'booked' && (
                      <ConfirmButton className="btn btn-sm" confirmText="Cancel?" onConfirm={() => act(() => api(`/pt-sessions/${s.id}/cancel`, { method: 'POST' }), 'Session cancelled.')}>
                        Cancel
                      </ConfirmButton>
                    )}
                    {s.status !== 'booked' && (
                      <button type="button" className="btn btn-sm" onClick={() => setStatus(s, 'booked')}>Reopen</button>
                    )}
                    <ConfirmButton onConfirm={() => act(() => api(`/pt-sessions/${s.id}`, { method: 'DELETE' }), 'Session deleted.')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {creating && (
        <Modal title="New PT session" onClose={() => setCreating(false)}>
          <EntityForm
            fields={[
              { name: 'trainer_id', label: 'Trainer', type: 'select', required: true, options: (trainers.data || []).map((t) => ({ value: t.id, label: t.full_name })) },
              { name: 'member_id', label: 'Member', type: 'select', required: true, options: (members.data || []).map((m) => ({ value: m.id, label: m.full_name })) },
              { name: 'start_at', label: 'Start', type: 'datetime', required: true },
              { name: 'end_at', label: 'End', type: 'datetime', required: true },
              { name: 'member_notes', label: 'Notes', type: 'textarea', wide: true },
            ]}
            onSubmit={async (v) => {
              await api('/pt-sessions/admin', { method: 'POST', body: v });
              setCreating(false);
              setMsg('Session created.');
              reload();
            }}
            onCancel={() => setCreating(false)}
          />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export const CLASS_FIELDS = [
  { name: 'title', label: 'Title', required: true },
  { name: 'room', label: 'Room' },
  { name: 'start_at', label: 'Start', type: 'datetime', required: true },
  { name: 'end_at', label: 'End', type: 'datetime', required: true },
  { name: 'capacity', label: 'Capacity', type: 'number', min: 1, required: true, default: 20 },
  {
    name: 'status', label: 'Status', type: 'select', required: true, default: 'scheduled',
    options: ['scheduled', 'cancelled', 'completed'].map((v) => ({ value: v, label: titleCase(v) })),
  },
  { name: 'description', label: 'Description', type: 'textarea', wide: true, rows: 3 },
];

export const classColumns = (withTrainer) => [
  { key: 'title', label: 'Class', render: (r) => <><strong>{r.title}</strong><div className="muted small">{r.room}</div></> },
  { key: 'start_at', label: 'When', render: (r) => `${dateTime(r.start_at)}–${time(r.end_at)}` },
  ...(withTrainer ? [{ key: 'trainer_name', label: 'Trainer' }] : []),
  { key: 'booked', label: 'Booked', render: (r) => `${r.booked_count} / ${r.capacity}` },
  { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
];

export function Roster({ cls, onClose }) {
  const { data, reload, error } = useApi(`/classes/${cls.id}/bookings`);
  const [err, setErr] = useState(null);
  const set = async (b, status) => {
    try {
      await api(`/classes/${cls.id}/bookings/${b.id}`, { method: 'PATCH', body: { status } });
      reload();
    } catch (e) {
      setErr(e.message);
    }
  };
  const remove = async (b) => {
    await api(`/classes/${cls.id}/bookings/${b.id}`, { method: 'DELETE' });
    reload();
  };
  return (
    <Modal title={`${cls.title} – ${dateTime(cls.start_at)}`} onClose={onClose} wide>
      <Alert>{err || error}</Alert>
      {!data ? (
        <Loading />
      ) : !data.length ? (
        <Empty>No bookings yet.</Empty>
      ) : (
        <table className="table">
          <thead><tr><th>Member</th><th>Contact</th><th>Status</th><th>Attendance</th></tr></thead>
          <tbody>
            {data.map((b) => (
              <tr key={b.id}>
                <td>{b.member_name}</td>
                <td className="small">{b.member_email}<div className="muted">{b.member_phone}</div></td>
                <td><Badge value={b.status} /></td>
                <td className="actions">
                  <button type="button" className="btn btn-sm" onClick={() => set(b, 'attended')}>Attended</button>
                  <button type="button" className="btn btn-sm" onClick={() => set(b, 'no_show')}>No-show</button>
                  <button type="button" className="btn btn-sm" onClick={() => set(b, 'booked')}>Booked</button>
                  <ConfirmButton onConfirm={() => remove(b)}>Remove</ConfirmButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

export function TrainerClasses() {
  const [roster, setRoster] = useState(null);
  const [showPast, setShowPast] = useState(false);
  return (
    <>
      <CrudPage
        key={showPast}
        title="My classes"
        subtitle="Classes you run. Open the roster to mark attendance."
        endpoint="/classes"
        listUrl={showPast ? '/classes?mine=1&all=1' : '/classes?mine=1'}
        createLabel="New class"
        fields={CLASS_FIELDS}
        columns={classColumns(false)}
        headerExtra={() => (
          <label className="checkbox">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
            <span>Include past classes</span>
          </label>
        )}
        rowActions={(r) => (
          <button type="button" className="btn btn-sm" onClick={() => setRoster(r)}>Roster</button>
        )}
        emptyText="You have no upcoming classes."
      />
      {roster && <Roster cls={roster} onClose={() => setRoster(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
const CERT_FIELDS = [
  { name: 'title', label: 'Certification', required: true, wide: true },
  { name: 'issuer', label: 'Issued by' },
  { name: 'issued_on', label: 'Issued on', type: 'date' },
  { name: 'expires_on', label: 'Expires on', type: 'date' },
];

export function Certifications() {
  const { data, error, reload } = useApi('/certifications');
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);

  const save = async (values, files) => {
    const form = new FormData();
    Object.entries(values).forEach(([k, v]) => form.append(k, v ?? ''));
    if (files.document) form.append('document', files.document);
    if (editing === 'new') {
      if (!files.document) throw new Error('Attach the certificate document');
      await api('/certifications', { method: 'POST', form });
      setMsg('Uploaded. An admin will review it shortly.');
    } else {
      await api(`/certifications/${editing.id}`, { method: 'PUT', form });
      setMsg('Updated and sent for review again.');
    }
    setEditing(null);
    reload();
  };

  return (
    <div>
      <PageHeader
        title="Certifications"
        subtitle="Upload your qualifications for admin approval."
        actions={<button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>+ Upload certification</button>}
      />
      <Alert kind="success" onClose={() => setMsg(null)}>{msg}</Alert>
      <Alert>{error}</Alert>
      <Card>
        {!data ? (
          <Loading />
        ) : !data.length ? (
          <Empty>No certifications uploaded yet.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Certification</th><th>Dates</th><th>Document</th><th>Status</th><th className="actions-col">Actions</th></tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.title}</strong><div className="muted small">{c.issuer}</div></td>
                  <td className="small">{date(c.issued_on)}{c.expires_on && ` → ${date(c.expires_on)}`}</td>
                  <td>{c.original_name && <a href={`/api/certifications/${c.id}/file`} target="_blank" rel="noreferrer">{c.original_name}</a>}</td>
                  <td>
                    <Badge value={c.status} />
                    {c.review_notes && <div className="muted small">{c.review_notes}</div>}
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-sm" onClick={() => setEditing(c)}>Edit</button>
                    <ConfirmButton onConfirm={async () => { await api(`/certifications/${c.id}`, { method: 'DELETE' }); reload(); }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {editing && (
        <Modal title={editing === 'new' ? 'Upload certification' : 'Edit certification'} onClose={() => setEditing(null)}>
          <EntityForm
            fields={[
              ...CERT_FIELDS,
              {
                name: 'document', label: editing === 'new' ? 'Document (PDF, JPG or PNG, max 5 MB)' : 'Replace document (optional; PDF, JPG or PNG, max 5 MB)', type: 'file',
                accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png', required: editing === 'new', wide: true,
              },
            ]}
            record={editing === 'new' ? null : editing}
            isEdit={editing !== 'new'}
            onSubmit={save}
            onCancel={() => setEditing(null)}
            submitLabel={editing === 'new' ? 'Upload' : 'Save'}
          />
        </Modal>
      )}
    </div>
  );
}
