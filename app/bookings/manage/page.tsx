"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  deleteBooking,
  getBlockedDates,
  getBookingsForDate,
  getSuppliers,
  markDelivered,
} from "@/lib/bookings";
import {
  addDays,
  displayTime,
  formatLongDate,
  toDateKey,
  type Booking,
  type Supplier,
} from "@/lib/types";
import BookingForm from "../BookingForm";

const typeBadge: Record<string, string> = {
  Delivery: "bg-sky-100 text-sky-800",
  Collection: "bg-violet-100 text-violet-800",
  Courier: "bg-teal-100 text-teal-800",
};

const statusBadge: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800",
  Delivered: "bg-emerald-100 text-emerald-800",
};

function isWeekend(dateStr: string) {
  const day = new Date(dateStr + "T00:00:00").getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

export default function ManageBookingsPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setUserEmail(data.session.user.email ?? null);
    });
  }, [router]);

  useEffect(() => {
    getSuppliers()
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, []);

  useEffect(() => {
    getBlockedDates()
      .then(setBlockedDates)
      .catch(() => setBlockedDates([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBookings(await getBookingsForDate(date));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load bookings.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  async function onMarkDelivered(b: Booking) {
    await markDelivered(b.id);
    load();
  }

  async function onDelete(b: Booking) {
    if (!confirm(`Delete booking ${b.ref}? This cannot be undone.`)) return;
    await deleteBooking(b.id);
    load();
  }

  const weekend = isWeekend(date);
  const manuallyBlocked = blockedDates.includes(date);
  const isBlocked = manuallyBlocked || weekend;

  const totals = bookings.reduce(
    (acc, b) => ({
      pallets: acc.pallets + (b.pallets ?? 0),
      skus: acc.skus + (b.skus ?? 0),
      quantity: acc.quantity + (b.quantity ?? 0),
      pending: acc.pending + (b.status === "Pending" ? 1 : 0),
    }),
    { pallets: 0, skus: 0, quantity: 0, pending: 0 },
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="print:hidden">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div>
              <Link href="/bookings" className="text-xs text-slate-500 hover:text-navy">
                ← Back to Supplier Bookings
              </Link>
              <h1 className="text-lg font-semibold text-navy">
                Manage Bookings
              </h1>
              <p className="text-sm text-slate-700">{formatLongDate(date)}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Print day
              </button>
              <button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
                disabled={isBlocked}
                className="rounded-md bg-gold px-3 py-2 text-sm font-semibold text-navy hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add booking
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setDate(addDays(date, -1))}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              ← Previous day
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <button
              onClick={() => setDate(addDays(date, 1))}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              Next day →
            </button>
            <button
              onClick={() => setDate(toDateKey(new Date()))}
              className="rounded-md px-3 py-2 text-sm text-slate-600 underline-offset-2 hover:underline"
            >
              Today
            </button>
          </div>

          {isBlocked && (
            <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">This date is blocked.</p>
              <p className="mt-0.5 text-amber-800">
                Reason: {weekend ? "Weekend — automatically blocked" : "Manually blocked"}
              </p>
              <p className="mt-1 text-amber-800">
                New bookings cannot be added, but existing bookings are shown below.
              </p>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Bookings", bookings.length],
              ["Pallets", totals.pallets],
              ["SKUs", totals.skus],
              ["Pending", totals.pending],
            ].map(([k, v]) => (
              <div
                key={k as string}
                className="rounded-lg border border-slate-200 border-t-4 border-t-gold bg-white px-4 py-3 shadow-sm"
              >
                <p className="text-xs uppercase tracking-wide text-slate-700">
                  {k}
                </p>
                <p className="mt-1 font-mono text-2xl text-navy">{v}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <p className="px-4 py-10 text-center text-sm text-slate-700">
                Loading bookings…
              </p>
            ) : error ? (
              <p className="px-4 py-10 text-center text-sm text-red-700">
                {error}
              </p>
            ) : bookings.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-slate-600">
                  No bookings for this day.
                </p>
                {!isBlocked && (
                  <button
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                    className="mt-3 rounded-md bg-gold px-3 py-2 text-sm font-semibold text-navy hover:bg-gold-hover"
                  >
                    Add the first booking
                  </button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {bookings.map((b) => (
                  <li key={b.id} className="px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-navy">
                            {b.ref}
                          </span>
                          <span className="font-mono text-sm text-slate-700">
                            {displayTime(b.booking_time)}
                          </span>
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${typeBadge[b.type] ?? "bg-slate-100 text-slate-700"}`}
                          >
                            {b.type}
                          </span>
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadge[b.status] ?? "bg-slate-100 text-slate-700"}`}
                          >
                            {b.status}
                          </span>
                          {b.short_notice && (
                            <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                              Short notice
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-slate-900">
                          {b.supplier}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-600">
                          <span className="font-mono">
                            {b.po_number || "-"}
                          </span>{" "}
                          · {b.warehouse} · {b.pallets ?? 0} pallets ·{" "}
                          {b.skus ?? 0} SKUs · {b.quantity ?? 0} qty
                        </p>
                        {b.notes && (
                          <p className="mt-1 text-sm text-slate-700">
                            {b.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setEditing(b);
                            setFormOpen(true);
                          }}
                          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        {b.status === "Pending" && (
                          <button
                            onClick={() => onMarkDelivered(b)}
                            className="rounded-md border border-emerald-300 px-2.5 py-1.5 text-xs text-emerald-800 hover:bg-emerald-50"
                          >
                            Mark delivered
                          </button>
                        )}
                        <button
                          onClick={() => onDelete(b)}
                          className="rounded-md border border-red-300 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="hidden print:block">
        <h1 className="mb-4 text-lg font-bold">
          Supplier Bookings - {formatLongDate(date)}
        </h1>
        {bookings.map((b) => (
          <div
            key={b.id}
            className="mb-3 break-inside-avoid border border-slate-400 p-3"
          >
            <div className="flex justify-between">
              <span className="font-mono font-bold">{b.ref}</span>
              <span className="text-sm">{b.type}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-slate-700">DATE</div>
                <div>{b.booking_date}</div>
              </div>
              <div>
                <div className="text-slate-700">TIME</div>
                <div>{displayTime(b.booking_time)}</div>
              </div>
              <div>
                <div className="text-slate-700">SUPPLIER</div>
                <div>{b.supplier}</div>
              </div>
              <div>
                <div className="text-slate-700">PO NUMBER</div>
                <div>{b.po_number || "-"}</div>
              </div>
              <div>
                <div className="text-slate-700">PALLETS</div>
                <div>{b.pallets ?? 0}</div>
              </div>
              <div>
                <div className="text-slate-700">SKUS</div>
                <div>{b.skus ?? 0}</div>
              </div>
              <div>
                <div className="text-slate-700">QUANTITY</div>
                <div>{b.quantity ?? 0}</div>
              </div>
            </div>
            {b.notes && (
              <div className="mt-2 text-xs">
                <div className="text-slate-700">NOTES</div>
                <div>{b.notes}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <BookingForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={load}
        suppliers={suppliers}
        defaultDate={date}
        booking={editing}
        userEmail={userEmail}
      />
    </div>
  );
}