'use client';

import Link from 'next/link';
import NavBar from '@/lib/components/NavBar';

export default function StockCountPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar />
      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold text-slate-800 mb-2">Stock Count</h1>
        <p className="text-slate-600 mb-8">Select an area to start or continue a stock count.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Link
            href="/stock-count/bond"
            className="block bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition"
          >
            <h2 className="text-lg font-semibold text-slate-800 mb-1">Bond</h2>
            <p className="text-sm text-slate-500">Stock count for the Bond area</p>
          </Link>

          <Link
            href="/stock-count/fab-bond"
            className="block bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition"
          >
            <h2 className="text-lg font-semibold text-slate-800 mb-1">Fab Bond</h2>
            <p className="text-sm text-slate-500">Stock count for the Fab Bond area</p>
          </Link>
        </div>
      </div>
    </div>
  );
}