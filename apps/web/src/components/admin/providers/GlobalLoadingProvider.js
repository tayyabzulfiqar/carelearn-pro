'use client';

import { createContext, useContext, useMemo, useState } from 'react';

const GlobalLoadingContext = createContext(null);

export function GlobalLoadingProvider({ children }) {
  const [pending, setPending] = useState(0);
  const value = useMemo(() => ({
    start: () => setPending((prev) => prev + 1),
    stop: () => setPending((prev) => Math.max(0, prev - 1)),
  }), []);

  return (
    <GlobalLoadingContext.Provider value={value}>
      {children}
      {pending > 0 ? (
        <div className="fixed inset-x-0 top-0 z-50 h-1 bg-blue-100">
          <div className="h-full w-1/3 animate-pulse bg-blue-600" />
        </div>
      ) : null}
    </GlobalLoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const context = useContext(GlobalLoadingContext);
  if (!context) return { start: () => {}, stop: () => {} };
  return context;
}
