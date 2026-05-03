'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/hooks/useAuth';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import api from '@/lib/api';

const CAT_COLORS = {
  'Health & Safety': 'bg-blue-50 text-blue-700 border-blue-100',
  'Safeguarding Adults': 'bg-purple-50 text-purple-700 border-purple-100',
  'Infection Control': 'bg-green-50 text-green-700 border-green-100',
  'Fire Safety': 'bg-red-50 text-red-700 border-red-100',
  'Mental Capacity Act': 'bg-amber-50 text-amber-700 border-amber-100',
  'Medication Awareness': 'bg-teal-50 text-teal-700 border-teal-100',
};

export default function CoursesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [enrolling, setEnrolling] = useState(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get('/courses'),
      api.get('/enrollments/my').catch(() => ({ data: { enrollments: [] } })),
    ]).then(([courseResponse, enrollmentResponse]) => {
      setCourses(courseResponse.data.courses || []);
      setEnrollments(enrollmentResponse.data.enrollments || []);
      setFetching(false);
    }).catch(() => setFetching(false));
  }, [user]);

  const getEnrollment = (id) => enrollments.find((item) => item.course_id === id);

  const handleEnroll = async (courseId) => {
    setEnrolling(courseId);
    try {
      await api.post('/enrollments', { user_id: user.id, course_id: courseId });
      const response = await api.get('/enrollments/my');
      setEnrollments(response.data.enrollments || []);
    } catch (err) {
      console.error(err);
    }
    setEnrolling(null);
  };

  if (loading || !user) return null;

  return (
    <div className="page-shell">
      <Navbar />
      <Sidebar />

      <main className="pt-20 lg:pl-64">
        <div className="page-container space-y-6 py-6">
          <section className="surface-card overflow-hidden p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
                  Course Library
                </p>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">All Courses</h1>
                <p className="text-sm text-gray-500">
                  {courses.length} CQC-aligned training courses available for your team.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Keep progress moving with clean lesson cards and one-click resume.
              </div>
            </div>
          </section>

          {fetching ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <div key={item} className="h-72 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-sm" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => {
                const enrollment = getEnrollment(course.id);
                const percent = enrollment?.total_lessons > 0
                  ? Math.round((enrollment.completed_lessons / enrollment.total_lessons) * 100)
                  : 0;
                const categoryClass = CAT_COLORS[course.category] || 'bg-gray-50 text-gray-700 border-gray-200';

                return (
                  <Card
                    key={course.id}
                    className="flex h-full flex-col rounded-2xl border border-gray-200 p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold leading-tight text-gray-900">{course.title}</h3>
                        <p className="text-sm text-gray-500">{course.description}</p>
                      </div>
                      {course.is_mandatory && (
                        <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
                          Required
                        </span>
                      )}
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${categoryClass}`}>
                        {course.category}
                      </span>
                      {course.cqc_reference && (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                          {course.cqc_reference}
                        </span>
                      )}
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Duration</p>
                        <p className="mt-1 font-semibold text-slate-900">{course.duration_minutes} min</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {enrollment ? enrollment.status.replace('_', ' ') : 'Not enrolled'}
                        </p>
                      </div>
                    </div>

                    {enrollment && enrollment.total_lessons > 0 && (
                      <div className="mt-6 space-y-2">
                        <div className="flex items-center justify-between text-sm text-slate-500">
                          <span>Progress</span>
                          <span>{percent}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-blue-600 transition-all"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-6">
                      {enrollment ? (
                        <Button
                          onClick={() => router.push(`/dashboard/courses/${course.id}/player`)}
                          className="w-full bg-blue-600 hover:bg-blue-700"
                          variant="primary"
                        >
                          {enrollment.status === 'completed'
                            ? 'Review Course'
                            : enrollment.status === 'in_progress'
                              ? 'Continue Course'
                              : 'Start Course'}
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handleEnroll(course.id)}
                          loading={enrolling === course.id}
                          className="w-full"
                          variant="outline"
                        >
                          Enrol Now
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
