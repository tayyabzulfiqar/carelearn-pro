'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/hooks/useAuth';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import api from '@/lib/api';

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' });
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '' });
  const [avatar, setAvatar] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (user) {
      setForm({ first_name: user.first_name || '', last_name: user.last_name || '', email: user.email || '' });
    }
  }, [loading, user, router]);

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!user?.id) return;
    setSaving(true);
    setMessage('');
    try {
      await api.put(`/users/${user.id}`, form);
      setMessage('Profile updated successfully.');
    } catch {
      setMessage('Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (!password.newPassword) return;
    setSaving(true);
    setMessage('');
    try {
      await api.post('/auth/change-password', password);
      setPassword({ currentPassword: '', newPassword: '' });
      setMessage('Password updated successfully.');
    } catch {
      setMessage('Password change endpoint unavailable.');
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async () => {
    if (!avatar) return;
    setSaving(true);
    setMessage('');
    try {
      const payload = new FormData();
      payload.append('images', avatar);
      await api.post('/upload/images', payload, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMessage('Avatar uploaded.');
    } catch {
      setMessage('Avatar upload failed.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="page-shell">
      <Navbar />
      <Sidebar />
      <main className="pt-20 lg:pl-64">
        <div className="page-container space-y-6 py-6">
          <section className="surface-card p-6">
            <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
            <p className="mt-1 text-sm text-slate-500">Manage account details, password, and avatar.</p>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <form className="surface-card space-y-3 p-4" onSubmit={saveProfile}>
              <h2 className="text-base font-semibold text-slate-900">Account Details</h2>
              <input className="field-input" placeholder="First name" value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
              <input className="field-input" placeholder="Last name" value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
              <input className="field-input" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
            </form>

            <form className="surface-card space-y-3 p-4" onSubmit={changePassword}>
              <h2 className="text-base font-semibold text-slate-900">Change Password</h2>
              <input className="field-input" type="password" placeholder="Current password" value={password.currentPassword} onChange={(e) => setPassword((p) => ({ ...p, currentPassword: e.target.value }))} />
              <input className="field-input" type="password" placeholder="New password" value={password.newPassword} onChange={(e) => setPassword((p) => ({ ...p, newPassword: e.target.value }))} />
              <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Updating...' : 'Update Password'}</button>
            </form>
          </section>

          <section className="surface-card space-y-3 p-4">
            <h2 className="text-base font-semibold text-slate-900">Avatar Upload</h2>
            <input type="file" accept="image/*" onChange={(e) => setAvatar(e.target.files?.[0] || null)} />
            <button className="btn-secondary" type="button" onClick={uploadAvatar} disabled={saving || !avatar}>Upload Avatar</button>
          </section>

          {message ? <section className="surface-card p-3 text-sm text-slate-600">{message}</section> : null}
        </div>
      </main>
    </div>
  );
}
