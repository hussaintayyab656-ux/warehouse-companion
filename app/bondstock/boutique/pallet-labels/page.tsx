"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface PalletGroup {
  pallet_no: string;
  itemCount: number;
}

export default function PalletLabelsPage() {
  const [pallets, setPallets] = useState<PalletGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState("");

  useEffect(() => {
    fetchPallets();
  }, []);

  async function fetchPallets() {
    setLoading(true);
    const { data, error } = await supabase
      .from("bond_stock")
      .select("pallet_no")
      .eq("area", "bond")
      .eq("category", "boutique");

    if (error) {
      console.error("Supabase error:", error.message, error.details, error.hint, error.code);
      setLoading(false);
      return;
    }

    const counts: Record<string, number> = {};
    data.forEach((row) => {
      const p = row.pallet_no || "Unassigned";
      counts[p] = (counts[p] || 0) + 1;
    });

    const grouped = Object.entries(counts)
      .map(([pallet_no, itemCount]) => ({ pallet_no, itemCount }))
      .sort((a, b) => {
        const na = parseInt(a.pallet_no);
        const nb = parseInt(b.pallet_no);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.pallet_no.localeCompare(b.pallet_no);
      });

    setPallets(grouped);
    setLoading(false);
  }

  function toggle(pallet: string) {
    setSelected((prev) =>
      prev.includes(pallet) ? prev.filter((p) => p !== pallet) : [...prev, pallet]
    );
  }

  function addManualPallet() {
    const trimmed = manualInput.trim();
    if (!trimmed) return;

    const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
    const newNumbers: string[] = [];

    parts.forEach((part) => {
      if (part.includes("-")) {
        const [startStr, endStr] = part.split("-").map((s) => s.trim());
        const start = parseInt(startStr);
        const end = parseInt(endStr);
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          for (let i = start; i <= end; i++) {
            newNumbers.push(String(i));
          }
        }
      } else {
        newNumbers.push(part);
      }
    });

    setSelected((prev) => {
      const combined = [...prev];
      newNumbers.forEach((n) => {
        if (!combined.includes(n)) combined.push(n);
      });
      return combined;
    });

    setManualInput("");
  }

  function removeSelected(pallet: string) {
    setSelected((prev) => prev.filter((p) => p !== pallet));
  }

  function clearAll() {
    setSelected([]);
  }

  function selectAllFromData() {
    setSelected(pallets.map((p) => p.pallet_no));
  }

  function handlePrint() {
    window.print();
  }

  if (loading) return <div className="p-6">Loading pallets...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="print:hidden p-6 border-b bg-white sticky top-0 z-10">
        <h1 className="text-xl font-bold mb-4">Bond Stock — Boutique Pallet Labels</h1>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type pallet number(s) — e.g. "5" or "1-100" or "5,6,9"
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addManualPallet()}
              placeholder="e.g. 1-100"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64"
            />
            <button
              onClick={addManualPallet}
              className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium"
            >
              Add
            </button>
          </div>
        </div>

        {pallets.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">
                From your Bond data:
              </span>
              <button
                onClick={selectAllFromData}
                className="text-xs text-blue-600 underline"
              >
                Select all
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {pallets.map((p) => (
                <button
                  key={p.pallet_no}
                  onClick={() => toggle(p.pallet_no)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${
                    selected.includes(p.pallet_no)
                      ? "bg-black text-white border-black"
                      : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  Pallet {p.pallet_no} ({p.itemCount})
                </button>
              ))}
            </div>
          </div>
        )}

        {selected.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">
                Will print ({selected.length}):
              </span>
              <button onClick={clearAll} className="text-xs text-red-600 underline">
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.map((p) => (
                <span
                  key={p}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-50 border border-blue-300 rounded-full text-sm"
                >
                  {p}
                  <button
                    onClick={() => removeSelected(p)}
                    className="text-blue-500 hover:text-red-500 font-bold"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handlePrint}
          disabled={selected.length === 0}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-40"
        >
          Print Selected Labels
        </button>
      </div>

      <div>
        {selected.map((p) => (
          <div
            key={p}
            className="print-page flex items-center justify-center h-screen page-break"
          >
            <h1 className="text-9xl font-black tracking-tight">
              PALLET {p}
            </h1>
          </div>
        ))}
      </div>

      <style jsx global>{`
        @media print {
          .page-break {
            page-break-after: always;
          }
          body {
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}