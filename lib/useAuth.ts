'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export function useRequireAuth() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push('/login');
      } else {
        setChecking(false);
      }
    }
    check();
  }, [router]);

  return checking;
}