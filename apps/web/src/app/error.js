'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('Global render error', error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-rose-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-rose-600">Render recovery</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-900">Something broke on this page</h2>
        <p className="mt-2 text-sm text-slate-500">Try recovering the UI session. If this keeps happening, refresh the page.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" className="btn-primary" onClick={() => reset()}>Recover</button>
          <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>Hard Refresh</button>
        </div>
      </div>
    </div>
  );
}
