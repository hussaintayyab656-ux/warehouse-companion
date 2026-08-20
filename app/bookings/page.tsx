"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function BookingsHubPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setReady(true);
    });
  }, [router]);

  if (!ready) return null;

  const cards = [
    {
      href: "/bookings/lookup",
      title: "PO Lookup",
      desc: "Search booking history by purchase order / SKU",
      emoji: "🔍",
    },
    {
      href: "/bookings/manage",
      title: "Manage Bookings",
      desc: "View, create, and manage supplier bookings",
      emoji: "📅",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-navy">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-3">
          <p className="text-lg font-bold text-gold">Warehouse Companion</p>
          <Link
            href="/"
            className="text-sm text-white hover:text-gold"
          >
            ← Back to Home
          </Link>
        </div>
      </header>

      <div className="bg-gradient-to-b from-navy to-[#2a2a2a] px-6 py-14 text-center">
        <h1 className="text-3xl font-semibold text-white">
          📋 Supplier Bookings
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Manage supplier orders and delivery schedules
        </p>
      </div>

      <div className="mx-auto -mt-8 max-w-3xl px-6 pb-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm transition hover:-translate-y-1 hover:border-gold hover:shadow-lg"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-navy text-2xl transition group-hover:bg-gold">
                {c.emoji}
              </div>
              <h2 className="text-lg font-semibold text-navy">{c.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{c.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}