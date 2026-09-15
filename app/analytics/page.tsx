"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { useRequireAuth } from "@/lib/useAuth";

type Booking = {
  id: string;
  ref: string;
  booking_date: string;
  type: string | null;
  status: string | null;
  supplier: string | null;
  warehouse: string | null;
  pallets: number | null;
  skus: number | null;
  quantity: number | null;
};

const NAVY = "#0B2545";
const GOLD = "#C9A34E";
const PALETTE = ["#0B2545", "#C9A34E", "#3E7CB1", "#8FB339", "#B33951", "#6C5B7B", "#2A9D8F", "#E76F51"];

const RANGE_OPTIONS = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "This month", value: "month" },
  { label: "All time", value: "all" },
];

export default function AnalyticsPage() {
  const { checking } = useRequireAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30");
  const [warehouseFilter, setWarehouseFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bookings")
      .select("id, ref, booking_date, type, status, supplier, warehouse, pallets, skus, quantity")
      .order("booking_date", { ascending: true });
    if (!error) setBookings(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = bookings;

    if (warehouseFilter !== "all") {
      list = list.filter((b) => b.warehouse === warehouseFilter);
    }

    if (range !== "all") {
      const now = new Date();
      let start: Date;
      if (range === "month") {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
      } else {
        start = new Date();
        start.setDate(start.getDate() - Number(range));
      }
      list = list.filter((b) => new Date(b.booking_date) >= start);
    }

    return list;
  }, [bookings, range, warehouseFilter]);

  // KPIs
  const totalBookings = filtered.length;
  const totalPallets = filtered.reduce((sum, b) => sum + (b.pallets ?? 0), 0);
  const delivered = filtered.filter((b) => b.status === "Delivered").length;
  const deliveredPct = totalBookings > 0 ? Math.round((delivered / totalBookings) * 100) : 0;
  const avgPallets = totalBookings > 0 ? (totalPallets / totalBookings).toFixed(1) : "0";

  // Trend over time (grouped by date)
  const trendData = useMemo(() => {
    const map = new Map<string, { date: string; bookings: number; pallets: number }>();
    filtered.forEach((b) => {
      const key = b.booking_date;
      const existing = map.get(key) ?? { date: key, bookings: 0, pallets: 0 };
      existing.bookings += 1;
      existing.pallets += b.pallets ?? 0;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  // Top suppliers
  const supplierData = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((b) => {
      const key = b.supplier || "Unknown";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([supplier, count]) => ({ supplier, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filtered]);

  // Warehouse split
  const warehouseData = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((b) => {
      const key = b.warehouse || "Unknown";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // Type split
  const typeData = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((b) => {
      const key = b.type || "Unknown";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // Status split
  const statusData = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((b) => {
      const key = b.status || "Unknown";
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const warehouses = useMemo(() => {
    const set = new Set(bookings.map((b) => b.warehouse).filter(Boolean) as string[]);
    return Array.from(set);
  }, [bookings]);

  if (checking) return null;

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

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-navy">Bookings Analytics</h1>
            <p className="mt-1 text-sm text-slate-600">
              Trends, supplier activity, and warehouse performance for Supplier Bookings.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-slate-600">Loading analytics…</p>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard label="Total Bookings" value={totalBookings.toString()} />
              <KpiCard label="Total Pallets" value={totalPallets.toString()} />
              <KpiCard label="Delivered" value={`${deliveredPct}%`} sub={`${delivered} of ${totalBookings}`} />
              <KpiCard label="Avg Pallets / Booking" value={avgPallets} />
            </div>

            {/* Trend Chart */}
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-navy">Bookings Trend</h2>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="bookings" name="Bookings" stroke={NAVY} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="pallets" name="Pallets" stroke={GOLD} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Top Suppliers */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-semibold text-navy">Top Suppliers</h2>
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={supplierData} layout="vertical" margin={{ left: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="supplier"
                        tick={{ fontSize: 10 }}
                        width={140}
                      />
                      <Tooltip />
                      <Bar dataKey="count" name="Bookings" fill={NAVY} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Warehouse Split */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-semibold text-navy">Warehouse Split</h2>
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={warehouseData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={(entry) => `${entry.name}: ${entry.value}`}
                      >
                        {warehouseData.map((_, idx) => (
                          <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Type Split */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-semibold text-navy">Booking Type</h2>
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={typeData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={(entry) => `${entry.name}: ${entry.value}`}
                      >
                        {typeData.map((_, idx) => (
                          <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Status Split */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-semibold text-navy">Status Breakdown</h2>
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" name="Bookings" fill={GOLD} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-navy">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}