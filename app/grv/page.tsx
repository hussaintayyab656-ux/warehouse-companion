// app/grv/page.tsx

import Link from "next/link";

export default function GrvLandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] px-6 py-12">
      <div className="mx-auto max-w-4xl text-center">
        <div className="flex items-center justify-center gap-3">
          <span className="text-3xl">📋</span>
          <h1 className="font-mono text-3xl font-bold tracking-[0.1em] text-[#ffb000]">
            GRV
          </h1>
        </div>
        <p className="mt-3 font-mono text-sm tracking-wide text-slate-400">
          Digitize and manage goods received vouchers
        </p>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Link
            href="/grv/upload"
            className="group rounded-lg border border-[#ffb000]/30 bg-[#111] p-8 transition hover:border-[#ffb000] hover:bg-[#ffb000]/[0.05]"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-[#ffb000]/10 text-3xl">
              📤
            </div>
            <h2 className="mt-5 font-mono text-lg font-bold tracking-wide text-[#ffb000]">
              GRV Extraction
            </h2>
            <p className="mt-2 font-mono text-xs text-slate-400">
              Upload scanned GRV documents for AI extraction
            </p>
          </Link>

          <Link
            href="/grv/records"
            className="group rounded-lg border border-[#ffb000]/30 bg-[#111] p-8 transition hover:border-[#ffb000] hover:bg-[#ffb000]/[0.05]"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-[#ffb000]/10 text-3xl">
              🔍
            </div>
            <h2 className="mt-5 font-mono text-lg font-bold tracking-wide text-[#ffb000]">
              GRV Records
            </h2>
            <p className="mt-2 font-mono text-xs text-slate-400">
              Search, view and manage all digitized GRV records
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}