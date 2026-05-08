export default function AdminTopbar({ user }) {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Admin Console</h1>
        <p className="text-sm text-slate-500">CMS foundation for multi-tenant healthcare training</p>
      </div>
      <div className="text-sm text-slate-600">
        <span className="font-medium">{user?.first_name || 'Admin'} {user?.last_name || ''}</span>
        <span className="ml-2 rounded bg-gray-100 px-2 py-1 text-xs uppercase">{user?.role || 'unknown'}</span>
      </div>
    </header>
  );
}