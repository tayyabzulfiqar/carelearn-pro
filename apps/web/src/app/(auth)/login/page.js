'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { login } from '@/lib/auth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const DEMO_ROLES = [
  {
    key: 'super_admin',
    label: 'Super Admin',
    description: 'Full platform access — manage all training, users, and content',
    icon: '⚙️',
    email: 'admin@carelearn.pro',
    password: 'Admin1234!',
    badge: 'Platform',
    color: 'from-slate-800 to-slate-900',
    ring: 'ring-slate-700',
    badgeColor: 'bg-slate-700 text-white',
  },
  {
    key: 'platform_owner',
    label: 'Platform Owner',
    description: 'Manage agencies, subscriptions, and platform-level settings',
    icon: '🏢',
    email: 'owner@carelearn.pro',
    password: 'Owner1234!',
    badge: 'Owner',
    color: 'from-indigo-700 to-indigo-900',
    ring: 'ring-indigo-600',
    badgeColor: 'bg-indigo-600 text-white',
  },
  {
    key: 'agency_admin',
    label: 'Agency Admin',
    description: 'Assign trainings, manage staff, track completion for your care agency',
    icon: '🏥',
    email: 'john.smith.1778860699@medcare.com',
    password: 'Tmp-urDFllyS04NMB7!',
    badge: 'Agency',
    color: 'from-emerald-700 to-emerald-900',
    ring: 'ring-emerald-600',
    badgeColor: 'bg-emerald-600 text-white',
  },
  {
    key: 'learner',
    label: 'Learner / Staff',
    description: 'Access assigned trainings, complete assessments, download certificates',
    icon: '🎓',
    email: 'tayyabzulfiqar700@gmail.com',
    password: 'Admin1234!',
    badge: 'Learner',
    color: 'from-amber-600 to-amber-800',
    ring: 'ring-amber-500',
    badgeColor: 'bg-amber-500 text-white',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [activeRole, setActiveRole] = useState(null);
  const [showDemo, setShowDemo] = useState(true);

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  });

  const selectRole = (role) => {
    setActiveRole(role.key);
    setValue('email', role.email);
    setValue('password', role.password);
    setError('');
  };

  const onSubmit = async (data) => {
    setError('');
    try {
      const { user } = await login(data.email, data.password);
      router.push(user?.role === 'super_admin' || user?.role === 'platform_owner' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-2">
            <div className="w-11 h-11 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">CL</span>
            </div>
            <div className="text-left">
              <p className="text-slate-900 font-bold text-xl leading-none">CareLearn Pro</p>
              <p className="text-slate-500 text-xs">UK Care Training Platform</p>
            </div>
          </Link>
        </div>

        {/* Demo Role Cards */}
        {showDemo && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-700">Select your role to continue</p>
              <button
                type="button"
                onClick={() => setShowDemo(false)}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Sign in manually →
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {DEMO_ROLES.map((role) => (
                <button
                  key={role.key}
                  type="button"
                  onClick={() => selectRole(role)}
                  className={`group relative text-left rounded-2xl p-4 transition-all duration-200 border-2
                    ${activeRole === role.key
                      ? 'border-transparent ring-2 ' + role.ring + ' bg-white shadow-lg scale-[1.02]'
                      : 'border-transparent bg-white hover:shadow-md hover:scale-[1.01] shadow-sm'
                    }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${role.color} flex items-center justify-center text-lg flex-shrink-0 shadow-sm`}>
                      {role.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-slate-900 text-sm">{role.label}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${role.badgeColor}`}>{role.badge}</span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{role.description}</p>
                    </div>
                  </div>
                  {activeRole === role.key && (
                    <div className="absolute top-2 right-2 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Login Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
          {activeRole && (
            <div className={`bg-gradient-to-r ${DEMO_ROLES.find(r => r.key === activeRole)?.color} px-6 py-3`}>
              <p className="text-white/90 text-sm font-medium">
                Signing in as {DEMO_ROLES.find(r => r.key === activeRole)?.label}
              </p>
            </div>
          )}
          <div className="p-6">
            {!showDemo && (
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Sign in to your account</h2>
                <button
                  type="button"
                  onClick={() => setShowDemo(true)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                >
                  ← Role selector
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              )}
              <Input
                label="Email address"
                type="email"
                placeholder="you@careHome.co.uk"
                error={errors.email?.message}
                {...register('email')}
              />
              <Input
                label="Password"
                type="password"
                placeholder="Your password"
                error={errors.password?.message}
                {...register('password')}
              />
              <Button type="submit" loading={isSubmitting} className="w-full mt-1" size="lg">
                {isSubmitting ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            {activeRole && (
              <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500 mb-1">DEMO CREDENTIALS</p>
                <p className="text-xs text-slate-600 font-mono">{DEMO_ROLES.find(r => r.key === activeRole)?.email}</p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">Password pre-filled</p>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          CareLearn Pro · CQC-Compliant Healthcare Training · © 2026
        </p>
      </div>
    </main>
  );
}
