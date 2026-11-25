import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { roleLabel } from '../lib/format.js';
import { Loading } from './ui.jsx';

const NAV = {
  visitor: [
    ['/', 'Home', true],
    ['/plans', 'Plans'],
    ['/timetable', 'Timetable'],
    ['/trainers', 'Trainers'],
  ],
  member: [
    ['/dashboard', 'Dashboard'],
    ['/membership', 'Membership'],
    ['/classes', 'Classes'],
    ['/training', 'Personal Training'],
    ['/workouts', 'Workout Plans'],
    ['/progress', 'Progress'],
    ['/health', 'Health Questionnaire'],
    ['/messages', 'Messages'],
  ],
  trainer: [
    ['/trainer', 'Overview', true],
    ['/trainer/clients', 'My Clients'],
    ['/trainer/availability', 'Availability'],
    ['/trainer/sessions', 'PT Sessions'],
    ['/trainer/classes', 'My Classes'],
    ['/trainer/certifications', 'Certifications'],
    ['/messages', 'Messages'],
  ],
  front_desk: [
    ['/desk', 'Check-in', true],
    ['/timetable', 'Timetable'],
  ],
  admin: [
    ['/admin', 'Dashboard', true],
    ['/admin/users', 'Users & Roles'],
    ['/admin/plans', 'Plans'],
    ['/admin/memberships', 'Memberships'],
    ['/admin/payments', 'Payments & Refunds'],
    ['/admin/assignments', 'Trainer Assignments'],
    ['/admin/classes', 'Classes'],
    ['/admin/sessions', 'PT Sessions'],
    ['/admin/certifications', 'Certifications'],
    ['/admin/checkins', 'Check-ins'],
    ['/admin/audit', 'Audit Log'],
    ['/admin/reports', 'Reports'],
  ],
};

export default function Layout() {
  const { user, ready, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    if (!user || !['member', 'trainer'].includes(user.role)) return undefined;
    const load = () => api('/messages/unread-count').then((d) => setUnread(d.unread)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [user, location.pathname]);

  const links = NAV[user?.role || 'visitor'];

  return (
    <div className="app">
      <header className="topbar">
        <Link to={user ? homeFor(user.role) : '/'} className="brand">
          <span className="brand-mark">C</span> Crunch Gym <span className="brand-sub">Portal</span>
        </Link>
        <button type="button" className="menu-toggle" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
          ☰
        </button>
        <div className="topbar-right">
          {user ? (
            <>
              <span className="whoami">
                <strong>{user.full_name}</strong>
                <span className="role-pill">{roleLabel(user.role)}</span>
              </span>
              <NavLink to="/profile" className="btn btn-ghost btn-sm">
                Profile
              </NavLink>
              <button
                type="button"
                className="btn btn-sm"
                onClick={async () => {
                  await logout();
                  navigate('/');
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="btn btn-ghost btn-sm">
                Log in
              </NavLink>
              <NavLink to="/register" className="btn btn-primary btn-sm">
                Join now
              </NavLink>
            </>
          )}
        </div>
      </header>
      <div className="shell">
        <nav className={`sidebar ${menuOpen ? 'open' : ''}`}>
          {links.map(([to, label, end]) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              {label}
              {to === '/messages' && unread > 0 && <span className="nav-count">{unread}</span>}
            </NavLink>
          ))}
          {user && (
            <div className="sidebar-public">
              <div className="sidebar-label">Gym</div>
              <NavLink to="/plans" className="nav-link">Plans</NavLink>
              <NavLink to="/timetable" className="nav-link">Timetable</NavLink>
            </div>
          )}
        </nav>
        <main className="content">{ready ? <Outlet /> : <Loading />}</main>
      </div>
    </div>
  );
}

/** Route guard: renders children only for the listed roles. */
export function RequireRole({ roles, children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="card">
        <h2>Not available</h2>
        <p className="muted">This page is not available for your account type.</p>
        <Link to={homeFor(user.role)} className="btn">
          Go to my home page
        </Link>
      </div>
    );
  }
  return children;
}
