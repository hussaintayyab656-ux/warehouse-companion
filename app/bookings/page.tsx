"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type EventItem = {
  id: string;
  title: string;
  message: string;
  event_date: string;
};

function daysUntil(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  return diff;
}

export default function BookingsHubPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [upcomingEvents, setUpcomingEvents] = useState<EventItem[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setReady(true);
    });
  }, [router]);

  useEffect(() => {
    async function loadEvents() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const in7Days = new Date(today);
      in7Days.setDate(in7Days.getDate() + 7);

      const todayStr = today.toISOString().slice(0, 10);
      const in7DaysStr = in7Days.toISOString().slice(0, 10);

      const { data } = await supabase
        .from("events")
        .select("id, title, message, event_date")
        .gte("event_date", todayStr)
        .lte("event_date", in7DaysStr)
        .order("event_date", { ascending: true });

      setUpcomingEvents(data ?? []);
    }
    loadEvents();
  }, []);

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
    <div className="min-h-screen bg-black font-mono">
      <header className="border-b border-amber-900/40 bg-black">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-3">
          <p className="text-lg font-bold tracking-widest text-amber-400">
            WAREHOUSE COMPANION
          </p>
          <Link
            href="/"
            className="text-sm tracking-widest text-slate-400 hover:text-amber-400 transition-colors"
          >
            ← BACK TO HOME
          </Link>
        </div>
      </header>

      {upcomingEvents.length > 0 && (
        <div className="mx-auto max-w-3xl px-6 pt-6">
          {upcomingEvents.map((ev) => {
            const days = daysUntil(ev.event_date);
            const label =
              days === 0
                ? "TODAY"
                : days === 1
                  ? "TOMORROW"
                  : `IN ${days} DAYS`;
            return (
              <div
                key={ev.id}
                className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.08] px-4 py-3"
              >
                <p className="text-xs font-bold tracking-[0.15em] text-amber-400">
                  ⚠ {label} — {ev.title.toUpperCase()}
                </p>
                <p className="mt-1 text-sm text-slate-300">{ev.message}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="px-6 py-14 text-center">
        <h1 className="text-3xl tracking-[0.2em] text-amber-400">
          📋 SUPPLIER BOOKINGS
        </h1>
        <p className="mt-2 text-sm tracking-wide text-slate-400">
          Manage supplier orders and delivery schedules
        </p>
      </div>

      <div className="mx-auto -mt-4 max-w-3xl px-6 pb-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group rounded-xl border border-amber-900/40 bg-black p-8 text-center transition hover:-translate-y-1 hover:border-amber-500/60 hover:bg-amber-950/10"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500/10 text-2xl transition group-hover:bg-amber-500/20">
                {c.emoji}
              </div>
              <h2 className="text-lg font-semibold tracking-wide text-amber-300">
                {c.title}
              </h2>
              <p className="mt-2 text-sm text-slate-400">{c.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}