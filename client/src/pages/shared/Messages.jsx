import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, useApi } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { dateTime } from '../../lib/format.js';
import { Alert, Card, ConfirmButton, Empty, Loading, PageHeader } from '../../components/ui.jsx';

export default function Messages() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const contacts = useApi('/messages/contacts');
  const activeId = params.get('with') || (contacts.data?.[0] ? String(contacts.data[0].id) : null);
  const thread = useApi(activeId ? `/messages/thread/${activeId}` : null);
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.data]);

  // SEC-06 (4): opening a thread no longer marks it read on the server as a side
  // effect of a GET. Mark incoming unread messages as read with an explicit POST.
  useEffect(() => {
    if (!activeId || !thread.data) return;
    const hasUnread = thread.data.some((m) => String(m.sender_id) === String(activeId) && !m.read_at);
    if (hasUnread) {
      api(`/messages/thread/${activeId}/read`, { method: 'POST' })
        .then(() => contacts.reload())
        .catch(() => {});
    }
  }, [activeId, thread.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for new messages while the page is open
  useEffect(() => {
    if (!activeId) return undefined;
    const t = setInterval(() => thread.reload(), 15000);
    return () => clearInterval(t);
  }, [activeId, thread.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);
    try {
      await api('/messages', { method: 'POST', body: { recipient_id: Number(activeId), body } });
      setBody('');
      thread.reload();
      contacts.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const saveEdit = async () => {
    try {
      await api(`/messages/${editing.id}`, { method: 'PUT', body: { body: editing.body } });
      setEditing(null);
      thread.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (m) => {
    await api(`/messages/${m.id}`, { method: 'DELETE' });
    thread.reload();
    contacts.reload();
  };

  if (contacts.loading && !contacts.data) return <Loading />;
  const active = contacts.data?.find((c) => String(c.id) === activeId);

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle={user.role === 'member' ? 'Chat with your personal trainer.' : 'Chat with your assigned clients.'}
      />
      {!contacts.data?.length ? (
        <Card>
          <Empty>
            {user.role === 'member'
              ? "You'll be able to message your trainer once one is assigned to you."
              : 'You have no assigned clients yet.'}
          </Empty>
        </Card>
      ) : (
        <div className="messenger">
          <aside className="contacts">
            {contacts.data.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`contact ${String(c.id) === activeId ? 'active' : ''}`}
                onClick={() => setParams({ with: c.id })}
              >
                <span className="contact-name">
                  {c.full_name}
                  {c.unread > 0 && <span className="nav-count">{c.unread}</span>}
                </span>
                <span className="muted small ellipsis">{c.last_message || 'No messages yet'}</span>
              </button>
            ))}
          </aside>
          <section className="thread">
            <div className="thread-header">{active?.full_name}</div>
            <div className="thread-body">
              <Alert onClose={() => setError(null)}>{error}</Alert>
              {thread.data?.length === 0 && <Empty>Say hello 👋</Empty>}
              {thread.data?.map((m) => {
                const mine = m.sender_id === user.id;
                return (
                  <div key={m.id} className={`bubble-row ${mine ? 'mine' : ''}`}>
                    <div className="bubble">
                      {editing?.id === m.id ? (
                        <>
                          <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={2} />
                          <div className="row-actions">
                            <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                            <button type="button" className="btn btn-sm btn-primary" onClick={saveEdit}>Save</button>
                          </div>
                        </>
                      ) : (
                        <div className="bubble-text">{m.body}</div>
                      )}
                      <div className="bubble-meta">
                        {dateTime(m.created_at)}
                        {m.updated_at && new Date(m.updated_at) - new Date(m.created_at) > 1000 && ' · edited'}
                        {mine && editing?.id !== m.id && (
                          <>
                            <button type="button" className="link-btn" onClick={() => setEditing({ id: m.id, body: m.body })}>Edit</button>
                            <ConfirmButton className="link-btn" confirmText="Delete?" onConfirm={() => remove(m)}>Delete</ConfirmButton>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
            <form className="composer" onSubmit={send}>
              <textarea
                rows={2}
                placeholder={`Message ${active?.full_name || ''}`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) send(e);
                }}
              />
              <button className="btn btn-primary" disabled={!body.trim()}>Send</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
