"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function POLookupPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setReady(true);
    });
  }, [router]);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-navy">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-3">
          <p className="text-lg font-bold text-gold">Warehouse Companion</p>
          <Link href="/bookings" className="text-sm text-white hover:text-gold">
            ← Back to Supplier Bookings
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-navy text-3xl">
          🔍
        </div>
        <h1 className="text-2xl font-semibold text-navy">PO Lookup</h1>
        <p className="mt-3 text-slate-600">
          This tool will let you search booking history by PO number or SKU,
          pulling live details directly from FRS.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Coming soon — currently in development.
        </p>
      </div>
    </div>
  );
}