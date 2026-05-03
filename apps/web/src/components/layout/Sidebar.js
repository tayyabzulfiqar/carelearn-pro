'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';

const nav = [
  { href: '/dashboard', label: 'Dashboard', short: 'DB' },
  { href: '/dashboard/courses', label: 'My Courses', short: 'MC' },
  { href: '/dashboard/certificates', label: 'Certificates', short: 'CF' },
  { href: '/dashboard/profile', label: 'Profile', short: 'PR' },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <aside className="fixed bottom-0 left-0 top-16 z-40 hidden w-64 border-r border-slate-200 bg-white lg:block">
      <div className="flex h-full flex-col px-4 py-6">
        <p className="px-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Workspace
        </p>
        <nav className="mt-4 flex flex-col gap-2">
          {nav.map((item) => {
            const active = path === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all',
                  active
                    ? 'bg-navy-800 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                <span
                  className={clsx(
                    'inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold',
                    active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
                  )}
                >
                  {item.short}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
