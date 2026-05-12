'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuth from '@/hooks/useAuth';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import api from '@/lib/api';

export default function CertificatesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [certificates, setCertificates] = useState([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [loading, user, router]);

  useEffect(() => {
    async function loadCertificates() {
      if (!user?.id) return;
      try {
        const response = await api.get(`/certificates/user/${user.id}`);
        setCertificates(response.data?.certificates || []);
      } finally {
        setFetching(false);
      }
    }
    loadCertificates();
  }, [user?.id]);

  if (loading || !user) return null;

  return (
    <div className="page-shell">
      <Navbar />
      <Sidebar />
      <main className="pt-20 lg:pl-64">
        <div className="page-container space-y-6 py-6">
          <section className="surface-card p-6">
            <h1 className="text-2xl font-bold text-slate-900">Certificates</h1>
            <p className="mt-1 text-sm text-slate-500">View and download your earned certificates.</p>
          </section>

          {fetching ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : certificates.length === 0 ? (
            <section className="surface-card p-6 text-sm text-slate-500">No certificates yet. Complete a training and pass the final quiz to unlock one.</section>
          ) : (
            <section className="grid gap-4 md:grid-cols-2">
              {certificates.map((certificate) => {
                const imageUrl = certificate.certificate_image_url || certificate.certificate_url;
                return (
                  <article key={certificate.id} className="surface-card space-y-3 p-4">
                    <h2 className="text-base font-semibold text-slate-900">{certificate.course_title || 'Training Certificate'}</h2>
                    <p className="text-xs text-slate-500">Certificate No: {certificate.certificate_number || 'Pending'}</p>
                    <p className="text-xs text-slate-500">Issued: {certificate.issue_date ? new Date(certificate.issue_date).toLocaleDateString() : 'N/A'}</p>
                    <div className="flex flex-wrap gap-2">
                      {imageUrl ? <a className="btn-secondary" href={imageUrl} target="_blank" rel="noreferrer">Preview</a> : null}
                      {imageUrl ? <a className="btn-primary" href={imageUrl} download>Download</a> : null}
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
