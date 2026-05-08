import { AdminEmptyState } from '@/components/admin/AdminStates';

export default function CoursesBuilderPage() {
  return (
    <div className="space-y-4">
      <div className="surface-card p-5">
        <h2 className="text-lg font-semibold text-slate-900">Course Builder</h2>
        <p className="mt-2 text-sm text-gray-600">
          Foundation ready for chapter/module authoring, publish workflow, and content governance.
        </p>
      </div>
      <AdminEmptyState title="Builder workspace initialized" description="Connect drag-drop authoring components in the next execution batch." />
    </div>
  );
}