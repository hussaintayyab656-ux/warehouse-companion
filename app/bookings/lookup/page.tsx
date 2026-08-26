'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import NavBar from '@/lib/components/NavBar';

type POHeader = {
  po_number: string;
  supplier: string;
  warehouse: string;
  booking_date: string;
};

type POItem = {
  sku_code: string;
  quantity: number;
};

export default function POLookupPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [poNumber, setPoNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [header, setHeader] = useState<POHeader | null>(null);
  const [items, setItems] = useState<POItem[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/login');
      } else {
        setReady(true);
      }
    });
  }, [router]);

  async function handleSearch() {
    const cleaned = poNumber.trim().toUpperCase();
    if (!cleaned) return;

    setLoading(true);
    setError('');
    setHeader(null);
    setItems([]);
    setSearched(true);

    const { data: headerData, error: headerError } = await supabase
      .from('purchase_orders')
      .select('po_number, supplier, warehouse, booking_date')
      .eq('po_number', cleaned)
      .maybeSingle();

    if (headerError) {
      setError('Something went wrong searching for that PO.');
      setLoading(false);
      return;
    }

    if (!headerData) {
      setError(`No PO found matching "${cleaned}".`);
      setLoading(false);
      return;
    }

    const { data: itemsData, error: itemsError } = await supabase
      .from('purchase_orders_items')
      .select('sku_code, quantity')
      .eq('po_number', cleaned);

    if (itemsError) {
      setError('Found the PO, but could not load its SKUs.');
    }

    setHeader(headerData as POHeader);
    setItems((itemsData as POItem[]) || []);
    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar />
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">PO Lookup</h1>
        <p className="text-sm text-slate-500 mb-6">
          Search booking history by purchase order number.
        </p>

        <div className="bg-white rounded-lg shadow p-4 mb-6 flex gap-2">
          <input
            type="text"
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. UK00024683"
            className="flex-1 border rounded px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="bg-slate-800 text-white text-sm px-5 py-2 rounded hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 mb-6">
            {error}
          </div>
        )}

        {header && (
          <div className="bg-white rounded-lg shadow p-5 mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">PO Number</div>
                <div className="font-mono font-semibold text-slate-800">{header.po_number}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Supplier</div>
                <div className="font-semibold text-slate-800">{header.supplier}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Warehouse</div>
                <div className="font-semibold text-slate-800">{header.warehouse}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Date</div>
                <div className="font-semibold text-slate-800">{header.booking_date || '-'}</div>
              </div>
            </div>
          </div>
        )}

        {header && items.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-2 border-b bg-slate-100 text-sm font-medium text-slate-700">
              {items.length} SKU{items.length !== 1 ? 's' : ''} on this PO
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-2 text-slate-600">SKU Code</th>
                  <th className="text-left px-4 py-2 text-slate-600">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={`${item.sku_code}-${idx}`} className="border-t">
                    <td className="px-4 py-2 font-mono">{item.sku_code}</td>
                    <td className="px-4 py-2">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {header && items.length === 0 && searched && !error && (
          <div className="text-sm text-slate-500 text-center py-8">
            No SKUs found for this PO.
          </div>
        )}
      </div>
    </div>
  );
}