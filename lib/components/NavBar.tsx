'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function NavBar() {
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-3">
        <p className="text-lg font-bold text-orange-600">
          Warehouse Companion
        </p>
        <nav className="flex items-center gap-6">
          <Link href="/" className="text-sm text-slate-700 hover:text-slate-900">
            Dashboard
          </Link>
          <Link href="/bookings" className="text-sm text-slate-700 hover:text-slate-900">
            Bookings
          </Link>
          <Link href="/reports" className="text-sm text-slate-700 hover:text-slate-900">
            Reports
          </Link>
          <button
            onClick={signOut}
            className="ml-2 text-sm bg-slate-800 text-white px-3 py-1.5 rounded hover:bg-slate-700"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}