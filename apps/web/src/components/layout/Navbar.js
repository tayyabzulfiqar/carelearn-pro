'use client';
import Link from 'next/link';
import { logout } from '@/lib/auth';
import useAuth from '@/hooks/useAuth';

export default function Navbar() {
  const { user } = useAuth();

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 md:px-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-navy-800 shadow-sm">
            <span className="text-sm font-bold text-white">CL</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">CareLearn Pro</p>
            <p className="hidden text-xs text-slate-500 sm:block">Care home compliance training</p>
          </div>
        </Link>

        <div className="flex-1" />

        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">
                {user.first_name} {user.last_name}
              </p>
              <p className="text-xs capitalize text-slate-500">{user.role.replace('_', ' ')}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
              {user.first_name?.[0]}{user.last_name?.[0]}
            </div>
            <button
              onClick={logout}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
