export const money = (cents, currency = 'EUR') =>
  cents == null ? '' : new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(cents / 100);

export const date = (v) => {
  if (!v) return '';
  // 'YYYY-MM-DD' strings are calendar dates; don't shift them by timezone
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const dateTime = (v) =>
  v ? new Date(v).toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export const time = (v) => (v ? new Date(v).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }) : '');

export const weekday = (v) =>
  new Date(v).toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' });

export const roleLabel = (r) =>
  ({ member: 'Member', trainer: 'Personal Trainer', front_desk: 'Front Desk', admin: 'Admin' })[r] || r;

export const titleCase = (s) => (s ? String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');

/** ISO timestamp -> value for <input type="datetime-local"> in local time */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function todayInput() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
