import { useMemo, useState } from 'react';
import { api, useApi } from '../lib/api.js';
import EntityForm from './EntityForm.jsx';
import { Alert, Card, ConfirmButton, Empty, Loading, Modal, PageHeader } from './ui.jsx';

/**
 * Generic list + create/edit/delete screen for a REST resource:
 *   GET listUrl, POST endpoint, PUT endpoint/:id, DELETE endpoint/:id
 *
 * columns: [{ key, label, render?(row) }]
 * fields:  EntityForm field definitions
 */
export default function CrudPage({
  title,
  subtitle,
  endpoint,
  listUrl,
  columns,
  fields,
  editFields,
  canCreate = true,
  canEdit = true,
  canDelete = true,
  createLabel = 'Add new',
  emptyText,
  rowActions,
  defaults,
  toPayload = (v) => v,
  searchable = true,
  headerExtra,
  embedded = false,
  rowKey = 'id',
  getList = (d) => d,
}) {
  const { data, error, loading, reload } = useApi(listUrl || endpoint);
  const [editing, setEditing] = useState(null); // null | 'new' | row
  const [message, setMessage] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const list = data ? getList(data) || [] : [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((r) => Object.values(r).some((v) => v != null && String(v).toLowerCase().includes(q)));
  }, [data, search, getList]);

  const save = async (values) => {
    const payload = toPayload(values, editing === 'new' ? null : editing);
    if (editing === 'new') {
      await api(endpoint, { method: 'POST', body: payload });
      setMessage('Created successfully.');
    } else {
      await api(`${endpoint}/${editing[rowKey]}`, { method: 'PUT', body: payload });
      setMessage('Saved.');
    }
    setEditing(null);
    reload();
  };

  const remove = async (row) => {
    setActionError(null);
    try {
      await api(`${endpoint}/${row[rowKey]}`, { method: 'DELETE' });
      setMessage('Deleted.');
      reload();
    } catch (e) {
      setActionError(e.message);
    }
  };

  const ctx = { reload, setMessage, setError: setActionError };
  const showActions = canEdit || canDelete || rowActions;

  const body = (
    <>
      <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>
      <Alert onClose={() => setActionError(null)}>{actionError || error}</Alert>
      {headerExtra && headerExtra(ctx)}
      {searchable && data && getList(data)?.length > 5 && (
        <input className="search" type="search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
      )}
      {loading && !data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>{emptyText || 'Nothing here yet.'}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                {showActions && <th className="actions-col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[rowKey]}>
                  {columns.map((c) => (
                    <td key={c.key} data-label={c.label}>
                      {c.render ? c.render(row, ctx) : row[c.key] ?? ''}
                    </td>
                  ))}
                  {showActions && (
                    <td className="actions">
                      {rowActions && rowActions(row, ctx)}
                      {(typeof canEdit === 'function' ? canEdit(row) : canEdit) && (
                        <button type="button" className="btn btn-sm" onClick={() => setEditing(row)}>
                          Edit
                        </button>
                      )}
                      {(typeof canDelete === 'function' ? canDelete(row) : canDelete) && (
                        <ConfirmButton onConfirm={() => remove(row)} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal title={editing === 'new' ? createLabel : `Edit ${title.replace(/s$/, '').toLowerCase()}`} onClose={() => setEditing(null)} wide={fields.length > 6}>
          <EntityForm
            fields={editing === 'new' ? fields : editFields || fields}
            record={editing === 'new' ? null : editing}
            defaults={defaults}
            isEdit={editing !== 'new'}
            onSubmit={save}
            onCancel={() => setEditing(null)}
            submitLabel={editing === 'new' ? 'Create' : 'Save changes'}
          />
        </Modal>
      )}
    </>
  );

  const createButton = canCreate && (
    <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
      + {createLabel}
    </button>
  );

  if (embedded) {
    return (
      <Card title={title} actions={createButton}>
        {body}
      </Card>
    );
  }
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} actions={createButton} />
      <Card>{body}</Card>
    </div>
  );
}
