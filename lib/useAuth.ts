'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export function useRequireAuth() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getSession();

      const tabVerified = sessionStorage.getItem('tab_verified');

      if (!data.session || !tabVerified) {
        await supabase.auth.signOut();
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.session.user.id)
        .single();

      setRole(profile?.role ?? 'user');
      setChecking(false);
    }
    check();
  }, [router]);

  return { checking, role };
}