import { useState } from 'react';
import { toLocalInput } from '../lib/format.js';
import { Alert } from './ui.jsx';

/**
 * Declarative form. Field shape:
 * { name, label, type, options, required, help, placeholder, createOnly, editOnly, rows, step, min, max, accept }
 * types: text, email, password, tel, number, money (euros <-> cents), textarea, select, checkbox,
 *        date, datetime (datetime-local <-> ISO), file
 */
export function toFormValue(field, value) {
  switch (field.type) {
    case 'checkbox':
      return Boolean(value);
    case 'datetime':
      return toLocalInput(value);
    case 'money':
      return value == null || value === '' ? '' : (Number(value) / 100).toFixed(2);
    case 'date':
      return value ? String(value).slice(0, 10) : '';
    case 'password':
    case 'file':
      return '';
    default:
      return value == null ? '' : String(value);
  }
}

export function fromFormValue(field, value) {
  switch (field.type) {
    case 'checkbox':
      return Boolean(value);
    case 'number':
      return value === '' ? null : Number(value);
    case 'money':
      return value === '' ? null : Math.round(parseFloat(value) * 100);
    case 'datetime':
      return value ? new Date(value).toISOString() : null;
    case 'date':
      return value || null;
    default:
      return value;
  }
}

export function initialValues(fields, record = {}, defaults = {}) {
  const v = {};
  for (const f of fields) {
    const source = record && Object.prototype.hasOwnProperty.call(record, f.name) ? record[f.name] : defaults[f.name] ?? f.default;
    v[f.name] = toFormValue(f, source);
  }
  return v;
}

export function collectValues(fields, values, { isEdit } = {}) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'file') continue;
    if (f.type === 'password' && isEdit && !values[f.name]) continue; // leave unchanged
    out[f.name] = fromFormValue(f, values[f.name]);
  }
  return out;
}

export function Field({ field, value, onChange, disabled }) {
  const id = `f-${field.name}`;
  const common = {
    id,
    name: field.name,
    disabled: disabled || field.disabled,
    required: field.required && field.type !== 'checkbox',
    placeholder: field.placeholder,
  };
  let input;
  switch (field.type) {
    case 'textarea':
      input = <textarea {...common} rows={field.rows || 4} value={value} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'select':
      input = (
        <select {...common} value={value} onChange={(e) => onChange(e.target.value)}>
          {!field.required || field.placeholder ? <option value="">{field.placeholder || '— None —'}</option> : <option value="" disabled>Select…</option>}
          {(field.options || []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'checkbox':
      return (
        <label className="checkbox" htmlFor={id}>
          <input {...common} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          <span>{field.label}</span>
          {field.help && <small className="help">{field.help}</small>}
        </label>
      );
    case 'file':
      input = <input {...common} type="file" accept={field.accept} onChange={(e) => onChange(e.target.files?.[0] || null)} />;
      break;
    case 'money':
      input = <input {...common} type="number" step="0.01" min="0" value={value} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'datetime':
      input = <input {...common} type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />;
      break;
    default:
      input = (
        <input
          {...common}
          type={field.type || 'text'}
          step={field.step}
          min={field.min}
          max={field.max}
          value={value}
          autoComplete={field.autoComplete}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
  return (
    <div className={`field ${field.wide ? 'field-wide' : ''}`}>
      <label htmlFor={id}>
        {field.label}
        {field.required && <span className="req"> *</span>}
      </label>
      {input}
      {field.help && <small className="help">{field.help}</small>}
    </div>
  );
}

export default function EntityForm({ fields, record, defaults, onSubmit, onCancel, submitLabel = 'Save', isEdit = false }) {
  const visible = fields.filter((f) => (isEdit ? !f.createOnly : !f.editOnly));
  const [values, setValues] = useState(() => initialValues(visible, record, defaults));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const files = Object.fromEntries(visible.filter((f) => f.type === 'file').map((f) => [f.name, values[f.name]]));
      await onSubmit(collectValues(visible, values, { isEdit }), files);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={handle}>
      <Alert onClose={() => setError(null)}>{error}</Alert>
      <div className="form-grid">
        {visible.map((f) => (
          <Field key={f.name} field={f} value={values[f.name]} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />
        ))}
      </div>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
