'use client';
import { useEffect, useState } from 'react';
import lessonSectionUtils from '@/lib/lesson-sections';

export default function CertificateView({ certificate, course, user, onDone }) {
  const [show, setShow] = useState(false);
  const { resolveImageUrl } = lessonSectionUtils;

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const template = certificate?.template || {};
  const backgroundImage = template.backgroundImage
    ? resolveImageUrl(`/api/v1/local-images/${template.backgroundImage.split('\\').pop().split('/').pop()}`)
    : resolveImageUrl('/api/v1/local-images/certificate_fire_safety.png');

  return (
    <div className="min-h-screen bg-[#f2efe8] flex flex-col items-center justify-center p-6">
      <div className={`w-full max-w-5xl transition-all duration-700 ${show ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-navy-900">Certificate Ready</h1>
          <p className="text-stone-600">Preview and download the completed Fire Safety certificate.</p>
        </div>

        <div className="mb-6 rounded-[28px] bg-white shadow-2xl p-4">
          <div className="relative overflow-hidden rounded-[22px] border border-stone-200 bg-stone-100 aspect-[1.414/1]">
            <img
              src={backgroundImage}
              alt="Fire safety certificate"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0">
              <div className="absolute left-1/2 top-[45%] -translate-x-1/2 text-center w-[70%]">
                <h2 className="text-4xl font-semibold tracking-[0.08em] text-[#3b2418]">
                  {template.recipientName || `${user?.first_name || ''} ${user?.last_name || ''}`.trim()}
                </h2>
                <p className="mt-3 text-sm uppercase tracking-[0.32em] text-[#72584a]">{course?.title}</p>
              </div>
              <div className="absolute left-[14%] bottom-[14%] text-left">
                <p className="text-xs uppercase tracking-[0.24em] text-[#72584a]">Date</p>
                <p className="mt-1 text-base font-semibold text-[#3b2418]">{template.issuedDate}</p>
              </div>
              <div className="absolute right-[13%] bottom-[14%] text-right">
                <p className="text-xs uppercase tracking-[0.24em] text-[#72584a]">Status</p>
                <p className="mt-1 text-base font-semibold text-[#3b2418]">{template.statusText || 'PASS'}</p>
              </div>
              <div className="absolute right-[12%] bottom-[24%] text-center">
                <p className="text-sm italic text-[#3b2418]">Authorised by {template.authorizedBy || 'Nargis Nawaz'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-4">
          <button
            onClick={() => window.print()}
            className="rounded-xl border border-navy-900/10 bg-white px-6 py-3 text-sm font-medium text-navy-900 transition-colors hover:bg-stone-50"
          >
            Download Certificate
          </button>
          <button
            onClick={onDone}
            className="rounded-xl bg-navy-800 px-6 py-3 text-sm font-medium text-white shadow-lg transition-colors hover:bg-navy-700"
          >
            Back to Courses
          </button>
        </div>
      </div>
    </div>
  );
}
