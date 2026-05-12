'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { cmsGet, cmsPost } from '@/lib/admin/cmsApi';
import AdminTable from '@/components/admin/AdminTable';
import { AdminErrorState, AdminLoadingState } from '@/components/admin/AdminStates';

export default function UsersAdminPage() {
  const [users, setUsers] = useState([]);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState({ email: '', role: 'learner' });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, membersRes, inviteRes] = await Promise.all([
        api.get('/users').catch(() => ({ data: { users: [] } })),
        cmsGet('/members').catch(() => ({ members: [] })),
        cmsGet('/invitations').catch(() => ({ invitations: [] })),
      ]);
      setUsers(usersRes.data?.users || []);
      setMembers(membersRes?.members || []);
      setInvitations(inviteRes?.invitations || []);
    } catch {
      setError('Unable to load users and invitations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sendInvite = async (e) => {
    e.preventDefault();
    await cmsPost('/invitations', { email: invite.email, role: invite.role, expires_in_days: 7 });
    setInvite({ email: '', role: 'learner' });
    await load();
  };

  if (loading) return <AdminLoadingState title="Loading users..." />;
  if (error) return <AdminErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <form className="surface-card grid gap-3 p-4 md:grid-cols-4" onSubmit={sendInvite}>
        <input className="field-input md:col-span-2" placeholder="Invite user email" value={invite.email} onChange={(e) => setInvite((p) => ({ ...p, email: e.target.value }))} required />
        <select className="field-input" value={invite.role} onChange={(e) => setInvite((p) => ({ ...p, role: e.target.value }))}>
          <option value="learner">Learner</option>
          <option value="org_admin">Org Admin</option>
        </select>
        <button className="btn-primary" type="submit">Send Invite</button>
      </form>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Users</h2>
        <AdminTable columns={[{ key: 'email', label: 'Email' }, { key: 'first_name', label: 'First Name' }, { key: 'last_name', label: 'Last Name' }, { key: 'role', label: 'Role' }]} rows={users} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Organisation Members</h2>
        <AdminTable columns={[{ key: 'email', label: 'Email', render: (r) => r.email }, { key: 'role', label: 'Role' }, { key: 'joined_at', label: 'Joined', render: (r) => r.joined_at ? new Date(r.joined_at).toLocaleDateString() : '' }]} rows={members} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Pending Invitations</h2>
        <AdminTable columns={[{ key: 'email', label: 'Email' }, { key: 'role', label: 'Role' }, { key: 'status', label: 'Status' }, { key: 'expires_at', label: 'Expires', render: (r) => r.expires_at ? new Date(r.expires_at).toLocaleDateString() : '' }]} rows={invitations} />
      </section>
    </div>
  );
}
