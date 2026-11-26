import { useCallback, useEffect, useState } from 'react';

export const SESSION_ENDED_EVENT = 'crunch:session-ended';

// ---- SEC-06: CSRF token (synchronizer token pattern) -------------------------
// The token lives in the server-side session. We fetch it once, cache it in
// memory (never in localStorage or a readable cookie) and send it in the
// X-CSRF-Token header on every state-changing request.
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
// These calls start or end a session on the server, which discards the old token.
const SESSION_CHANGING = ['/auth/login', '/auth/register', '/auth/logout', '/auth/change-password', '/auth/reset-password', '/auth/me'];
let csrfTokenPromise = null;

function getCsrfToken() {
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch('/api/auth/csrf-token', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not get a security token'))))
      .then((d) => d.csrfToken)
      .catch((e) => {
        csrfTokenPromise = null;
        throw e;
      });
  }
  return csrfTokenPromise;
}

/** Forget the cached token so the next state-changing request fetches a fresh one. */
export function resetCsrfToken() {
  csrfTokenPromise = null;
}

/** Small fetch wrapper for the Express API. Throws Error(message) on non-2xx. */
export async function api(path, { method = 'GET', body, form } = {}, retried = false) {
  const opts = { method, credentials: 'include', headers: {} };
  if (form) {
    opts.body = form; // multipart: the browser sets Content-Type; the CSRF header is added below
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const unsafe = !SAFE_METHODS.includes(method.toUpperCase());
  if (unsafe) opts.headers['X-CSRF-Token'] = await getCsrfToken();
  const res = await fetch(`/api${path}`, opts);
  if (unsafe && SESSION_CHANGING.includes(path)) resetCsrfToken();
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : await res.text();
  // SEC-05: the server marks responses where the session has just expired
  // (idle or absolute timeout). Tell the AuthProvider so it can log the user
  // out locally and show a clear message on the login page.
  const expired = res.headers.get('X-Session-Expired') || (data && data.code === 'SESSION_EXPIRED' ? 'idle' : null);
  if (expired) {
    resetCsrfToken(); // the expired session's token is gone too
    window.dispatchEvent(
      new CustomEvent(SESSION_ENDED_EVENT, { detail: { reason: expired, message: data && data.code === 'SESSION_EXPIRED' ? data.error : null } }),
    );
  }
  // SEC-06: if the session changed since we fetched the token (e.g. it timed out),
  // get a fresh token and try once more. A forged cross-site request can't do this,
  // because it cannot read the token.
  if (res.status === 403 && data && data.code === 'CSRF_INVALID' && !retried) {
    resetCsrfToken();
    return api(path, { method, body, form }, true);
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
