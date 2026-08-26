"use client";

import Link from "next/link";
import { useRequireAuth } from "@/lib/useAuth";

function Flap({ ch }: { ch: string }) {
  return (
    <span className="relative mx-[1px] inline-flex h-8 w-6 items-center justify-center rounded-[3px] bg-[#141414] font-mono text-lg font-bold text-[#ffb000] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:h-10 sm:w-7 sm:text-2xl">
      {ch === " " ? "\u00A0" : ch}
      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/60" />
    </span>
  );
}

function SplitFlap({ text }: { text: string }) {
  return (
    <div className="flex flex-wrap justify-center">
      {text.split("").map((ch, i) => (
        <Flap key={i} ch={ch} />
      ))}
    </div>
  );
}

export default function HomePage() {
  const { checking, role } = useRequireAuth();

  if (checking) return null;

  const allModules = [
    { title: "SUPPLIER BOOKINGS", desc: "Orders & delivery schedules", href: "/bookings" },
    { title: "DASHBOARD", desc: "Real-time metrics overview", href: "/dashboard" },
    { title: "EXPORT & REPORTS", desc: "Excel exports & reports", href: "/reports" },
    { title: "STOCK COUNT", desc: "Bond & Fab Bond reconciliation", href: "/stock-count" },
    { title: "BOND STOCK", desc: "Boutique · Alcohol/LR · Cigarettes", href: "/bondstock" },
  ];

  const modules =
    role === "limited"
      ? allModules.filter((m) => m.href === "/bookings")
      : allModules;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="border-b border-[#ffb000]/20 bg-[#111]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <p className="font-mono text-sm font-bold tracking-[0.15em] text-[#ffb000]">
            I.F.R
          </p>
          <p className="font-mono text-[10px] tracking-[0.25em] text-slate-500">
            BOND DEPARTMENT
          </p>
        </div>
      </header>

      <div className="border-b border-[#ffb000]/10 bg-[#0d0d0d] px-6 py-10 text-center">
        <SplitFlap text="WELCOME BACK" />
        <div className="mt-2">
          <SplitFlap text="I.F.R  BOND DEPT" />
        </div>
        <p className="mt-5 font-mono text-[11px] tracking-[0.2em] text-slate-500">
          SELECT A MODULE BELOW
        </p>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-[#ffb000]/20 pb-2 font-mono text-[10px] tracking-[0.2em] text-slate-500 sm:grid-cols-[1fr_180px_100px]">
          <span>MODULE</span>
          <span className="hidden sm:block">DETAIL</span>
          <span className="text-right">STATUS</span>
        </div>

        <div className="divide-y divide-white/5">
          {modules.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="group grid grid-cols-[1fr_auto] items-center gap-x-4 py-4 transition hover:bg-[#ffb000]/[0.04] sm:grid-cols-[1fr_180px_100px]"
            >
              <span>
                <span className="block font-mono text-sm tracking-wide text-white transition group-hover:text-[#ffb000]">
                  {m.title}
                </span>
                <span className="block text-xs text-slate-500 sm:hidden">
                  {m.desc}
                </span>
              </span>
              <span className="hidden font-mono text-xs text-slate-500 sm:block">
                {m.desc}
              </span>
              <span className="flex items-center justify-end gap-1.5 font-mono text-[11px] tracking-wider text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                READY
              </span>
            </Link>
          ))}
        </div>
      </div>

      <p className="pb-8 text-center font-mono text-[10px] tracking-[0.2em] text-slate-700">
        WAREHOUSE COMPANION · BOND DEPARTMENT
      </p>
    </div>
  );
}