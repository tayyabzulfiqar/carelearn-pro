'use client';

import { useEffect, useState } from 'react';
import { cmsGet, cmsPost } from '@/lib/admin/cmsApi';
import { AdminErrorState, AdminLoadingState } from '@/components/admin/AdminStates';

const DEFAULTS = {
  portal_title: 'CareLearn Pro',
  support_email: '',
  default_pass_mark: 75,
  certificates_enabled: true,
  allow_self_enrollment: false,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await cmsGet('/settings');
      const map = (data?.settings || []).reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      setSettings({ ...DEFAULTS, ...map });
    } catch {
      setError('Failed to load organisation settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await Promise.all(Object.entries(settings).map(([key, value]) => cmsPost('/settings', { key, value })));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AdminLoadingState title="Loading settings..." />;
  if (error) return <AdminErrorState message={error} onRetry={load} />;

  return (
    <form className="surface-card space-y-3 p-4" onSubmit={save}>
      <h2 className="text-base font-semibold">LMS Settings</h2>
      <input className="field-input" value={settings.portal_title} onChange={(e) => setSettings((p) => ({ ...p, portal_title: e.target.value }))} placeholder="Portal title" />
      <input className="field-input" value={settings.support_email} onChange={(e) => setSettings((p) => ({ ...p, support_email: e.target.value }))} placeholder="Support email" />
      <input className="field-input" type="number" value={settings.default_pass_mark} onChange={(e) => setSettings((p) => ({ ...p, default_pass_mark: Number(e.target.value || 75) }))} placeholder="Default pass mark" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.certificates_enabled} onChange={(e) => setSettings((p) => ({ ...p, certificates_enabled: e.target.checked }))} /> Enable certificates</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.allow_self_enrollment} onChange={(e) => setSettings((p) => ({ ...p, allow_self_enrollment: e.target.checked }))} /> Allow self-enrollment</label>
      <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
    </form>
  );
}
