import { AdminEmptyState } from '@/components/admin/AdminStates';

export default function UsersAdminPage() {
  return (
    <AdminEmptyState
      title="User + Invitation Workflow Ready"
      description="User assignment and invitation APIs can now be layered on top of tenant + permission middleware in next batch."
    />
  );
}