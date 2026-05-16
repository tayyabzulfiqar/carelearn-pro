'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useAuth from '@/hooks/useAuth';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import Card from '@/components/ui/Card';
import api from '@/lib/api';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [enrollments, setEnrollments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get('/enrollments/my').catch(() => ({ data: { enrollments: [] } })),
      api.get('/courses').catch(() => ({ data: { courses: [] } })),
    ]).then(([enrollmentResponse, courseResponse]) => {
      setEnrollments(enrollmentResponse.data.enrollments || []);
      setCourses(courseResponse.data.courses || []);
      setFetching(false);
    });
  }, [user]);

  if (loading || !user) return null;

  const completed = enrollments.filter((item) => item.status === 'completed').length;
  const inProgress = enrollments.filter((item) => item.status === 'in_progress').length;
  const overdue = enrollments.filter((item) => item.status === 'overdue').length;
  const compliance = enrollments.length ? Math.round((completed / enrollments.length) * 100) : 0;

  const stats = [
    { label: 'Completed', value: completed, tone: 'text-green-700 bg-green-50 border-green-100' },
    { label: 'In Progress', value: inProgress, tone: 'text-blue-700 bg-blue-50 border-blue-100' },
    { label: 'Overdue', value: overdue, tone: 'text-red-700 bg-red-50 border-red-100' },
    { label: 'Compliance', value: `${compliance}%`, tone: 'text-navy-800 bg-navy-50 border-navy-100' },
  ];

  return (
    <div className="page-shell">
      <Navbar />
      <Sidebar />

      <main className="pt-20 lg:pl-64">
        <div className="page-container space-y-6 py-6">
          <section className="surface-card overflow-hidden p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Overview</p>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                  Welcome back, {user.first_name}
                </h1>
                <p className="text-sm text-gray-500">
                  Here&apos;s your training snapshot for today, including progress, compliance, and open learning.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-5 py-4 text-sm text-slate-600">
                {courses.length} courses available across your current workspace.
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className={`rounded-2xl border p-5 shadow-sm ${stat.tone}`}>
                <p className="text-sm font-medium opacity-80">{stat.label}</p>
                <p className="mt-3 text-3xl font-bold">{stat.value}</p>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl">
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">My Enrollments</h2>
                  <p className="text-sm text-gray-500">Current training assigned to you.</p>
                </div>

                {fetching ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((item) => (
                      <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />
                    ))}
                  </div>
                ) : enrollments.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-5 py-10 text-center">
                    <p className="text-sm text-gray-500">No enrollments yet.</p>
                    <p className="mt-1 text-xs text-gray-400">Ask your manager to assign your first course.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {enrollments.slice(0, 5).map((item) => (
                      <Link
                        key={item.id}
                        href={`/dashboard/courses/${item.course_id}/player`}
                        className="flex items-center justify-between rounded-2xl border border-gray-100 px-4 py-4 hover:bg-slate-50 hover:border-blue-200 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 pr-4">
                          <p className="truncate text-sm font-semibold text-gray-900">{item.course_title}</p>
                          <p className="mt-1 text-xs text-gray-500">{item.category} - {item.duration_minutes} min</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-700">
                            {item.status.replace('_', ' ')}
                          </span>
                          <span className="text-blue-600 text-xs font-medium">Start →</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card className="rounded-2xl">
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Available Courses</h2>
                  <p className="text-sm text-gray-500">Courses ready to start or revisit.</p>
                </div>

                {fetching ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((item) => (
                      <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />
                    ))}
                  </div>
                ) : courses.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-5 py-10 text-center">
                    <p className="text-sm text-gray-500">No courses available.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {courses.slice(0, 5).map((item) => (
                      <Link
                        key={item.id}
                        href={`/dashboard/courses/${item.id}/player`}
                        className="flex items-center justify-between rounded-2xl border border-gray-100 px-4 py-4 hover:bg-slate-50 hover:border-blue-200 transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 pr-4">
                          <p className="truncate text-sm font-semibold text-gray-900">{item.title}</p>
                          <p className="mt-1 text-xs text-gray-500">{item.category} - {item.duration_minutes} min</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.is_mandatory && (
                            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                              Mandatory
                            </span>
                          )}
                          <span className="text-blue-600 text-xs font-medium">Open →</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
