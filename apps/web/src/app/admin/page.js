'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import AdminStatCard from '@/components/admin/AdminStatCard';
import { AdminErrorState, AdminLoadingState } from '@/components/admin/AdminStates';

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
        setError('Failed to load admin metrics.');
      } finally {
        setLoading(false);
      }
    }
    loadSummary();
  }, []);

  if (loading) return <AdminLoadingState title="Loading dashboard metrics..." />;
  if (error) return <AdminErrorState message={error} />;

  const cards = [
    { title: 'Total Users', value: summary?.users ?? 0 },
    { title: 'Courses', value: summary?.courses ?? 0 },
    { title: 'Enrollments', value: summary?.enrollments ?? 0 },
    { title: 'Completions', value: summary?.completions ?? 0 },
    { title: 'Certificates', value: summary?.certificates ?? 0 },
    { title: 'Completion Rate', value: `${summary?.completionRate ?? 0}%` },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <AdminStatCard key={card.title} title={card.title} value={card.value} />
        ))}
      </section>
    </div>
  );
}