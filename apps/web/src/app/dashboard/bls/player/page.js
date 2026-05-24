'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BLSPlayerPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/courses');
  }, [router]);

  return null;
}
