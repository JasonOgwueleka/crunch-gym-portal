import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { date, dateTime, money, roleLabel, titleCase, todayInput } from '../../lib/format.js';
import CrudPage from '../../components/CrudPage.jsx';
import EntityForm from '../../components/EntityForm.jsx';
import { Alert, Badge, Card, ConfirmButton, Empty, Loading, Modal, PageHeader, Stat, Tabs } from '../../components/ui.jsx';
import { CLASS_FIELDS, Roster, classColumns } from '../trainer/TrainerPages.jsx';

const ROLE_OPTIONS = ['member', 'trainer', 'front_desk', 'admin'].map((r) => ({ value: r, label: roleLabel(r) }));
const opts = (rows, label = (r) => r.full_name) => (rows || []).map((r) => ({ value: r.id, label: label(r) }));

// ---------------------------------------------------------------------------
export function AdminDashboard() {
  const { data: s } = useApi('/admin/summary');
  const { data: certs } = useApi('/certifications?status=pending');
  const { data: audit } = useApi('/admin/audit-logs?limit=8');
  return (
    <div>
      <PageHeader title="Admin dashboard" subtitle="Crunch Gym at a glance." />
      {!s ? (
        <Loading />
      ) : (
        <div className="stats">
          <Stat label="Members" value={s.members} hint={`${s.active_members} with active membership`} />
          <Stat label="Trainers" value={s.trainers} hint={`${s.unassigned_members} members unassigned`} />
          <Stat label="Check-ins today" value={s.check_ins_today} hint={`${s.classes_today} classes today`} />
          <Stat label="Revenue this month" value={money(s.revenue_month_cents)} hint={`${money(s.refunds_month_cents)} refunded`} />
        </div>
      )}
      <div className="grid-2">
        <Card title="Certifications awaiting approval" actions={<Link to="/admin/certifications" className="btn btn-sm">Review</Link>}>
          {certs?.filter((c) => c.status === 'pending').length ? (
            <ul className="list">
              {certs.filter((c) => c.status === 'pending').map((c) => (
                <li key={c.id}><strong>{c.title}</strong><span className="muted">{c.trainer_name}</span></li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing to review.</Empty>
          )}
        </Card>
        <Card title="Recent activity" actions={<Link to="/admin/audit" className="btn btn-sm">Audit log</Link>}>
          {audit?.rows?.length ? (
            <ul className="list">
              {audit.rows.map((a) => (
                <li key={a.id}><code>{a.action}</code><span className="muted small">{a.actor_email || 'system'} · {dateTime(a.created_at)}</span></li>
              ))}
            </ul>
          ) : (
            <Empty />
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function AdminUsers() {
  const { user } = useAuth();
  const [role, setRole] = useState('');
  return (
    <CrudPage
      key={role}
      title="Users & roles"
      subtitle="Create staff and member accounts, change roles and deactivate accounts."
      endpoint="/users"
      listUrl={role ? `/users?role=${role}` : '/users'}
      createLabel="New user"
      headerExtra={() => (
        <Tabs
          tabs={[{ id: '', label: 'All' }, ...ROLE_OPTIONS.map((r) => ({ id: r.value, label: r.label }))]}
          active={role}
          onChange={setRole}
        />
      )}
      fields={[
        { name: 'full_name', label: 'Full name', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'role', label: 'Role', type: 'select', options: ROLE_OPTIONS, required: true, default: 'member' },
        { name: 'phone', label: 'Phone', type: 'tel' },
        { name: 'date_of_birth', label: 'Date of birth', type: 'date' },
        { name: 'is_active', label: 'Account active', type: 'checkbox', default: true },
        { name: 'password', label: 'Password', type: 'password', required: true, createOnly: true, autoComplete: 'new-password' },
        { name: 'password', label: 'Set new password (leave blank to keep)', type: 'password', editOnly: true, autoComplete: 'new-password' },
      ]}
      columns={[
        { key: 'full_name', label: 'Name', render: (r) => <><strong>{r.full_name}</strong><div className="muted small">{r.email}</div></> },
        { key: 'role', label: 'Role', render: (r) => roleLabel(r.role) },
        { key: 'is_active', label: 'Account', render: (r) => <Badge value={r.is_active ? 'active' : 'inactive'} /> },
        { key: 'membership_active', label: 'Membership', render: (r) => (r.role === 'member' ? <Badge value={r.membership_active ? 'active' : 'inactive'} /> : '—') },
        { key: 'assigned_trainer_name', label: 'Trainer', render: (r) => (r.role === 'member' ? r.assigned_trainer_name || '—' : '') },
        { key: 'last_login_at', label: 'Last login', render: (r) => dateTime(r.last_login_at) || 'never' },
      ]}
      canDelete={(r) => r.id !== user.id}
    />
  );
}

// ---------------------------------------------------------------------------
export function AdminPlans() {
  return (
    <CrudPage
      title="Membership plans"
      subtitle="Plans shown to visitors and members. Deactivate a plan to stop selling it."
      endpoint="/plans"
      listUrl="/plans?all=1"
      createLabel="New plan"
      fields={[
        { name: 'name', label: 'Name', required: true },
        { name: 'price_cents', label: 'Price (€)', type: 'money', required: true },
        { name: 'duration_months', label: 'Duration (months)', type: 'number', min: 1, required: true, default: 1 },
        { name: 'is_active', label: 'On sale', type: 'checkbox', default: true },
        { name: 'description', label: 'Description', type: 'textarea', wide: true, rows: 2 },
        { name: 'features', label: 'Features (one per line)', type: 'textarea', wide: true, rows: 4 },
      ]}
      columns={[
        { key: 'name', label: 'Plan', render: (r) => <><strong>{r.name}</strong><div className="muted small">{r.description}</div></> },
        { key: 'price_cents', label: 'Price', render: (r) => money(r.price_cents) },
        { key: 'duration_months', label: 'Duration', render: (r) => `${r.duration_months} mo` },
        { key: 'membership_count', label: 'Memberships' },
        { key: 'is_active', label: 'Status', render: (r) => <Badge value={r.is_active ? 'active' : 'inactive'}>{r.is_active ? 'On sale' : 'Inactive'}</Badge> },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
export function AdminMemberships() {
  const members = useApi('/users?role=member');
  const plans = useApi('/plans?all=1');
  const fields = [
    { name: 'user_id', label: 'Member', type: 'select', required: true, options: opts(members.data), createOnly: true },
    { name: 'plan_id', label: 'Plan', type: 'select', required: true, options: opts(plans.data, (p) => `${p.name} (${money(p.price_cents)})`) },
    {
      name: 'status', label: 'Status', type: 'select', required: true, default: 'active',
      options: ['active', 'cancelled', 'expired', 'refunded'].map((v) => ({ value: v, label: titleCase(v) })),
    },
    { name: 'auto_renew', label: 'Auto-renew', type: 'checkbox' },
    { name: 'start_date', label: 'Start date', type: 'date', required: true, default: todayInput() },
    { name: 'end_date', label: 'End date', type: 'date', required: true },
  ];
  if (!members.data || !plans.data) return <Loading />;
  return (
    <CrudPage
      title="Memberships"
      subtitle="All memberships. Creating one here does not take a payment (e.g. complimentary memberships)."
      endpoint="/memberships"
      createLabel="New membership"
      fields={fields}
      columns={[
        { key: 'member_name', label: 'Member', render: (r) => <><strong>{r.member_name}</strong><div className="muted small">{r.member_email}</div></> },
        { key: 'plan_name', label: 'Plan' },
        { key: 'dates', label: 'Dates', render: (r) => `${date(r.start_date)} – ${date(r.end_date)}` },
        { key: 'status', label: 'Status', render: (r) => <Badge value={r.is_current ? 'active' : r.status === 'active' ? 'expired' : r.status} /> },
        { key: 'auto_renew', label: 'Auto-renew', render: (r) => (r.auto_renew ? 'Yes' : 'No') },
      ]}
      rowActions={(r, ctx) =>
        r.status === 'active' && (
          <ConfirmButton
            className="btn btn-sm"
            confirmText="Cancel it?"
            onConfirm={async () => {
              try {
                await api(`/memberships/${r.id}/cancel`, { method: 'POST' });
                ctx.setMessage('Membership cancelled.');
                ctx.reload();
              } catch (e) {
                ctx.setError(e.message);
              }
            }}
          >
            Cancel
          </ConfirmButton>
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------
export function AdminPayments() {
  const [tab, setTab] = useState('payments');
  const [refunding, setRefunding] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <div>
      <PageHeader title="Payments & refunds" subtitle="Simulated card payments. Refunds are recorded here and emailed (to the console)." />
      <Tabs tabs={[{ id: 'payments', label: 'Payments' }, { id: 'refunds', label: 'Refunds' }]} active={tab} onChange={setTab} />
      {tab === 'payments' ? (
        <CrudPage
          key={`p${reloadKey}`}
          embedded
          title="Payments"
          endpoint="/payments"
          canCreate={false}
          fields={[
            { name: 'description', label: 'Description', wide: true },
            { name: 'cardholder_name', label: 'Cardholder name' },
            {
              name: 'status', label: 'Status', type: 'select', required: true,
              options: ['succeeded', 'failed', 'refunded', 'partially_refunded'].map((v) => ({ value: v, label: titleCase(v) })),
            },
          ]}
          columns={[
            { key: 'created_at', label: 'Date', render: (r) => dateTime(r.created_at) },
            { key: 'member_name', label: 'Member', render: (r) => <><strong>{r.member_name || '(deleted user)'}</strong><div className="muted small">{r.reference}</div></> },
            { key: 'description', label: 'Description', render: (r) => <>{r.description}{r.failure_reason && <div className="small text-red">{r.failure_reason}</div>}</> },
            { key: 'card', label: 'Card', render: (r) => `${r.card_brand || ''} •••• ${r.card_last4 || ''}` },
            { key: 'amount_cents', label: 'Amount', render: (r) => <>{money(r.amount_cents)}{r.refunded_cents > 0 && <div className="small text-purple">−{money(r.refunded_cents)}</div>}</> },
            { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
          ]}
          rowActions={(r) =>
            ['succeeded', 'partially_refunded'].includes(r.status) && (
              <button type="button" className="btn btn-sm" onClick={() => setRefunding(r)}>Refund</button>
            )
          }
        />
      ) : (
        <CrudPage
          key={`r${reloadKey}`}
          embedded
          title="Refunds"
          endpoint="/payments/refunds"
          canCreate={false}
          fields={[{ name: 'reason', label: 'Reason', type: 'textarea', wide: true }]}
          columns={[
            { key: 'created_at', label: 'Date', render: (r) => dateTime(r.created_at) },
            { key: 'member_name', label: 'Member' },
            { key: 'reference', label: 'Payment' },
            { key: 'amount_cents', label: 'Refunded', render: (r) => `${money(r.amount_cents)} of ${money(r.payment_amount_cents)}` },
            { key: 'reason', label: 'Reason' },
            { key: 'issued_by_name', label: 'Issued by' },
          ]}
        />
      )}
      {refunding && (
        <Modal title={`Refund ${refunding.reference}`} onClose={() => setRefunding(null)}>
          <p>
            Paid {money(refunding.amount_cents)} by {refunding.member_name}. Already refunded: {money(refunding.refunded_cents)}.
          </p>
          <EntityForm
            fields={[
              { name: 'amount_cents', label: 'Amount to refund (€)', type: 'money', required: true, help: 'Defaults to the remaining amount.' },
              { name: 'reason', label: 'Reason', type: 'textarea', wide: true, required: true },
              { name: 'cancel_membership', label: 'Also end the linked membership', type: 'checkbox', wide: true },
            ]}
            defaults={{ amount_cents: refunding.amount_cents - refunding.refunded_cents }}
            onSubmit={async (v) => {
              await api(`/payments/${refunding.id}/refund`, { method: 'POST', body: v });
              setRefunding(null);
              setReloadKey((k) => k + 1);
            }}
            onCancel={() => setRefunding(null)}
            submitLabel="Issue refund"
          />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function AdminAssignments() {
  const members = useApi('/users?role=member');
  const trainers = useApi('/trainers');
  if (!members.data || !trainers.data) return <Loading />;
  return (
    <CrudPage
      title="Trainer assignments"
      subtitle="Each member can have one personal trainer. Trainers only see their assigned clients."
      endpoint="/assignments"
      createLabel="Assign trainer"
      fields={[
        { name: 'member_id', label: 'Member', type: 'select', required: true, options: opts(members.data.filter((m) => !m.assigned_trainer_name), (m) => `${m.full_name} (${m.email})`), createOnly: true },
        { name: 'trainer_id', label: 'Trainer', type: 'select', required: true, options: opts(trainers.data, (t) => `${t.full_name} (${t.client_count} clients)`) },
        { name: 'notes', label: 'Notes', type: 'textarea', wide: true },
      ]}
      columns={[
        { key: 'member_name', label: 'Member', render: (r) => <><strong>{r.member_name}</strong><div className="muted small">{r.member_email}</div></> },
        { key: 'trainer_name', label: 'Trainer' },
        { key: 'notes', label: 'Notes' },
        { key: 'assigned_at', label: 'Assigned', render: (r) => <>{date(r.assigned_at)}<div className="muted small">by {r.assigned_by_name || '—'}</div></> },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
export function AdminClasses() {
  const trainers = useApi('/trainers');
  const [roster, setRoster] = useState(null);
  const [showPast, setShowPast] = useState(false);
  if (!trainers.data) return <Loading />;
  return (
    <>
      <CrudPage
        key={showPast}
        title="Classes"
        subtitle="Manage the group class timetable."
        endpoint="/classes"
        listUrl={showPast ? '/classes?all=1' : '/classes'}
        createLabel="New class"
        fields={[
          CLASS_FIELDS[0],
          { name: 'trainer_id', label: 'Trainer', type: 'select', options: opts(trainers.data) },
          ...CLASS_FIELDS.slice(1),
        ]}
        columns={classColumns(true)}
        headerExtra={() => (
          <label className="checkbox">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
            <span>Include past classes</span>
          </label>
        )}
        rowActions={(r) => <button type="button" className="btn btn-sm" onClick={() => setRoster(r)}>Roster</button>}
      />
      {roster && <Roster cls={roster} onClose={() => setRoster(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
export function AdminCertifications() {
  const [status, setStatus] = useState('pending');
  const { data, reload, error } = useApi(`/certifications${status ? `?status=${status}` : ''}`);
  const [reviewing, setReviewing] = useState(null);
  return (
    <div>
      <PageHeader title="Certifications" subtitle="Review documents uploaded by trainers." />
      <Alert>{error}</Alert>
      <Tabs
        tabs={[{ id: 'pending', label: 'Pending' }, { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Rejected' }, { id: '', label: 'All' }]}
        active={status}
        onChange={setStatus}
      />
      <Card>
        {!data ? (
          <Loading />
        ) : !data.length ? (
          <Empty>No certifications.</Empty>
        ) : (
          <table className="table">
            <thead><tr><th>Trainer</th><th>Certification</th><th>Dates</th><th>Document</th><th>Status</th><th className="actions-col">Actions</th></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td>{c.trainer_name}</td>
                  <td><strong>{c.title}</strong><div className="muted small">{c.issuer}</div></td>
                  <td className="small">{date(c.issued_on)}{c.expires_on && ` → ${date(c.expires_on)}`}</td>
                  <td>{c.original_name && <a href={`/api/certifications/${c.id}/file`} target="_blank" rel="noreferrer">View</a>}</td>
                  <td>
                    <Badge value={c.status} />
                    {c.reviewed_by_name && <div className="muted small">by {c.reviewed_by_name}, {date(c.reviewed_at)}</div>}
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => setReviewing(c)}>Review</button>
                    <ConfirmButton onConfirm={async () => { await api(`/certifications/${c.id}`, { method: 'DELETE' }); reload(); }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {reviewing && (
        <Modal title={`Review: ${reviewing.title}`} onClose={() => setReviewing(null)}>
          <p>
            {reviewing.trainer_name} · {reviewing.issuer} ·{' '}
            <a href={`/api/certifications/${reviewing.id}/file`} target="_blank" rel="noreferrer">Open document</a>
          </p>
          <EntityForm
            fields={[
              {
                name: 'status', label: 'Decision', type: 'select', required: true,
                options: [{ value: 'approved', label: 'Approve' }, { value: 'rejected', label: 'Reject' }, { value: 'pending', label: 'Back to pending' }],
              },
              { name: 'review_notes', label: 'Notes for the trainer', type: 'textarea', wide: true },
            ]}
            record={{ status: reviewing.status === 'pending' ? 'approved' : reviewing.status, review_notes: reviewing.review_notes }}
            onSubmit={async (v) => {
              await api(`/certifications/${reviewing.id}/review`, { method: 'PATCH', body: v });
              setReviewing(null);
              reload();
            }}
            onCancel={() => setReviewing(null)}
            submitLabel="Save decision"
          />
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function AdminCheckins() {
  const [day, setDay] = useState(todayInput());
  return (
    <CrudPage
      key={day}
      title="Check-ins"
      subtitle="Visits recorded by the front desk."
      endpoint="/checkins"
      listUrl={`/checkins?date=${day}`}
      canCreate={false}
      headerExtra={() => (
        <div className="field inline">
          <label htmlFor="ci-day">Day</label>
          <input id="ci-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
      )}
      fields={[{ name: 'notes', label: 'Notes', type: 'textarea', wide: true }]}
      columns={[
        { key: 'checked_in_at', label: 'Time', render: (r) => dateTime(r.checked_in_at) },
        { key: 'member_name', label: 'Member' },
        { key: 'membership_active', label: 'Membership', render: (r) => <Badge tone={r.membership_active ? 'green' : 'red'}>{r.membership_active ? 'Active' : 'Override'}</Badge> },
        { key: 'checked_in_by_name', label: 'By' },
        { key: 'notes', label: 'Notes' },
      ]}
      emptyText="No check-ins on this day."
    />
  );
}

// ---------------------------------------------------------------------------
// SEC-12 (6): result of GET /api/admin/audit-logs/verify (hash-chain check).
function AuditIntegrity() {
  const check = useApi('/admin/audit-logs/verify');
  const r = check.data;
  return (
    <Card
      title="Audit log integrity"
      actions={
        <button type="button" className="btn btn-sm" onClick={check.reload} disabled={check.loading}>
          {check.loading ? 'Checking…' : 'Re-check'}
        </button>
      }
    >
      <Alert>{check.error}</Alert>
      {!r ? (
        <Loading />
      ) : r.intact ? (
        <Alert kind="success">
          Chain intact: all {r.checked_entries} entries match their SHA-256 hashes and links. Checked {dateTime(r.checked_at)}.
        </Alert>
      ) : (
        <Alert>
          Tampering detected at entry ID {r.first_broken_id} (sequence #{r.first_broken_seq}). {r.reason}. Checked{' '}
          {r.checked_entries} of {r.total_entries} entries at {dateTime(r.checked_at)}.
        </Alert>
      )}
    </Card>
  );
}

export function AdminAudit() {
  const [filters, setFilters] = useState({ action: '', actor: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters);
  const [offset, setOffset] = useState(0);
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(applied).filter(([, v]) => v)), limit: '50', offset: String(offset) });
  const { data, error } = useApi(`/admin/audit-logs?${qs}`);
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Every significant action taken in the portal."
        actions={<a className="btn" href="/api/admin/reports/audit-log.csv">Export CSV</a>}
      />
      <Alert>{error}</Alert>
      <AuditIntegrity />
      <Card>
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setOffset(0);
            setApplied(filters);
          }}
        >
          <input placeholder="Action (e.g. login)" value={filters.action} onChange={set('action')} />
          <input placeholder="User email" value={filters.actor} onChange={set('actor')} />
          <input type="date" value={filters.from} onChange={set('from')} aria-label="From" />
          <input type="date" value={filters.to} onChange={set('to')} aria-label="To" />
          <button className="btn btn-primary">Filter</button>
        </form>
        {!data ? (
          <Loading />
        ) : !data.rows.length ? (
          <Empty>No matching entries.</Empty>
        ) : (
          <>
            <table className="table">
              <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th><th>IP</th></tr></thead>
              <tbody>
                {data.rows.map((a) => (
                  <tr key={a.id}>
                    <td className="nowrap small">{dateTime(a.created_at)}</td>
                    <td className="small">{a.actor_email || 'system'}{a.actor_role && <div className="muted">{roleLabel(a.actor_role)}</div>}</td>
                    <td><code>{a.action}</code></td>
                    <td className="small">{a.entity_type}{a.entity_id && ` #${a.entity_id}`}</td>
                    <td className="small details">{a.details && <code>{JSON.stringify(a.details)}</code>}</td>
                    <td className="small muted">{a.ip_address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pager">
              <span className="muted">
                {data.offset + 1}–{data.offset + data.rows.length} of {data.total}
              </span>
              <button type="button" className="btn btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button>
              <button type="button" className="btn btn-sm" disabled={offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>Next</button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
const REPORT_INFO = {
  members: 'All members with membership status and trainer.',
  memberships: 'Every membership with plan, dates and status.',
  payments: 'All simulated payments, including failures and refunded amounts.',
  refunds: 'Refunds issued, by whom and why.',
  'check-ins': 'Front desk check-in history.',
  'class-attendance': 'Bookings, attendance and no-shows per class.',
  'pt-sessions': 'Personal training sessions by trainer and member.',
  'audit-log': 'The latest 10,000 audit log entries.',
};

export function AdminReports() {
  const { data } = useApi('/admin/reports');
  return (
    <div>
      <PageHeader title="Reports" subtitle="Download CSV exports for spreadsheets." />
      {!data ? (
        <Loading />
      ) : (
        <div className="grid-3">
          {data.map((name) => (
            <Card key={name} title={titleCase(name.replace(/-/g, ' '))}>
              <p className="muted">{REPORT_INFO[name]}</p>
              <a className="btn btn-primary" href={`/api/admin/reports/${name}.csv`}>Download CSV</a>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
