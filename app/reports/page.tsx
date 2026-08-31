'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import NavBar from '@/lib/components/NavBar';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Booking = {
  id: string;
  ref: string;
  df_ref: string;
  booking_date: string;
  booking_time: string;
  type: string;
  status: string;
  supplier: string;
  po_number: string | null;
  warehouse: string;
  pallets: number;
  skus: number;
  quantity: number;
};

type SortKey = keyof Pick<Booking,
  'ref' | 'booking_date' | 'booking_time' | 'po_number' | 'supplier' |
  'warehouse' | 'type' | 'status' | 'pallets' | 'skus' | 'quantity'>;

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // move back to Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const [sortKey, setSortKey] = useState<SortKey>('booking_date');
  const [sortAsc, setSortAsc] = useState(true);

  const [summaryPeriod, setSummaryPeriod] = useState<'week' | 'month'>('week');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/login');
      } else {
        setReady(true);
      }
    });
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('booking_date', { ascending: true });
    if (!error && data) setBookings(data as Booking[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const suppliers = useMemo(
    () => Array.from(new Set(bookings.map(b => b.supplier))).sort(),
    [bookings]
  );
  const warehouses = useMemo(
    () => Array.from(new Set(bookings.map(b => b.warehouse))).sort(),
    [bookings]
  );

  const filtered = useMemo(() => {
    return bookings.filter(b => {
      if (dateFrom && b.booking_date < dateFrom) return false;
      if (dateTo && b.booking_date > dateTo) return false;
      if (supplierFilter !== 'all' && b.supplier !== supplierFilter) return false;
      if (warehouseFilter !== 'all' && b.warehouse !== warehouseFilter) return false;
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (typeFilter !== 'all' && b.type !== typeFilter) return false;
      return true;
    });
  }, [bookings, dateFrom, dateTo, supplierFilter, warehouseFilter, statusFilter, typeFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortAsc]);

  const stats = useMemo(() => {
    return {
      totalBookings: filtered.length,
      totalPallets: filtered.reduce((s, b) => s + (b.pallets || 0), 0),
      totalSkus: filtered.reduce((s, b) => s + (b.skus || 0), 0),
      totalQuantity: filtered.reduce((s, b) => s + (b.quantity || 0), 0),
      delivered: filtered.filter(b => b.status === 'Delivered').length,
      pending: filtered.filter(b => b.status === 'Pending').length,
    };
  }, [filtered]);

  // Manager Summary: This Week / This Month, independent of the filters above
  const managerSummary = useMemo(() => {
    const now = new Date();
    const periodStart =
      summaryPeriod === 'week' ? startOfWeek(now) : startOfMonth(now);
    const periodStartStr = toISODate(periodStart);
    const todayStr = toISODate(now);

    const periodBookings = bookings.filter(
      b => b.booking_date >= periodStartStr && b.booking_date <= todayStr
    );

    const totalPallets = periodBookings.reduce((s, b) => s + (b.pallets || 0), 0);
    const delivered = periodBookings.filter(b => b.status === 'Delivered');
    const pending = periodBookings.filter(b => b.status === 'Pending');
    const deliveredPallets = delivered.reduce((s, b) => s + (b.pallets || 0), 0);
    const pendingPallets = pending.reduce((s, b) => s + (b.pallets || 0), 0);

    const supplierCounts = new Map<string, number>();
    periodBookings.forEach(b => {
      supplierCounts.set(b.supplier, (supplierCounts.get(b.supplier) || 0) + 1);
    });
    const supplierFrequency = Array.from(supplierCounts.entries())
      .sort((a, b) => b[1] - a[1]);

    return {
      periodStartStr,
      todayStr,
      totalBookings: periodBookings.length,
      totalPallets,
      deliveredCount: delivered.length,
      deliveredPallets,
      pendingCount: pending.length,
      pendingPallets,
      supplierFrequency,
    };
  }, [bookings, summaryPeriod]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function exportExcel() {
    const rows = sorted.map(b => ({
      Reference: b.ref,
      Date: b.booking_date,
      Time: b.booking_time,
      'PO Number': b.po_number || '-',
      Supplier: b.supplier,
      Warehouse: b.warehouse,
      Type: b.type,
      Status: b.status,
      Pallets: b.pallets,
      SKUs: b.skus,
      Quantity: b.quantity,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Supplier Bookings');
    XLSX.writeFile(wb, `supplier-bookings-${dateFrom || 'all'}-to-${dateTo || 'all'}.xlsx`);
  }

  function exportSummaryExcel() {
    const summaryRows = [
      { Metric: 'Period', Value: `${managerSummary.periodStartStr} to ${managerSummary.todayStr}` },
      { Metric: 'Total Bookings', Value: managerSummary.totalBookings },
      { Metric: 'Total Pallets', Value: managerSummary.totalPallets },
      { Metric: 'Delivered (Bookings)', Value: managerSummary.deliveredCount },
      { Metric: 'Delivered (Pallets)', Value: managerSummary.deliveredPallets },
      { Metric: 'Pending (Bookings)', Value: managerSummary.pendingCount },
      { Metric: 'Pending (Pallets)', Value: managerSummary.pendingPallets },
    ];
    const supplierRows = managerSummary.supplierFrequency.map(([supplier, count]) => ({
      Supplier: supplier,
      'Deliveries This Period': count,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(supplierRows), 'Supplier Frequency');
    XLSX.writeFile(wb, `manager-summary-${summaryPeriod}-${managerSummary.todayStr}.xlsx`);
  }

  function exportSummaryPDF() {
    const doc = new jsPDF();
    const periodLabel = summaryPeriod === 'week' ? 'Weekly' : 'Monthly';

    doc.setFontSize(16);
    doc.text('Warehouse Companion - Manager Summary', 14, 18);
    doc.setFontSize(11);
    doc.text(
      `${periodLabel} Report: ${managerSummary.periodStartStr} to ${managerSummary.todayStr}`,
      14,
      26
    );

    autoTable(doc, {
      startY: 34,
      head: [['Metric', 'Value']],
      body: [
        ['Total Bookings', String(managerSummary.totalBookings)],
        ['Total Pallets', String(managerSummary.totalPallets)],
        ['Delivered (Bookings)', String(managerSummary.deliveredCount)],
        ['Delivered (Pallets)', String(managerSummary.deliveredPallets)],
        ['Pending (Bookings)', String(managerSummary.pendingCount)],
        ['Pending (Pallets)', String(managerSummary.pendingPallets)],
      ],
    });

    const afterFirstTable = (
      doc as unknown as { lastAutoTable: { finalY: number } }
    ).lastAutoTable.finalY;

    doc.setFontSize(12);
    doc.text('Supplier Delivery Frequency', 14, afterFirstTable + 12);

    autoTable(doc, {
      startY: afterFirstTable + 16,
      head: [['Supplier', 'Deliveries This Period']],
      body: managerSummary.supplierFrequency.map(([supplier, count]) => [
        supplier,
        String(count),
      ]),
    });

    doc.save(`manager-summary-${summaryPeriod}-${managerSummary.todayStr}.pdf`);
  }

  function typeBadgeClass(type: string) {
    if (type === 'Delivery' || type === 'Deliveries') return 'bg-blue-100 text-blue-800';
    if (type === 'Collection' || type === 'Collections') return 'bg-purple-100 text-purple-800';
    return 'bg-amber-100 text-amber-800';
  }

  function statusBadgeClass(status: string) {
    return status === 'Delivered'
      ? 'bg-green-100 text-green-800'
      : 'bg-slate-200 text-slate-800';
  }

  if (!ready) return null;
  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar />
      <div className="max-w-7xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-4">Export &amp; Reports</h1>

        {/* Manager Summary Section */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Manager Summary</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-md overflow-hidden border border-slate-300">
                <button
                  onClick={() => setSummaryPeriod('week')}
                  className={`px-3 py-1.5 text-sm ${
                    summaryPeriod === 'week'
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-slate-600'
                  }`}
                >
                  This Week
                </button>
                <button
                  onClick={() => setSummaryPeriod('month')}
                  className={`px-3 py-1.5 text-sm ${
                    summaryPeriod === 'month'
                      ? 'bg-slate-800 text-white'
                      : 'bg-white text-slate-600'
                  }`}
                >
                  This Month
                </button>
              </div>
              <button
                onClick={exportSummaryExcel}
                className="bg-slate-800 text-white text-sm px-3 py-1.5 rounded hover:bg-slate-700"
              >
                Export Excel
              </button>
              <button
                onClick={exportSummaryPDF}
                className="bg-red-700 text-white text-sm px-3 py-1.5 rounded hover:bg-red-800"
              >
                Export PDF
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500 mb-4">
            {managerSummary.periodStartStr} to {managerSummary.todayStr}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-slate-800">{managerSummary.totalBookings}</div>
              <div className="text-xs text-slate-500">Bookings</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-slate-800">{managerSummary.totalPallets}</div>
              <div className="text-xs text-slate-500">Total Pallets</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-green-700">{managerSummary.deliveredPallets}</div>
              <div className="text-xs text-slate-500">
                Pallets Delivered ({managerSummary.deliveredCount})
              </div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-amber-700">{managerSummary.pendingPallets}</div>
              <div className="text-xs text-slate-500">
                Pallets Pending ({managerSummary.pendingCount})
              </div>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            Supplier Delivery Frequency
          </h3>
          {managerSummary.supplierFrequency.length === 0 ? (
            <p className="text-sm text-slate-500">No bookings in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="text-left px-3 py-2">Supplier</th>
                    <th className="text-left px-3 py-2">Deliveries This Period</th>
                  </tr>
                </thead>
                <tbody>
                  {managerSummary.supplierFrequency.map(([supplier, count]) => (
                    <tr key={supplier} className="border-t">
                      <td className="px-3 py-2">{supplier}</td>
                      <td className="px-3 py-2">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-6 grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <label className="text-xs text-slate-600">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-600">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-600">Supplier</label>
            <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm">
              <option value="all">All</option>
              {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-600">Warehouse</label>
            <select value={warehouseFilter} onChange={e => setWarehouseFilter(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm">
              <option value="all">All</option>
              {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-600">Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm">
              <option value="all">All</option>
              <option value="Pending">Pending</option>
              <option value="Delivered">Delivered</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-600">Type</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm">
              <option value="all">All</option>
              <option value="Deliveries">Deliveries</option>
              <option value="Collections">Collections</option>
              <option value="Courier">Courier</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          {[
            ['Total Bookings', stats.totalBookings],
            ['Pallets', stats.totalPallets],
            ['SKUs', stats.totalSkus],
            ['Quantity', stats.totalQuantity],
            ['Delivered', stats.delivered],
            ['Pending', stats.pending],
          ].map(([label, val]) => (
            <div key={label as string} className="bg-white rounded-lg shadow p-3 text-center">
              <div className="text-xl font-bold text-slate-800">{val}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center mb-3">
          <div className="text-sm text-slate-600">{sorted.length} record(s)</div>
          <button onClick={exportExcel}
            className="bg-slate-800 text-white text-sm px-4 py-2 rounded hover:bg-slate-700">
            Export to Excel
          </button>
        </div>

        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                {([
                  ['ref', 'Reference'], ['booking_date', 'Date'], ['booking_time', 'Time'],
                  ['po_number', 'PO Number'], ['supplier', 'Supplier'], ['warehouse', 'Warehouse'],
                  ['type', 'Type'], ['status', 'Status'], ['pallets', 'Pallets'],
                  ['skus', 'SKUs'], ['quantity', 'Qty'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th key={key} onClick={() => toggleSort(key)}
                    className="text-left px-3 py-2 cursor-pointer select-none whitespace-nowrap">
                    {label}{sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(b => (
                <tr key={b.id} className="border-t">
                  <td className="px-3 py-2">{b.ref}</td>
                  <td className="px-3 py-2">{b.booking_date}</td>
                  <td className="px-3 py-2">{b.booking_time}</td>
                  <td className="px-3 py-2">{b.po_number || '-'}</td>
                  <td className="px-3 py-2">{b.supplier}</td>
                  <td className="px-3 py-2">{b.warehouse}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${typeBadgeClass(b.type)}`}>{b.type}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${statusBadgeClass(b.status)}`}>{b.status}</span>
                  </td>
                  <td className="px-3 py-2">{b.pallets}</td>
                  <td className="px-3 py-2">{b.skus}</td>
                  <td className="px-3 py-2">{b.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}