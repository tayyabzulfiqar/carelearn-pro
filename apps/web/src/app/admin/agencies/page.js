'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

const EMPTY = {
  name: '',
  slug: '',
  billing_email: '',
  organisation_name: '',
};

export default function AgenciesPage() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [orgId, setOrgId] = useState('');
  const [sub, setSub] = useState({ state: 'trial', seat_limit: 50, trial_seat_limit: 10 });
  const [error, setError] = useState('');

  async function load() {
    try {
      const data = await api.get('/admin/platform/agencies');
      setRows(data.data?.data?.agencies || []);
    } catch (_err) {
      setError('Unable to load agencies.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createAgency(e) {
    e.preventDefault();
    await api.post('/admin/platform/agencies', form);
    setForm(EMPTY);
    await load();
  }

  async function changeStatus(agencyId, status) {
    await api.post(`/admin/platform/agencies/${agencyId}/status`, { status });
    await load();
  }

  async function saveSubscription(e) {
    e.preventDefault();
    await api.post(`/admin/platform/organisations/${orgId}/subscription`, sub);
    setOrgId('');
  }

  return (
    <div className="space-y-4">
      <section className="surface-card p-5">
        <h1 className="text-xl font-semibold text-slate-900">Platform Agency Governance</h1>
        <p className="mt-1 text-sm text-slate-600">Create/suspend/archive agencies and control deterministic subscription states.</p>
      </section>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <section className="surface-card p-5">
        <h2 className="text-sm font-semibold text-slate-900">Create Agency</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={createAgency}>
          <input className="field-input" placeholder="Agency name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          <input className="field-input" placeholder="Agency slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required />
          <input className="field-input" placeholder="Billing email" value={form.billing_email} onChange={(e) => setForm((f) => ({ ...f, billing_email: e.target.value }))} />
          <input className="field-input" placeholder="Organisation display name" value={form.organisation_name} onChange={(e) => setForm((f) => ({ ...f, organisation_name: e.target.value }))} />
          <button className="btn-primary md:col-span-2" type="submit">Create Agency</button>
        </form>
      </section>
      <section className="surface-card p-5">
        <h2 className="text-sm font-semibold text-slate-900">Subscription Governance</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-4" onSubmit={saveSubscription}>
          <input className="field-input md:col-span-2" placeholder="Organisation ID" value={orgId} onChange={(e) => setOrgId(e.target.value)} required />
          <select className="field-input" value={sub.state} onChange={(e) => setSub((s) => ({ ...s, state: e.target.value }))}>
            <option value="active">active</option>
            <option value="trial">trial</option>
            <option value="expired">expired</option>
            <option value="suspended">suspended</option>
            <option value="cancelled">cancelled</option>
          </select>
          <input className="field-input" type="number" value={sub.seat_limit} onChange={(e) => setSub((s) => ({ ...s, seat_limit: Number(e.target.value) }))} />
          <input className="field-input" type="number" value={sub.trial_seat_limit} onChange={(e) => setSub((s) => ({ ...s, trial_seat_limit: Number(e.target.value) }))} />
          <button className="btn-primary md:col-span-4" type="submit">Save Subscription</button>
        </form>
      </section>
      <section className="surface-card p-5">
        <h2 className="text-sm font-semibold text-slate-900">Agencies</h2>
        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded border border-slate-200 p-3">
              <p className="font-medium text-slate-900">{row.name} <span className="text-xs text-slate-500">({row.slug})</span></p>
              <p className="text-xs text-slate-600">Status: {row.status} | Organisation: {row.organisation_id || 'not linked'}</p>
              <div className="mt-2 flex gap-2">
                <button className="btn-secondary" type="button" onClick={() => changeStatus(row.id, 'active')}>Activate</button>
                <button className="btn-secondary" type="button" onClick={() => changeStatus(row.id, 'suspended')}>Suspend</button>
                <button className="btn-secondary" type="button" onClick={() => changeStatus(row.id, 'archived')}>Archive</button>
              </div>
            </div>
          ))}
          {!rows.length ? <p className="text-sm text-slate-500">No agencies available.</p> : null}
        </div>
      </section>
    </div>
  );
}
