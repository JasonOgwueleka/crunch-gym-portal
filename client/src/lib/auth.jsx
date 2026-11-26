import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, SESSION_ENDED_EVENT } from './api.js';

const SESSION_MESSAGES = {
  idle: 'Your session expired because you were inactive. Please log in again.',
  absolute: 'Your session has reached its maximum length. Please log in again.',
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  // SEC-05: why the user was logged out (shown on the login page), or null.
  const [notice, setNotice] = useState(null);

  /** End the session locally (the server has already ended it) and remember why. */
  const endSession = useCallback((message) => {
    setUser(null);
    setNotice(message);
  }, []);

  useEffect(() => {
    const onEnded = (e) => endSession(e.detail.message || SESSION_MESSAGES[e.detail.reason] || SESSION_MESSAGES.idle);
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, [endSession]);

  const refresh = useCallback(async () => {
    try {
      const { user: u } = await api('/auth/me');
      setUser(u);
      return u;
    } catch {
      setUser(null);
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    const { user: u } = await api('/auth/login', { method: 'POST', body: { email, password } });
    setUser(u);
    setNotice(null);
    return u;
  };

  const register = async (details) => {
    const { user: u } = await api('/auth/register', { method: 'POST', body: details });
    setUser(u);
    setNotice(null);
    return u;
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setNotice(null);
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, register, logout, refresh, setUser, notice, endSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export const homeFor = (role) =>
  ({ member: '/dashboard', trainer: '/trainer', front_desk: '/desk', admin: '/admin' })[role] || '/';
