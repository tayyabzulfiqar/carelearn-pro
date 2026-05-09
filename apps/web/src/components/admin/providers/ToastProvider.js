'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((type, message) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setItems((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setItems((prev) => prev.filter((item) => item.id !== id)), 2600);
  }, []);

  const value = useMemo(() => ({
    success: (message) => push('success', message),
    info: (message) => push('info', message),
    error: (message) => push('error', message),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-50 flex w-72 flex-col gap-2">
        {items.map((item) => (
          <div key={item.id} className={`rounded-lg border p-3 text-sm shadow-md ${
            item.type === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : item.type === 'error' ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-blue-300 bg-blue-50 text-blue-800'
          }`}>
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      success: () => {},
      info: () => {},
      error: () => {},
    };
  }
  return context;
}
