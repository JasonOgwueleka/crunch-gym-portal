import { useState } from 'react';
import { api, useApi } from '../../lib/api.js';
import { date, todayInput } from '../../lib/format.js';
import CrudPage from '../../components/CrudPage.jsx';
import EntityForm from '../../components/EntityForm.jsx';
import { Alert, Card, ConfirmButton, Empty, Modal, PageHeader } from '../../components/ui.jsx';

export const LOG_FIELDS = [
  { name: 'log_date', label: 'Date', type: 'date', required: true },
  { name: 'weight_kg', label: 'Weight (kg)', type: 'number', step: '0.1', min: 0 },
  { name: 'body_fat_pct', label: 'Body fat (%)', type: 'number', step: '0.1', min: 0, max: 100 },
  { name: 'waist_cm', label: 'Waist (cm)', type: 'number', step: '0.1', min: 0 },
  { name: 'notes', label: 'Notes', type: 'textarea', wide: true, rows: 3 },
];

export const LOG_COLUMNS = [
  { key: 'log_date', label: 'Date', render: (r) => date(r.log_date) },
  { key: 'weight_kg', label: 'Weight', render: (r) => (r.weight_kg != null ? `${r.weight_kg} kg` : '') },
  { key: 'body_fat_pct', label: 'Body fat', render: (r) => (r.body_fat_pct != null ? `${r.body_fat_pct}%` : '') },
  { key: 'waist_cm', label: 'Waist', render: (r) => (r.waist_cm != null ? `${r.waist_cm} cm` : '') },
  { key: 'notes', label: 'Notes' },
];

/** Minimal inline SVG line chart of weight over time. */
export function WeightChart({ logs }) {
  const points = (logs || []).filter((l) => l.weight_kg != null).slice().sort((a, b) => a.log_date.localeCompare(b.log_date));
  if (points.length < 2) return null;
  const w = 600;
  const h = 160;
  const pad = 28;
  const ys = points.map((p) => p.weight_kg);
  const min = Math.min(...ys) - 0.5;
  const max = Math.max(...ys) + 0.5;
  const x = (i) => pad + (i * (w - pad * 2)) / (points.length - 1);
  const y = (v) => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.weight_kg).toFixed(1)}`).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Weight over time">
      <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} className="chart-axis" />
      <path d={d} className="chart-line" />
      {points.map((p, i) => (
        <g key={p.id}>
          <circle cx={x(i)} cy={y(p.weight_kg)} r="4" className="chart-dot">
            <title>{`${date(p.log_date)}: ${p.weight_kg} kg`}</title>
          </circle>
        </g>
      ))}
      <text x={pad} y={14} className="chart-label">{`${max.toFixed(1)} kg`}</text>
      <text x={pad} y={h - 8} className="chart-label">{date(points[0].log_date)}</text>
      <text x={w - pad} y={h - 8} textAnchor="end" className="chart-label">{date(points[points.length - 1].log_date)}</text>
    </svg>
  );
}

export function PhotoGrid({ photos, onEdit, onDelete }) {
  if (!photos?.length) return <Empty>No progress photos yet.</Empty>;
  return (
    <div className="photo-grid">
      {photos.map((p) => (
        <figure key={p.id} className="photo">
          <a href={`/api/progress/photos/${p.id}/file`} target="_blank" rel="noreferrer">
            <img src={`/api/progress/photos/${p.id}/file`} alt={p.caption || p.original_name} loading="lazy" />
          </a>
          <figcaption>
            <strong>{p.caption || p.original_name}</strong>
            <span className="muted small">{date(p.taken_on)}</span>
            {(onEdit || onDelete) && (
              <span className="row-actions">
                {onEdit && <button type="button" className="btn btn-sm" onClick={() => onEdit(p)}>Edit</button>}
                {onDelete && <ConfirmButton onConfirm={() => onDelete(p)} />}
              </span>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export default function Progress() {
  const logs = useApi('/progress/logs');
  const photos = useApi('/progress/photos');
  const [uploading, setUploading] = useState(false);
  const [editPhoto, setEditPhoto] = useState(null);
  const [error, setError] = useState(null);

  const upload = async (values, files) => {
    if (!files.photo) throw new Error('Choose a photo to upload');
    const form = new FormData();
    form.append('photo', files.photo);
    form.append('caption', values.caption || '');
    form.append('taken_on', values.taken_on || '');
    await api('/progress/photos', { method: 'POST', form });
    setUploading(false);
    photos.reload();
  };

  return (
    <div>
      <PageHeader title="Progress" subtitle="Log your measurements and keep progress photos. Your trainer can see these." />
      <Card title="Weight trend">{logs.data && logs.data.length >= 2 ? <WeightChart logs={logs.data} /> : <Empty>Add at least two weigh-ins to see a chart.</Empty>}</Card>
      <CrudPage
        embedded
        title="Progress log"
        endpoint="/progress/logs"
        createLabel="Add entry"
        fields={LOG_FIELDS}
        defaults={{ log_date: todayInput() }}
        columns={LOG_COLUMNS}
        emptyText="No entries yet. Add your first weigh-in."
        searchable={false}
      />
      <Card
        title="Progress photos"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setUploading(true)}>
            + Upload photo
          </button>
        }
      >
        <Alert onClose={() => setError(null)}>{error}</Alert>
        <PhotoGrid
          photos={photos.data}
          onEdit={(p) => setEditPhoto(p)}
          onDelete={async (p) => {
            try {
              await api(`/progress/photos/${p.id}`, { method: 'DELETE' });
              photos.reload();
            } catch (e) {
              setError(e.message);
            }
          }}
        />
      </Card>
      {uploading && (
        <Modal title="Upload progress photo" onClose={() => setUploading(false)}>
          <EntityForm
            fields={[
              { name: 'photo', label: 'Photo (JPG or PNG, max 5 MB)', type: 'file', accept: '.jpg,.jpeg,.png,image/jpeg,image/png', required: true, wide: true },
              { name: 'caption', label: 'Caption', type: 'text' },
              { name: 'taken_on', label: 'Taken on', type: 'date' },
            ]}
            defaults={{ taken_on: todayInput() }}
            onSubmit={upload}
            onCancel={() => setUploading(false)}
            submitLabel="Upload"
          />
        </Modal>
      )}
      {editPhoto && (
        <Modal title="Edit photo details" onClose={() => setEditPhoto(null)}>
          <EntityForm
            fields={[
              { name: 'caption', label: 'Caption', type: 'text' },
              { name: 'taken_on', label: 'Taken on', type: 'date', required: true },
            ]}
            record={editPhoto}
            isEdit
            onSubmit={async (v) => {
              await api(`/progress/photos/${editPhoto.id}`, { method: 'PUT', body: v });
              setEditPhoto(null);
              photos.reload();
            }}
            onCancel={() => setEditPhoto(null)}
          />
        </Modal>
      )}
    </div>
  );
}
