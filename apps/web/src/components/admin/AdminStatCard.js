export default function AdminStatCard({ title, value, subtitle }) {
  return (
    <div className="surface-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      {subtitle ? <p className="mt-2 text-sm text-gray-500">{subtitle}</p> : null}
    </div>
  );
}