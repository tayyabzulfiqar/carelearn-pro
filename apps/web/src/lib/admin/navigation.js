export const adminNavItems = [
  { label: 'Dashboard', href: '/admin', key: 'dashboard.read' },
  { label: 'Training Catalogue', href: '/admin/trainings', key: 'training.read' },
  { label: 'Users', href: '/admin/users', key: 'user.read' },
  { label: 'Agencies', href: '/admin/agencies', key: 'agency.read' },
  { label: 'Analytics', href: '/admin/analytics', key: 'analytics.read' },
  { label: 'Audit Logs', href: '/admin/audit-logs', key: 'audit.read' },
  { label: 'Settings', href: '/admin/settings', key: 'settings.write' },
  { label: 'Media Library', href: '/admin/media', key: 'media.write' },
];

export function canAccess(navItem, permissions) {
  if (!permissions || !Array.isArray(permissions)) return false;
  return permissions.includes('*') || permissions.includes(navItem.key);
}
