"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getAllBookings } from "@/lib/bookings";
import { displayTime, type Booking } from "@/lib/types";
import NavBar from "@/lib/components/NavBar";

type SortKey =
  | "ref"
  | "booking_date"
  | "booking_time"
  | "po_number"
  | "supplier"
  | "warehouse"
  | "type"
  | "status"
  | "pallets"
  | "skus"
  | "quantity";

const typeBadge: Record<string, string> = {
  Delivery: "bg-sky-100 text-sky-800",
  Collection: "bg-violet-100 text-violet-800",
  Courier: "bg-teal-100 text-teal-800",
};

const statusBadge: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800",
  Delivered: "bg-emerald-100 text-emerald-800",
};

const columns: { key: SortKey; label: string }[] = [
  { key: "ref", label: "Reference" },
  { key: "booking_date", label: "Date" },
  { key: "booking_time", label: "Time" },
  { key: "po_number", label: "PO Number" },
  { key: "supplier", label: "Supplier" },
  { key: "warehouse", label: "Warehouse" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "pallets", label: "Pallets" },
  { key: "skus", label: "SKUs" },
  { key: "quantity", label: "Qty" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("booking_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setReady(true);
    });
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBookings(await getAllBookings());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const totals = useMemo(
    () =>
      bookings.reduce(
        (acc, b) => ({
          pallets: acc.pallets + (b.pallets ?? 0),
          skus: acc.skus + (b.skus ?? 0),
          quantity: acc.quantity + (b.quantity ?? 0),
          delivered: acc.delivered + (b.status === "Delivered" ? 1 : 0),
          pending: acc.pending + (b.status === "Pending" ? 1 : 0),
        }),
        { pallets: 0, skus: 0, quantity: 0, delivered: 0, pending: 0 },
      ),
    [bookings],
  );

  const sorted = useMemo(() => {
    const list = [...bookings];
    list.sort((a, b) => {
      const av = (
        sortKey === "booking_time" ? (a.booking_time ?? "") : (a[sortKey] ?? "")
      ) as string | number;
      const bv = (
        sortKey === "booking_time" ? (b.booking_time ?? "") : (b[sortKey] ?? "")
      ) as string | number;

      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [bookings, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar />

      <div className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-lg font-semibold text-navy">Dashboard</h1>
        <p className="text-sm text-slate-700">
          {bookings.length} booking{bookings.length === 1 ? "" : "s"} total
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ["Bookings", bookings.length],
              ["Pallets", totals.pallets],
              ["SKUs", totals.skus],
              ["Quantity", totals.quantity],
              ["Delivered", totals.delivered],
              ["Pending", totals.pending],
            ] as [string, number][]
          ).map(([k, v]) => (
            <div
              key={k}
              className="rounded-lg border border-slate-200 border-t-4 border-t-gold bg-white px-4 py-3 shadow-sm"
            >
              <p className="text-xs uppercase tracking-wide text-slate-700">
                {k}
              </p>
              <p className="mt-1 font-mono text-2xl text-navy">{v}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-slate-700">
              Loading…
            </p>
          ) : error ? (
            <p className="px-4 py-10 text-center text-sm text-red-700">
              {error}
            </p>
          ) : bookings.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-600">
              No bookings yet.
            </p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-navy text-left text-xs uppercase tracking-wide text-gold">
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className="cursor-pointer select-none whitespace-nowrap px-3 py-2 hover:text-white"
                    >
                      {c.label}
                      {sortKey === c.key && (sortDir === "asc" ? " ▲" : " ▼")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 font-mono">
                      {b.ref}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {b.booking_date}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono">
                      {displayTime(b.booking_time)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono">
                      {b.po_number || "-"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {b.supplier}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {b.warehouse}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${typeBadge[b.type] ?? "bg-slate-100 text-slate-700"}`}
                      >
                        {b.type}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadge[b.status] ?? "bg-slate-100 text-slate-700"}`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                      {b.pallets ?? 0}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                      {b.skus ?? 0}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                      {b.quantity ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}