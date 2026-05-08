'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import AdminTable from '@/components/admin/AdminTable';
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from '@/components/admin/AdminStates';

export default function TrainingsPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadCourses() {
      try {
        const response = await api.get('/courses?status=published');
        setCourses(response.data?.courses || []);
      } catch (_err) {
        setError('Failed to load training catalog.');
      } finally {
        setLoading(false);
      }
    }
    loadCourses();
  }, []);

  if (loading) return <AdminLoadingState title="Loading trainings..." />;
  if (error) return <AdminErrorState message={error} />;
  if (!courses.length) return <AdminEmptyState title="No trainings yet" description="Create your first training in Course Builder." />;

  return (
    <AdminTable
      columns={[
        { key: 'title', label: 'Course' },
        { key: 'category', label: 'Category' },
        { key: 'duration_minutes', label: 'Duration (min)' },
        { key: 'status', label: 'Status' },
      ]}
      rows={courses}
    />
  );
}