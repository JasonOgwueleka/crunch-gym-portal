import { useState } from 'react';
import { api, useApi } from '../../lib/api.js';
import { dateTime, titleCase } from '../../lib/format.js';
import EntityForm from '../../components/EntityForm.jsx';
import { Alert, Card, ConfirmButton, Loading, PageHeader, YesNo } from '../../components/ui.jsx';

export const HEALTH_FIELDS = [
  { name: 'has_heart_condition', label: 'Has a doctor ever said you have a heart condition?', type: 'checkbox', wide: true },
  { name: 'has_chest_pain', label: 'Do you feel pain in your chest during physical activity?', type: 'checkbox', wide: true },
  { name: 'has_dizziness', label: 'Do you lose balance because of dizziness or ever lose consciousness?', type: 'checkbox', wide: true },
  { name: 'has_bone_joint_problem', label: 'Do you have a bone or joint problem that could be made worse by exercise?', type: 'checkbox', wide: true },
  { name: 'takes_medication', label: 'Are you currently taking prescribed medication?', type: 'checkbox', wide: true },
  { name: 'is_pregnant', label: 'Are you pregnant or have you given birth in the last 6 months?', type: 'checkbox', wide: true },
  { name: 'smoker', label: 'Do you smoke?', type: 'checkbox', wide: true },
  { name: 'medications', label: 'Medications (if any)', type: 'textarea', rows: 2 },
  { name: 'medical_conditions', label: 'Other medical conditions', type: 'textarea', rows: 2 },
  { name: 'injuries', label: 'Current or previous injuries', type: 'textarea', rows: 2 },
  {
    name: 'activity_level', label: 'Current activity level', type: 'select', required: true,
    options: ['sedentary', 'light', 'moderate', 'active', 'very_active'].map((v) => ({ value: v, label: titleCase(v) })),
    default: 'moderate',
  },
  { name: 'fitness_goals', label: 'Fitness goals', type: 'textarea', rows: 2 },
  { name: 'emergency_contact_name', label: 'Emergency contact name', type: 'text' },
  { name: 'emergency_contact_phone', label: 'Emergency contact phone', type: 'tel' },
  { name: 'consent', label: 'I confirm the information above is accurate and I will tell my trainer if anything changes.', type: 'checkbox', wide: true },
];

/** Read-only view of a questionnaire (used by trainers and admins too). */
export function HealthSummary({ q }) {
  if (!q) return <p className="muted">No questionnaire on file.</p>;
  return (
    <dl className="dl">
      {HEALTH_FIELDS.filter((f) => f.name !== 'consent').map((f) => (
        <div key={f.name}>
          <dt>{f.label}</dt>
          <dd>{f.type === 'checkbox' ? <YesNo value={q[f.name]} /> : f.type === 'select' ? titleCase(q[f.name]) : q[f.name] || '—'}</dd>
        </div>
      ))}
      <div>
        <dt>Last updated</dt>
        <dd>{dateTime(q.updated_at)}</dd>
      </div>
    </dl>
  );
}

export default function Health() {
  const { data, loading, reload, setData } = useApi('/health-questionnaire/mine');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState(null);

  if (loading && data === null) return <Loading />;

  const save = async (values) => {
    const saved = await api('/health-questionnaire/mine', { method: data ? 'PUT' : 'POST', body: values });
    setData(saved);
    setEditing(false);
    setMessage('Questionnaire saved.');
  };

  const remove = async () => {
    await api('/health-questionnaire/mine', { method: 'DELETE' });
    setMessage('Questionnaire deleted.');
    reload();
  };

  const showForm = editing || !data;

  return (
    <div>
      <PageHeader
        title="Health questionnaire"
        subtitle="Helps your trainer keep your training safe. Only you, your trainer and gym admins can see it."
        actions={
          data && !editing && (
            <>
              <button type="button" className="btn" onClick={() => setEditing(true)}>Edit</button>
              <ConfirmButton className="btn btn-danger" onConfirm={remove}>Delete</ConfirmButton>
            </>
          )
        }
      />
      <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>
      <Card>
        {showForm ? (
          <EntityForm
            key={data?.id || 'new'}
            fields={HEALTH_FIELDS}
            record={data}
            isEdit={Boolean(data)}
            onSubmit={save}
            onCancel={data ? () => setEditing(false) : undefined}
            submitLabel={data ? 'Save changes' : 'Submit questionnaire'}
          />
        ) : (
          <HealthSummary q={data} />
        )}
      </Card>
    </div>
  );
}
