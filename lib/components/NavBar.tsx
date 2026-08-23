'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useRequireAuth } from '@/lib/useAuth';

export default function NavBar() {
  const router = useRouter();
  const { role } = useRequireAuth();

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <header className="border-b bg-navy">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-3">
        <p className="text-lg font-bold text-gold">
          Warehouse Companion
        </p>
        <nav className="flex items-center gap-6">
          <Link href="/" className="text-sm text-white hover:text-gold">
            Dashboard
          </Link>
          <Link href="/bookings" className="text-sm text-white hover:text-gold">
            Bookings
          </Link>
          <Link href="/reports" className="text-sm text-white hover:text-gold">
            Reports
          </Link>
          <Link href="/stock-count" className="text-sm text-white hover:text-gold">
            Stock Count
          </Link>
          {role === 'admin' && (
            <Link href="/admin" className="text-sm text-white hover:text-gold">
              Admin
            </Link>
          )}
          <button
            onClick={signOut}
            className="ml-2 text-sm bg-gold text-navy px-3 py-1.5 rounded font-semibold hover:bg-gold-hover"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}