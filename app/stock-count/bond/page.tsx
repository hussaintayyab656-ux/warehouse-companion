"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

interface StockCountItem {
  id: number;
  sku: string;
  description: string;
  location: string;
  frs_qty: number;
  count_1: number | null;
  count_2: number | null;
  count_3: number | null;
  count_4: number | null;
  count_5: number | null;
  final_count: number | null;
  discrepancy: number | null;
}

const normalizeValue = (s: any) => String(s ?? "").trim().toUpperCase();

export default function BondStockCountPage() {
  const [items, setItems] = useState<StockCountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    sku: "",
    description: "",
    location: "",
    frs_qty: "",
  });
  const [adding, setAdding] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<string | null>(null);

  // Which of Count 1-5 should be included in Print / Excel export.
  // Everything else (SKU, Description, Location, FRS Qty, Final, Discrepancy)
  // is always included.
  const [printCounts, setPrintCounts] = useState<Set<number>>(
    new Set([1, 2, 3, 4, 5])
  );

  function togglePrintCount(n: number) {
    setPrintCounts((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    setLoading(true);
    const { data, error } = await supabase
      .from("stock_counts")
      .select("*")
      .eq("area", "bond")
      .order("sku", { ascending: true });

    if (error) {
      console.error("Supabase error:", error.message);
      setLoading(false);
      return;
    }

    setItems((data as StockCountItem[]) || []);
    setLoading(false);
  }

  // ---- Add a single item manually ----
  async function addItem() {
    if (!newItem.sku.trim() || !newItem.description.trim()) {
      alert("SKU and Description are required.");
      return;
    }

    setAdding(true);
    const { data, error } = await supabase
      .from("stock_counts")
      .insert({
        area: "bond",
        sku: newItem.sku.trim(),
        description: newItem.description.trim(),
        location: newItem.location.trim() || "N/A",
        frs_qty: Number(newItem.frs_qty) || 0,
      })
      .select()
      .single();

    setAdding(false);

    if (error) {
      console.error("Insert error:", error.message);
      alert("Failed to add item: " + error.message);
      return;
    }

    setItems((prev) =>
      [...prev, data as StockCountItem].sort((a, b) => a.sku.localeCompare(b.sku))
    );
    setNewItem({ sku: "", description: "", location: "", frs_qty: "" });
    setShowAddForm(false);
  }

  // ---- Delete ----
  async function deleteItem(id: number) {
    if (!confirm("Delete this item? This cannot be undone.")) return;

    const { error } = await supabase.from("stock_counts").delete().eq("id", id);

    if (error) {
      console.error("Delete error:", error.message);
      alert("Failed to delete: " + error.message);
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  // ---- Upload FRS data (CSV/Excel): update existing SKUs' FRS Qty, insert new ones ----
  function handleFrsUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const normalize = (s: any) =>
          String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

        let foundRows: any[][] | null = null;
        let skuIdx = -1;
        let qtyIdx = -1;
        let descIdx = -1;
        let locIdx = -1;
        let headerRowIndex = -1;

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: "",
          });
          if (rows.length < 2) continue;

          const rowsToCheck = Math.min(5, rows.length);
          for (let r = 0; r < rowsToCheck; r++) {
            const header = rows[r].map(normalize);
            const sIdx = header.findIndex(
              (h) =>
                h.includes("sku") ||
                h.includes("productcode") ||
                h.includes("itemcode") ||
                h === "code"
            );
            const qIdx = header.findIndex(
              (h) => h.includes("frsqty") || h.includes("qty") || h.includes("quantity")
            );
            if (sIdx !== -1 && qIdx !== -1) {
              foundRows = rows;
              skuIdx = sIdx;
              qtyIdx = qIdx;
              headerRowIndex = r;
              descIdx = header.findIndex((h) => h.includes("desc"));
              locIdx = header.findIndex((h) => h.includes("location") || h.includes("pallet"));
              break;
            }
          }
          if (foundRows) break;
        }

        if (!foundRows || skuIdx === -1 || qtyIdx === -1) {
          alert(
            "Couldn't find SKU and Qty columns. Make sure the file has headers like 'SKU' and 'FRS Qty' (or 'Qty')."
          );
          return;
        }

        const rows = foundRows;
        let updated = 0;
        let inserted = 0;
        let skippedNoSku = 0;
        let firstError: string | null = null;

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          const skuRaw = row[skuIdx];
          if (skuRaw === undefined || String(skuRaw).trim() === "") {
            skippedNoSku++;
            continue;
          }

          const sku = String(skuRaw).trim();
          const normSku = normalizeValue(sku);
          const qty = Number(row[qtyIdx]) || 0;
          const desc = descIdx !== -1 ? String(row[descIdx] ?? "").trim() : "";
          const loc = locIdx !== -1 ? String(row[locIdx] ?? "").trim() : "";

          const existing = items.find((it) => normalizeValue(it.sku) === normSku);

          if (existing) {
            const { error } = await supabase
              .from("stock_counts")
              .update({ frs_qty: qty })
              .eq("id", existing.id);
            if (!error) updated++;
            else if (!firstError) firstError = error.message;
          } else {
            const { error } = await supabase.from("stock_counts").insert({
              area: "bond",
              sku,
              description: desc || "Unknown item",
              location: loc || "N/A",
              frs_qty: qty,
            });
            if (!error) inserted++;
            else if (!firstError) firstError = error.message;
          }
        }

        setUploadSummary(
          firstError
            ? `FRS data applied: ${updated} updated, ${inserted} added, ${skippedNoSku} skipped (no SKU). ERROR on remaining rows: ${firstError}`
            : `FRS data applied: ${updated} item(s) updated, ${inserted} new item(s) added${
                skippedNoSku > 0 ? `, ${skippedNoSku} row(s) skipped (no SKU)` : ""
              }. (Parsed ${rows.length - headerRowIndex - 1} data row(s) from header at row ${headerRowIndex + 1}, columns: SKU=${skuIdx}, Qty=${qtyIdx}, Desc=${descIdx}, Location=${locIdx})`
        );
        fetchItems();
      } catch (err: any) {
        console.error("File parse error:", err);
        alert("Couldn't read this file. Make sure it's a valid CSV or Excel file. Error: " + (err?.message || String(err)));
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  // ---- Save a count/final value for one item ----
  async function saveField(
    id: number,
    field: "count_1" | "count_2" | "count_3" | "count_4" | "count_5" | "final_count",
    value: string
  ) {
    const num = value.trim() === "" ? null : Number(value);
    if (value.trim() !== "" && isNaN(num as number)) return;

    const item = items.find((it) => it.id === id);
    if (!item) return;

    const updatePayload: Partial<StockCountItem> = { [field]: num } as any;

    // Recalculate discrepancy whenever final_count changes
    if (field === "final_count") {
      updatePayload.discrepancy = num === null ? null : num - item.frs_qty;
    }

    const { error } = await supabase
      .from("stock_counts")
      .update(updatePayload)
      .eq("id", id);

    if (error) {
      console.error("Update error:", error.message);
      alert("Failed to save: " + error.message);
      return;
    }

    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...updatePayload } : it))
    );
  }

  const filtered = items.filter(
    (item) =>
      item.sku.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase()) ||
      item.location.toLowerCase().includes(search.toLowerCase())
  );

  function handlePrint() {
    window.print();
  }

  function exportToExcel() {
    const countNums = [1, 2, 3, 4, 5].filter((n) => printCounts.has(n));
    const headerRow = [
      "SKU",
      "Description",
      "Location",
      "FRS Qty",
      ...countNums.map((n) => `Count ${n}`),
      "Final",
      "Discrepancy",
    ];
    const rows = [headerRow];

    filtered.forEach((item) => {
      const countValues = countNums.map((n) => {
        const val = item[`count_${n}` as keyof StockCountItem];
        return val === null || val === undefined ? "" : String(val);
      });
      rows.push([
        item.sku,
        item.description,
        item.location,
        String(item.frs_qty),
        ...countValues,
        item.final_count === null ? "" : String(item.final_count),
        item.discrepancy === null ? "" : String(item.discrepancy),
      ]);
    });

    const csvContent = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "Bond_Stock_Count.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="print:hidden">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold">Bond — Stock Count</h1>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium"
        >
          {showAddForm ? "Cancel" : "+ Add Item"}
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Enter counts below. Mismatches vs FRS show in red.
      </p>

      {showAddForm && (
        <div className="bg-white border rounded-lg p-4 mb-4 grid gap-3 sm:grid-cols-5 max-w-4xl">
          <input
            placeholder="SKU"
            value={newItem.sku}
            onChange={(e) => setNewItem((f) => ({ ...f, sku: e.target.value }))}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            placeholder="Description"
            value={newItem.description}
            onChange={(e) =>
              setNewItem((f) => ({ ...f, description: e.target.value }))
            }
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            placeholder="Location"
            value={newItem.location}
            onChange={(e) => setNewItem((f) => ({ ...f, location: e.target.value }))}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            placeholder="FRS Qty"
            type="number"
            value={newItem.frs_qty}
            onChange={(e) => setNewItem((f) => ({ ...f, frs_qty: e.target.value }))}
            className="border rounded px-3 py-2 text-sm"
          />
          <button
            onClick={addItem}
            disabled={adding}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {adding ? "Adding..." : "Save Item"}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Search
          </label>
          <input
            type="text"
            placeholder="Search SKU, description, or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72"
          />
        </div>

        <label className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium cursor-pointer">
          Upload FRS Data (CSV/Excel)
          <input
            type="file"
            accept=".csv,.xlsx,.xlsm,.xls"
            onChange={handleFrsUpload}
            className="hidden"
          />
        </label>

        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
        >
          Export to PDF / Print
        </button>

        <button
          onClick={exportToExcel}
          className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium"
        >
          Export to Excel
        </button>
      </div>

      <div className="mb-4">
        <p className="text-xs font-medium text-gray-600 mb-1">
          Include in Print / Export:
        </p>
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={printCounts.has(n)}
                onChange={() => togglePrintCount(n)}
              />
              Count {n}
            </label>
          ))}
        </div>
      </div>

      {uploadSummary && (
        <p className="text-xs text-indigo-700 mb-4">{uploadSummary}</p>
      )}
      </div>

      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold">Bond — Stock Count</h1>
        <p className="text-sm text-gray-600">
          {filtered.length} items · Printed {new Date().toLocaleDateString()}
        </p>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">SKU</th>
              <th className="text-left px-3 py-2 font-semibold">Description</th>
              <th className="text-left px-3 py-2 font-semibold">Location</th>
              <th className="text-left px-3 py-2 font-semibold">FRS Qty</th>
              {[1, 2, 3, 4, 5].map((n) => (
                <th
                  key={n}
                  className={`text-left px-3 py-2 font-semibold bg-blue-50 ${
                    printCounts.has(n) ? "" : "print:hidden"
                  }`}
                >
                  Count {n}
                </th>
              ))}
              <th className="text-left px-3 py-2 font-semibold bg-amber-50">Final</th>
              <th className="text-left px-3 py-2 font-semibold">Discrepancy</th>
              <th className="text-left px-3 py-2 font-semibold print:hidden">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const countFields: Array<
                "count_1" | "count_2" | "count_3" | "count_4" | "count_5"
              > = ["count_1", "count_2", "count_3", "count_4", "count_5"];

              return (
                <tr key={item.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono">{item.sku}</td>
                  <td className="px-3 py-2">{item.description}</td>
                  <td className="px-3 py-2">{item.location}</td>
                  <td className="px-3 py-2 font-medium">{item.frs_qty}</td>

                  {countFields.map((field, idx) => {
                    const n = idx + 1;
                    const val = item[field];
                    const isMismatch = val !== null && val !== item.frs_qty;
                    return (
                      <td
                        key={field}
                        className={`px-3 py-2 bg-blue-50/40 ${
                          printCounts.has(n) ? "" : "print:hidden"
                        }`}
                      >
                        <input
                          type="number"
                          defaultValue={val ?? ""}
                          placeholder="—"
                          onBlur={(e) => saveField(item.id, field, e.target.value)}
                          className={`w-16 rounded border px-2 py-1 ${
                            isMismatch
                              ? "border-red-400 bg-red-50 text-red-700"
                              : val !== null
                              ? "border-green-400 bg-green-50 text-green-700"
                              : "border-gray-300"
                          }`}
                        />
                      </td>
                    );
                  })}

                  <td className="px-3 py-2 bg-amber-50/40">
                    <input
                      type="number"
                      defaultValue={item.final_count ?? ""}
                      placeholder="—"
                      onBlur={(e) => saveField(item.id, "final_count", e.target.value)}
                      className="w-16 rounded border border-amber-300 px-2 py-1"
                    />
                  </td>

                  <td className="px-3 py-2 font-medium">
                    {item.discrepancy === null ? (
                      <span className="text-gray-400">—</span>
                    ) : item.discrepancy === 0 ? (
                      <span className="text-green-600">0</span>
                    ) : (
                      <span className="text-red-600">
                        {item.discrepancy > 0 ? "+" : ""}
                        {item.discrepancy}
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-2 print:hidden">
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="text-gray-500 mt-4 print:hidden">
          No items yet — upload FRS data or add an item to get started.
        </p>
      )}
    </div>
  );
}