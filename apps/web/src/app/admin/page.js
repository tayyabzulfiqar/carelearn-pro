'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import AdminStatCard from '@/components/admin/AdminStatCard';
import { AdminErrorState, AdminLoadingState, AdminEmptyState } from '@/components/admin/AdminStates';

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadSummary() {
      try {
        const response = await api.get('/admin/dashboard');
        setSummary(response.data?.data || null);
      } catch (_err) {
        setError('Unable to load operational dashboard metrics right now.');
      } finally {
        setLoading(false);
      }
    }
    loadSummary();
  }, []);

  const cards = useMemo(() => ([
    { title: 'Active Learners', value: summary?.users ?? 0, subtitle: 'Users currently on platform' },
    { title: 'Published Trainings', value: summary?.courses ?? 0, subtitle: 'Available healthcare courses' },
    { title: 'Live Enrollments', value: summary?.enrollments ?? 0, subtitle: 'Current learner assignments' },
    { title: 'Completions', value: summary?.completions ?? 0, subtitle: 'Completed training records' },
    { title: 'Certificates Issued', value: summary?.certificates ?? 0, subtitle: 'Awarded compliance certificates' },
    { title: 'Completion Rate', value: `${summary?.completionRate ?? 0}%`, subtitle: 'Organisation learning progress' },
  ]), [summary]);

  if (loading) return <AdminLoadingState title="Preparing CareLearn operations workspace..." />;
  if (error) return <AdminErrorState message={error} />;

  return (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">CareLearn Operations</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Healthcare Training Control Centre</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Manage course publishing, media assets, learner compliance, and certificates through a structured admin workflow.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/trainings/new" className="btn-primary">Create Training</Link>
            <Link href="/admin/media" className="btn-secondary">Upload Media</Link>
            <Link href="/admin/courses" className="btn-secondary">Open Builder</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <AdminStatCard key={card.title} title={card.title} value={card.value} subtitle={card.subtitle} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="surface-card p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900">Recommended Next Actions</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50" href="/admin/trainings/new">
              <p className="text-sm font-semibold text-slate-900">Create Structured Training</p>
              <p className="mt-1 text-xs text-slate-600">Use wizard-based publishing with media and indexing support.</p>
            </Link>
            <Link className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50" href="/admin/media">
              <p className="text-sm font-semibold text-slate-900">Curate Media Library</p>
              <p className="mt-1 text-xs text-slate-600">Upload documents, videos, and visuals for consistent lesson rendering.</p>
            </Link>
            <Link className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50" href="/admin/trainings">
              <p className="text-sm font-semibold text-slate-900">Publish & Archive Trainings</p>
              <p className="mt-1 text-xs text-slate-600">Control visibility, lifecycle, and learner availability.</p>
            </Link>
            <Link className="rounded-xl border border-slate-200 p-4 hover:bg-slate-50" href="/admin/certificates">
              <p className="text-sm font-semibold text-slate-900">Review Certificates</p>
              <p className="mt-1 text-xs text-slate-600">Maintain completion records and certificate templates.</p>
            </Link>
          </div>
        </article>

        <article className="surface-card p-5">
          {(summary?.courses || 0) === 0 ? (
            <AdminEmptyState
              title="No Published Healthcare Training Yet"
              description="Start by creating your first training using the guided wizard."
            />
          ) : (
            <>
              <h2 className="text-lg font-semibold text-slate-900">Readiness Snapshot</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>Training catalog is active.</li>
                <li>Admin workflows are available.</li>
                <li>Learner portal is enabled.</li>
              </ul>
            </>
          )}
        </article>
      </section>
    </div>
  );
}
