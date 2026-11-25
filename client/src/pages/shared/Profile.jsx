import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useApi } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { roleLabel } from '../../lib/format.js';
import EntityForm from '../../components/EntityForm.jsx';
import { Alert, Card, PageHeader } from '../../components/ui.jsx';

export default function Profile() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState(null);
  const trainerProfile = useApi(user.role === 'trainer' ? '/trainers/me/profile' : null);

  return (
    <div>
      <PageHeader title="My profile" subtitle={`${roleLabel(user.role)} account`} />
      <Alert kind="success" onClose={() => setMessage(null)}>{message}</Alert>
      <div className="grid-2">
        <Card title="Personal details">
          <EntityForm
            fields={[
              { name: 'full_name', label: 'Full name', required: true },
              { name: 'email', label: 'Email', type: 'email', required: true },
              { name: 'phone', label: 'Phone', type: 'tel' },
              { name: 'date_of_birth', label: 'Date of birth', type: 'date' },
            ]}
            record={user}
            isEdit
            onSubmit={async (v) => {
              const { user: u } = await api('/auth/me', { method: 'PUT', body: v });
              setUser(u);
              setMessage('Profile updated.');
            }}
          />
        </Card>
        <Card title="Change password">
          <EntityForm
            key={message}
            fields={[
              { name: 'current_password', label: 'Current password', type: 'password', required: true, autoComplete: 'current-password', wide: true },
              { name: 'new_password', label: 'New password', type: 'password', required: true, autoComplete: 'new-password', wide: true },
            ]}
            onSubmit={async (v) => {
              await api('/auth/change-password', { method: 'POST', body: v });
              setMessage('Password changed.');
            }}
            submitLabel="Change password"
          />
        </Card>
        {user.role === 'trainer' && trainerProfile.data && (
          <Card title="Trainer profile (shown to members)">
            <EntityForm
              fields={[
                { name: 'specialties', label: 'Specialties', wide: true },
                { name: 'bio', label: 'Bio', type: 'textarea', wide: true, rows: 5 },
              ]}
              record={trainerProfile.data}
              isEdit
              onSubmit={async (v) => {
                await api('/trainers/me/profile', { method: 'PUT', body: v });
                setMessage('Trainer profile updated.');
              }}
            />
          </Card>
        )}
        <Card title="Delete account" className="danger-zone">
          <p className="muted">This permanently deletes your account and all of your data.</p>
          <EntityForm
            fields={[{ name: 'password', label: 'Confirm with your password', type: 'password', required: true, wide: true }]}
            onSubmit={async (v) => {
              await api('/auth/me', { method: 'DELETE', body: v });
              setUser(null);
              navigate('/');
            }}
            submitLabel="Delete my account"
          />
        </Card>
      </div>
    </div>
  );
}
