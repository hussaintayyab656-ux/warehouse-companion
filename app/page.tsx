"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function HomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [name, setName] = useState<string>("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
      } else {
        setName(data.session.user.email?.split("@")[0] ?? "there");
        setReady(true);
      }
    });
  }, [router]);

  if (!ready) return null;

  const modules = [
    {
      href: "/bookings",
      title: "Supplier Bookings",
      desc: "Manage supplier orders and delivery schedules",
      emoji: "📋",
    },
    {
      href: "/dashboard",
      title: "Dashboard",
      desc: "View real-time metrics and warehouse overview",
      emoji: "📊",
    },
    {
      href: "/reports",
      title: "Export & Reports",
      desc: "Generate reports and export data to Excel",
      emoji: "📈",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-navy">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-3">
          <p className="text-lg font-bold text-gold">Warehouse Companion</p>
        </div>
      </header>

      <div className="bg-gradient-to-b from-navy to-[#2a2a2a] px-6 py-14 text-center">
        <h1 className="text-3xl font-semibold text-white">
          Welcome back, <span className="text-gold uppercase">{name}</span>
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Select a module to get started
        </p>
      </div>

      <div className="mx-auto -mt-8 max-w-5xl px-6 pb-16">
        <div className="grid gap-6 sm:grid-cols-3">
          {modules.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="group rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm transition hover:-translate-y-1 hover:border-gold hover:shadow-lg"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-navy text-2xl transition group-hover:bg-gold">
                {m.emoji}
              </div>
              <h2 className="text-lg font-semibold text-navy">{m.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{m.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}