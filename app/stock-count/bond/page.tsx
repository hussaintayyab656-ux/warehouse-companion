'use client';

import { useEffect, useState } from 'react';
import NavBar from '@/lib/components/NavBar';
import { supabase } from '@/lib/supabase';

interface StockCountRow {
  id: string;
  sku: string;
  description: string | null;
  location: string | null;
  frs_qty: number | null;
  count_1: number | null;
  count_2: number | null;
  count_3: number | null;
  count_4: number | null;
  count_5: number | null;
  final_count: number | null;
  discrepancy: number | null;
}

export default function BondStockCountPage() {
  const [rows, setRows] = useState<StockCountRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_counts')
      .select('*')
      .eq('area', 'bond')
      .order('sku');
    if (!error && data) setRows(data as StockCountRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateCount(id: string, field: string, value: string) {
    const numValue = value === '' ? null : Number(value);
    const row = rows.find((r) => r.id === id);
    if (!row) return;

    const updated = { ...row, [field]: numValue };

    // recompute discrepancy vs FRS if this is a count field
    const discrepancy =
      updated.frs_qty != null && numValue != null
        ? numValue - updated.frs_qty
        : row.discrepancy;

    const { error } = await supabase
      .from('stock_counts')
      .update({ [field]: numValue, discrepancy })
      .eq('id', id);

    if (!error) {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [field]: numValue, discrepancy } : r))
      );
    }
  }

  function isMismatch(row: StockCountRow, field: string) {
    const val = (row as any)[field];
    if (val == null || row.frs_qty == null) return false;
    return val !== row.frs_qty;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <NavBar />
        <div className="p-10 text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-slate-800 mb-1">Bond — Stock Count</h1>
        <p className="text-slate-600 mb-6">Enter counts below. Mismatches vs FRS show in red.</p>

        <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">SKU</th>
                <th className="text-left px-3 py-2">Description</th>
                <th className="text-left px-3 py-2">Location</th>
                <th className="text-right px-3 py-2">FRS Qty</th>
                <th className="text-right px-3 py-2">Count 1</th>
                <th className="text-right px-3 py-2">Count 2</th>
                <th className="text-right px-3 py-2">Count 3</th>
                <th className="text-right px-3 py-2">Count 4</th>
                <th className="text-right px-3 py-2">Count 5</th>
                <th className="text-right px-3 py-2">Final</th>
                <th className="text-right px-3 py-2">Discrepancy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{row.sku}</td>
                  <td className="px-3 py-2">{row.description}</td>
                  <td className="px-3 py-2">{row.location}</td>
                  <td className="px-3 py-2 text-right">{row.frs_qty ?? '-'}</td>
                  {(['count_1', 'count_2', 'count_3', 'count_4', 'count_5'] as const).map(
                    (field) => (
                      <td key={field} className="px-2 py-1 text-right">
                        <input
                          type="number"
                          defaultValue={(row as any)[field] ?? ''}
                          onBlur={(e) => updateCount(row.id, field, e.target.value)}
                          className={`w-20 text-right border rounded px-1 py-0.5 ${
                            isMismatch(row, field)
                              ? 'text-red-600 border-red-300'
                              : 'text-slate-800 border-slate-200'
                          }`}
                        />
                      </td>
                    )
                  )}
                  <td className="px-3 py-2 text-right">{row.final_count ?? '-'}</td>
                  <td
                    className={`px-3 py-2 text-right ${
                      row.discrepancy && row.discrepancy !== 0
                        ? 'text-red-600 font-semibold'
                        : 'text-slate-500'
                    }`}
                  >
                    {row.discrepancy ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}