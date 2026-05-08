'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { adminNavItems, canAccess } from '@/lib/admin/navigation';

export default function AdminSidebar({ permissions = [] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);

  const visibleNav = useMemo(
    () => adminNavItems.filter((item) => canAccess(item, permissions)),
    [permissions]
  );

  return (
    <aside className={`border-r border-gray-200 bg-white ${open ? 'w-72' : 'w-20'} transition-all`}>
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4">
        <div className="font-display text-lg font-semibold text-slate-900">
          {open ? 'CareLearn CMS' : 'CL'}
        </div>
        <button
          type="button"
          className="rounded-md border border-gray-300 px-2 py-1 text-xs"
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? 'Collapse' : 'Open'}
        </button>
      </div>

      <nav className="space-y-1 p-3">
        {visibleNav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-gray-100'
              }`}
            >
              {open ? item.label : item.label.slice(0, 2).toUpperCase()}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}