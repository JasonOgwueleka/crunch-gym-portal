import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { homeFor, useAuth } from '../../lib/auth.jsx';
import { Alert } from '../../components/ui.jsx';
import { useFormState, useSubmit } from './PublicPages.jsx';

function AuthCard({ title, children, footer }) {
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>{title}</h1>
        {children}
        {footer && <div className="auth-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Login() {
  const { user, login, notice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, bind] = useFormState({ email: '', password: '' });
  const { submit, error, busy } = useSubmit(async () => {
    const u = await login(values.email, values.password);
    navigate(location.state?.from || homeFor(u.role), { replace: true });
  });
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return (
    <AuthCard
      title="Log in"
      footer={
        <>
          <Link to="/forgot-password">Forgot your password?</Link>
          <span>
            New here? <Link to="/register">Create an account</Link>
          </span>
        </>
      }
    >
      <form className="form" onSubmit={submit}>
        {!error && <Alert kind="info">{notice}</Alert>}
        <Alert>{error}</Alert>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input type="email" required autoComplete="username" {...bind('email')} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input type="password" required autoComplete="current-password" {...bind('password')} />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthCard>
  );
}

export function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [values, bind] = useFormState({ full_name: '', email: '', phone: '', date_of_birth: '', password: '', confirm: '' });
  const { submit, error, setError, busy } = useSubmit(async () => {
    if (values.password !== values.confirm) {
      setError('Passwords do not match');
      return;
    }
    const { confirm, ...details } = values;
    await register(details);
    navigate('/membership', { replace: true });
  });
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return (
    <AuthCard title="Join Crunch Gym" footer={<span>Already a member? <Link to="/login">Log in</Link></span>}>
      <form className="form" onSubmit={submit}>
        <Alert>{error}</Alert>
        <div className="field">
          <label htmlFor="full_name">Full name *</label>
          <input required autoComplete="name" {...bind('full_name')} />
        </div>
        <div className="field">
          <label htmlFor="email">Email *</label>
          <input type="email" required autoComplete="email" {...bind('email')} />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input type="tel" autoComplete="tel" {...bind('phone')} />
          </div>
          <div className="field">
            <label htmlFor="date_of_birth">Date of birth</label>
            <input type="date" {...bind('date_of_birth')} />
          </div>
          <div className="field">
            <label htmlFor="password">Password *</label>
            <input type="password" required minLength={6} autoComplete="new-password" {...bind('password')} />
          </div>
          <div className="field">
            <label htmlFor="confirm">Confirm password *</label>
            <input type="password" required autoComplete="new-password" {...bind('confirm')} />
          </div>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthCard>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(null);
  const { submit, error, busy } = useSubmit(async () => {
    const r = await api('/auth/forgot-password', { method: 'POST', body: { email } });
    setDone(r.message);
  });
  return (
    <AuthCard title="Reset your password" footer={<Link to="/login">Back to log in</Link>}>
      {done ? (
        <Alert kind="success">{done} (In this demo the email is printed in the API server console.)</Alert>
      ) : (
        <form className="form" onSubmit={submit}>
          <Alert>{error}</Alert>
          <p className="muted">Enter your account email and we'll send you a reset link.</p>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy}>
            Send reset link
          </button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [values, bind] = useFormState({ password: '', confirm: '' });
  const [done, setDone] = useState(false);
  const { submit, error, setError, busy } = useSubmit(async () => {
    if (values.password !== values.confirm) {
      setError('Passwords do not match');
      return;
    }
    await api('/auth/reset-password', { method: 'POST', body: { token: params.get('token'), password: values.password } });
    setDone(true);
    setTimeout(() => navigate('/login'), 1500);
  });
  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <Alert kind="success">Password updated. Redirecting to log in…</Alert>
      ) : (
        <form className="form" onSubmit={submit}>
          <Alert>{error || (!params.get('token') && 'This link is missing its reset token.')}</Alert>
          <div className="field">
            <label htmlFor="password">New password</label>
            <input type="password" required minLength={6} {...bind('password')} />
          </div>
          <div className="field">
            <label htmlFor="confirm">Confirm new password</label>
            <input type="password" required {...bind('confirm')} />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy || !params.get('token')}>
            Update password
          </button>
        </form>
      )}
    </AuthCard>
  );
}
