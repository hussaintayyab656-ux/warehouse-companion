"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRequireAuth } from "@/lib/useAuth";

type BlockedDate = {
  id: string;
  blocked_date: string;
  reason: string | null;
};

export default function AdminPage() {
  const router = useRouter();
  const { checking, role } = useRequireAuth();
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState("");
  const [newReason, setNewReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!checking && role !== "admin") {
      router.replace("/");
    }
  }, [checking, role, router]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("blocked_dates")
      .select("id, blocked_date, reason")
      .order("blocked_date", { ascending: true });
    if (!error) setBlockedDates(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (role === "admin") load();
  }, [role, load]);

  async function addBlockedDate() {
    if (!newDate) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("blocked_dates")
      .insert({ blocked_date: newDate, reason: newReason || null });
    if (error) {
      setError(error.message);
    } else {
      setNewDate("");
      setNewReason("");
      load();
    }
    setSaving(false);
  }

  async function removeBlockedDate(id: string) {
    if (!confirm("Remove this blocked date?")) return;
    await supabase.from("blocked_dates").delete().eq("id", id);
    load();
  }

  if (checking || role !== "admin") return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-navy">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-3">
          <p className="text-lg font-bold text-gold">Warehouse Companion</p>
          <Link href="/" className="text-sm text-white hover:text-gold">
            ← Back to Home
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-navy">Admin Panel</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage blocked booking dates and team access.
        </p>

        {/* Blocked Dates Section */}
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">Blocked Dates</h2>
          <p className="mt-1 text-sm text-slate-600">
            Block a date (e.g. stock count day) so no new bookings can be
            added.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Date
              </label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-slate-600">
                Reason (optional)
              </label>
              <input
                type="text"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="e.g. Stock count"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={addBlockedDate}
              disabled={saving || !newDate}
              className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-gold-hover disabled:opacity-50"
            >
              {saving ? "Adding…" : "Block date"}
            </button>
          </div>

          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

          <div className="mt-5 divide-y divide-slate-100">
            {loading ? (
              <p className="py-4 text-sm text-slate-600">Loading…</p>
            ) : blockedDates.length === 0 ? (
              <p className="py-4 text-sm text-slate-600">
                No blocked dates yet.
              </p>
            ) : (
              blockedDates.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-mono text-sm text-slate-900">
                      {b.blocked_date}
                    </p>
                    {b.reason && (
                      <p className="text-xs text-slate-600">{b.reason}</p>
                    )}
                  </div>
                  <button
                    onClick={() => removeBlockedDate(b.id)}
                    className="rounded-md border border-red-300 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Team Members Section */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">Team Members</h2>
          <p className="mt-1 text-sm text-slate-600">
            New logins are currently created from the Supabase dashboard
            (Authentication → Users), then approved in the{" "}
            <span className="font-mono">profiles</span> table. A full
            in-app &quot;Add user&quot; button is planned for a future
            update.
          </p>
        </div>
      </div>
    </div>
  );
}