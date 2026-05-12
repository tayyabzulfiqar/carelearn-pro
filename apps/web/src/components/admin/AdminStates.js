export function AdminLoadingState({ title = 'Loading...' }) {
  return (
    <div className="surface-card p-6">
      <p className="animate-pulse text-sm text-gray-500">{title}</p>
    </div>
  );
}

export function AdminErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="surface-card border-red-200 bg-red-50 p-6">
      <p className="text-sm text-red-700">{message}</p>
      {onRetry ? (
        <button type="button" className="btn-secondary mt-4" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function AdminEmptyState({ title = 'No data yet', description = 'Create your first record to get started.', children = null }) {
  return (
    <div className="surface-card p-8 text-center">
      <p className="text-base font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm text-gray-500">{description}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
