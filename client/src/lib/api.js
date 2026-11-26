import { useCallback, useEffect, useState } from 'react';

export const SESSION_ENDED_EVENT = 'crunch:session-ended';

/** Small fetch wrapper for the Express API. Throws Error(message) on non-2xx. */
export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, credentials: 'include', headers: {} };
  if (form) {
    opts.body = form;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, opts);
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : await res.text();
  // SEC-05: the server marks responses where the session has just expired
  // (idle or absolute timeout). Tell the AuthProvider so it can log the user
  // out locally and show a clear message on the login page.
  const expired = res.headers.get('X-Session-Expired') || (data && data.code === 'SESSION_EXPIRED' ? 'idle' : null);
  if (expired) {
    window.dispatchEvent(
      new CustomEvent(SESSION_ENDED_EVENT, { detail: { reason: expired, message: data && data.code === 'SESSION_EXPIRED' ? data.error : null } }),
    );
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** Load data from a GET endpoint. Pass null as path to skip loading. */
export function useApi(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(path));

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api(path));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}
