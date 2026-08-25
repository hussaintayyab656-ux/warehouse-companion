"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

interface StockItem {
  id: number;
  sku: string;
  description: string;
  qty: number;
}

interface UnmatchedRow {
  sku: string;
  qty: string;
}

// Normalize a value cell for matching (SKU): trim + uppercase
const normalizeValue = (s: any) => String(s ?? "").trim().toUpperCase();

export default function AlcoholListPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<StockItem>>({});
  const [saving, setSaving] = useState(false);

  // Add-new-item form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    sku: "",
    description: "",
    qty: "",
  });
  const [adding, setAdding] = useState(false);

  // Sort mode
  const [sortBy, setSortBy] = useState<"sku" | "qty">("sku");

  // Reconciliation (stock count) mode
  const [reconcileMode, setReconcileMode] = useState(false);
  const [countedQty, setCountedQty] = useState<Record<number, string>>({});
  const [applying, setApplying] = useState(false);
  const [uploadNotFound, setUploadNotFound] = useState<UnmatchedRow[]>([]);
  // Keeps the most recently uploaded file so it can be downloaded on demand
  // via the "Download Last Uploaded File" button, without auto-downloading
  // it every time.
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);

  // ---- Backup: save a timestamped copy of every uploaded count/FRS file ----
  // This data is count-sensitive, so every uploaded file is always kept in
  // Supabase Storage (cloud, accessible from anywhere) — silently, in the
  // background. It is NOT auto-downloaded to this computer unless something
  // goes wrong with reading/matching the file (see downloadFileLocally
  // below) — otherwise it's only downloaded if you ask for it.
  async function backupToCloud(file: File) {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate()
    )}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `Alcohol_${stamp}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("alcohol-stock-list")
      .upload(storagePath, file, { upsert: false });

    if (uploadError) {
      console.error("Backup upload error:", uploadError.message);
    }
  }

  // Downloads the given file to this computer. Called automatically only
  // when something went wrong reading/matching the file, or manually via
  // the "Download Last Uploaded File" button.
  function downloadFileLocally(file: File) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", file.name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ---- Bulk reconciliation via CSV/Excel upload ----
  function handleReconcileFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLastUploadedFile(file);
    // Silent cloud backup of exactly what was uploaded, before we do
    // anything else with it. No local download happens here.
    backupToCloud(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        // Normalize a header cell: lowercase, strip spaces/punctuation
        const normalize = (s: any) =>
          String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

        // Search every sheet, and within each sheet check the first few rows
        // (in case there's a title row above the real headers), for a row
        // that contains both a SKU-like column and a Qty-like column.
        let foundRows: any[][] | null = null;
        let skuIdx = -1;
        let qtyIdx = -1;
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
            const sIdx = header.findIndex((h) => h.includes("sku"));
            const qIdx = header.findIndex(
              (h) =>
                h.includes("qty") || h.includes("quantity") || h.includes("count")
            );
            if (sIdx !== -1 && qIdx !== -1) {
              foundRows = rows;
              skuIdx = sIdx;
              qtyIdx = qIdx;
              headerRowIndex = r;
              break;
            }
          }
          if (foundRows) break;
        }

        if (!foundRows || skuIdx === -1 || qtyIdx === -1) {
          alert(
            "Couldn't find SKU and Qty columns in any sheet. Make sure the file has headers like 'SKU' and 'Qty' (or 'Quantity'). Downloading a copy so you can check it."
          );
          downloadFileLocally(file);
          return;
        }

        const rows = foundRows;
        const skuToQty: Record<string, string> = {};

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          const sku = row[skuIdx];
          const qty = row[qtyIdx];
          if (sku !== undefined && String(sku).trim() !== "") {
            skuToQty[normalizeValue(sku)] = String(qty).trim();
          }
        }

        const newCounted: Record<number, string> = {};
        const matchedSkus = new Set<string>();

        items.forEach((item) => {
          const normSku = normalizeValue(item.sku);
          if (skuToQty[normSku] !== undefined) {
            newCounted[item.id] = skuToQty[normSku];
            matchedSkus.add(normSku);
          }
        });

        const notFound: UnmatchedRow[] = [];
        Object.keys(skuToQty).forEach((sku) => {
          if (!matchedSkus.has(sku)) {
            notFound.push({ sku, qty: skuToQty[sku] });
          }
        });

        setCountedQty(newCounted);
        setUploadNotFound(notFound);
        setReconcileMode(true);
        alert(
          `Matched ${Object.keys(newCounted).length} item(s). ${
            notFound.length > 0
              ? notFound.length + " SKU(s) from the file were not found in the system."
              : ""
          }`
        );
      } catch (err: any) {
        console.error("File parse error:", err);
        alert(
          "Couldn't read this file. Make sure it's a valid CSV or Excel file. Downloading a copy so you can check it."
        );
        downloadFileLocally(file);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  useEffect(() => {
    fetchItems();
  }, []);

  async function fetchItems() {
    setLoading(true);
    const { data, error } = await supabase
      .from("bond_stock")
      .select("*")
      .eq("area", "bond")
      .eq("category", "alcohol")
      .order("sku", { ascending: true });

    if (error) {
      console.error("Supabase error:", error.message);
      setLoading(false);
      return;
    }

    setItems(data || []);
    setLoading(false);
  }

  // ---- Add new item ----
  async function addItem() {
    if (!newItem.sku.trim() || !newItem.description.trim()) {
      alert("SKU and Description are required.");
      return;
    }

    setAdding(true);
    const { data, error } = await supabase
      .from("bond_stock")
      .insert({
        sku: newItem.sku.trim(),
        description: newItem.description.trim(),
        qty: Number(newItem.qty) || 0,
        pallet_no: "N/A",
        category: "alcohol",
        area: "bond",
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
      [...prev, data as StockItem].sort((a, b) => a.sku.localeCompare(b.sku))
    );
    setNewItem({ sku: "", description: "", qty: "" });
    setShowAddForm(false);
  }

  // ---- Edit existing item ----
  function startEdit(item: StockItem) {
    setEditingId(item.id);
    setEditForm({
      sku: item.sku,
      description: item.description,
      qty: item.qty,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({});
  }

  async function saveEdit(id: number) {
    setSaving(true);
    const { error } = await supabase
      .from("bond_stock")
      .update({
        sku: editForm.sku,
        description: editForm.description,
        qty: editForm.qty,
      })
      .eq("id", id);

    setSaving(false);

    if (error) {
      console.error("Update error:", error.message);
      alert("Failed to save: " + error.message);
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? ({ ...item, ...editForm } as StockItem) : item
      )
    );
    setEditingId(null);
    setEditForm({});
  }

  // ---- Quick qty +/- ----
  async function adjustQty(item: StockItem, delta: number) {
    const newQty = Math.max(0, item.qty + delta);

    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, qty: newQty } : i))
    );

    const { error } = await supabase
      .from("bond_stock")
      .update({ qty: newQty })
      .eq("id", item.id);

    if (error) {
      console.error("Qty update error:", error.message);
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, qty: item.qty } : i))
      );
      alert("Failed to update quantity: " + error.message);
    }
  }

  // ---- Delete ----
  async function deleteItem(id: number) {
    if (!confirm("Delete this item? This cannot be undone.")) return;

    const { error } = await supabase.from("bond_stock").delete().eq("id", id);

    if (error) {
      console.error("Delete error:", error.message);
      alert("Failed to delete: " + error.message);
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  // ---- Reconciliation: apply all entered counted quantities ----
  async function applyCountedQuantities() {
    const entries = Object.entries(countedQty).filter(
      ([, val]) => val.trim() !== ""
    );

    if (entries.length === 0) {
      alert("No counted quantities entered yet.");
      return;
    }

    if (
      !confirm(
        `Apply ${entries.length} counted quantity update(s) to the system? This will overwrite the current Qty for those items.`
      )
    )
      return;

    setApplying(true);

    for (const [idStr, val] of entries) {
      const id = Number(idStr);
      const newQty = Number(val);
      if (isNaN(newQty)) continue;

      const { error } = await supabase
        .from("bond_stock")
        .update({ qty: newQty })
        .eq("id", id);

      if (error) {
        console.error("Reconcile update error:", error.message);
        continue;
      }

      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, qty: newQty } : item))
      );
    }

    setApplying(false);
    setCountedQty({});
    alert("Counted quantities applied.");
  }

  // ---- Unmatched-row fix: add as new item ----
  async function addMissingItem(row: UnmatchedRow) {
    const description = window.prompt(
      `Description for new item ${row.sku}?`,
      ""
    );
    if (description === null) return; // cancelled
    if (!description.trim()) {
      alert("Description is required to add this item.");
      return;
    }

    const qtyNum = Number(row.qty);
    const { data, error } = await supabase
      .from("bond_stock")
      .insert({
        sku: row.sku,
        description: description.trim(),
        qty: isNaN(qtyNum) ? 0 : qtyNum,
        pallet_no: "N/A",
        category: "alcohol",
        area: "bond",
      })
      .select()
      .single();

    if (error) {
      console.error("Add missing item error:", error.message);
      alert("Failed to add item: " + error.message);
      return;
    }

    setItems((prev) =>
      [...prev, data as StockItem].sort((a, b) => a.sku.localeCompare(b.sku))
    );
    setUploadNotFound((prev) => prev.filter((r) => r.sku !== row.sku));
  }

  function handlePrint() {
    window.print();
  }

  function exportToExcel() {
    const rows = [["SKU", "Description", "Qty"]];
    filtered.forEach((item) => {
      rows.push([item.sku, item.description, String(item.qty)]);
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
    link.setAttribute("download", "Alcohol_full_list.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const filtered = items
    .filter((item) => {
      return (
        item.sku.toLowerCase().includes(search.toLowerCase()) ||
        item.description.toLowerCase().includes(search.toLowerCase())
      );
    })
    .sort((a, b) => {
      if (sortBy === "sku") return a.sku.localeCompare(b.sku);
      return b.qty - a.qty;
    });

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Controls — hidden when printing */}
      <div className="print:hidden">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">Bond Stock — Alcohol / LR List</h1>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium"
          >
            {showAddForm ? "Cancel" : "+ Add Item"}
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">{items.length} items total</p>

        {showAddForm && (
          <div className="bg-white border rounded-lg p-4 mb-4 grid gap-3 sm:grid-cols-4 max-w-3xl">
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
              className="border rounded px-3 py-2 text-sm sm:col-span-2"
            />
            <input
              placeholder="Qty"
              type="number"
              value={newItem.qty}
              onChange={(e) => setNewItem((f) => ({ ...f, qty: e.target.value }))}
              className="border rounded px-3 py-2 text-sm"
            />
            <button
              onClick={addItem}
              disabled={adding}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 sm:col-span-1"
            >
              {adding ? "Adding..." : "Save New Item"}
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
              placeholder="Search SKU or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "sku" | "qty")}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-40"
            >
              <option value="sku">SKU (A-Z)</option>
              <option value="qty">Qty (High-Low)</option>
            </select>
          </div>

          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
          >
            Export to PDF
          </button>

          <button
            onClick={exportToExcel}
            className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium"
          >
            Export to Excel
          </button>

          <button
            onClick={() => {
              setReconcileMode((v) => !v);
              setCountedQty({});
              setUploadNotFound([]);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              reconcileMode ? "bg-gray-700 text-white" : "bg-orange-600 text-white"
            }`}
          >
            {reconcileMode ? "Exit Stock Count" : "Start Stock Count"}
          </button>

          <label className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium cursor-pointer">
            Upload FRS Sheet (CSV)
            <input
              type="file"
              accept=".csv,.xlsx,.xlsm,.xls"
              onChange={handleReconcileFileUpload}
              className="hidden"
            />
          </label>

          {lastUploadedFile && (
            <button
              onClick={() => downloadFileLocally(lastUploadedFile)}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg text-sm font-medium"
            >
              Download Last Uploaded File
            </button>
          )}

          {reconcileMode && (
            <button
              onClick={applyCountedQuantities}
              disabled={applying}
              className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {applying ? "Applying..." : "Apply Counted Quantities"}
            </button>
          )}
        </div>

        {uploadNotFound.length > 0 && (
          <div className="mb-4 border border-orange-300 rounded-lg overflow-hidden">
            <div className="bg-orange-100 px-4 py-2 text-sm font-semibold text-orange-800">
              {uploadNotFound.length} SKU(s) from the uploaded file didn't match —
              review and fix below
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-orange-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">SKU</th>
                    <th className="text-left px-3 py-2 font-semibold">File Qty</th>
                    <th className="text-left px-3 py-2 font-semibold">Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadNotFound.map((row, idx) => (
                    <tr key={`${row.sku}-${idx}`} className="border-t">
                      <td className="px-3 py-2 font-mono">{row.sku}</td>
                      <td className="px-3 py-2">{row.qty}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => addMissingItem(row)}
                          className="px-2 py-1 bg-green-600 text-white rounded text-xs font-medium"
                        >
                          + Add as new item
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Print header — only shows when printing the list */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">Bond Stock — Alcohol / LR List</h1>
        <p className="text-sm text-gray-600">{filtered.length} items</p>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">SKU</th>
              <th className="text-left px-4 py-2 font-semibold">Description</th>
              <th className="text-left px-4 py-2 font-semibold">Qty</th>
              {reconcileMode && (
                <th className="text-left px-4 py-2 font-semibold bg-orange-50">
                  Counted Qty
                </th>
              )}
              <th className="text-left px-4 py-2 font-semibold print:hidden">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const isEditing = editingId === item.id;
              const isZero = item.qty === 0;
              const isLow = item.qty > 0 && item.qty <= 5;
              const rowClass = isZero
                ? "bg-red-50 hover:bg-red-100"
                : isLow
                ? "bg-yellow-50 hover:bg-yellow-100"
                : "hover:bg-gray-50";
              return (
                <tr key={item.id} className={`border-t ${rowClass}`}>
                  <td className="px-4 py-2 font-mono">
                    {isEditing ? (
                      <input
                        value={editForm.sku ?? ""}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, sku: e.target.value }))
                        }
                        className="border rounded px-2 py-1 w-24"
                      />
                    ) : (
                      item.sku
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <input
                        value={editForm.description ?? ""}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            description: e.target.value,
                          }))
                        }
                        className="border rounded px-2 py-1 w-full"
                      />
                    ) : (
                      item.description
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <input
                        type="number"
                        value={editForm.qty ?? 0}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            qty: Number(e.target.value),
                          }))
                        }
                        className="border rounded px-2 py-1 w-20"
                      />
                    ) : (
                      <div className="flex items-center gap-2 print:block">
                        <button
                          onClick={() => adjustQty(item, -1)}
                          className="w-6 h-6 flex items-center justify-center bg-gray-200 rounded hover:bg-gray-300 text-sm font-bold print:hidden"
                        >
                          −
                        </button>
                        <span
                          className={`w-10 text-center font-medium ${
                            isZero
                              ? "text-red-600"
                              : isLow
                              ? "text-yellow-700"
                              : ""
                          }`}
                        >
                          {item.qty}
                          {isZero && " ⚠"}
                        </span>
                        <button
                          onClick={() => adjustQty(item, 1)}
                          className="w-6 h-6 flex items-center justify-center bg-gray-200 rounded hover:bg-gray-300 text-sm font-bold print:hidden"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </td>
                  {reconcileMode && (
                    <td className="px-4 py-2 bg-orange-50 print:hidden">
                      {(() => {
                        const raw = countedQty[item.id] ?? "";
                        const counted = raw.trim() === "" ? null : Number(raw);
                        const isMatch = counted !== null && counted === item.qty;
                        const isMismatch =
                          counted !== null && counted !== item.qty;
                        return (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              placeholder="—"
                              value={raw}
                              onChange={(e) =>
                                setCountedQty((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              className={`border rounded px-2 py-1 w-16 ${
                                isMismatch
                                  ? "border-red-400 bg-red-50"
                                  : isMatch
                                  ? "border-green-400 bg-green-50"
                                  : ""
                              }`}
                            />
                            {isMatch && (
                              <span className="text-green-600 text-sm">✓</span>
                            )}
                            {isMismatch && (
                              <span className="text-red-600 text-xs font-medium">
                                {counted! > item.qty ? "+" : ""}
                                {counted! - item.qty}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                  )}
                  <td className="px-4 py-2 print:hidden">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(item.id)}
                          disabled={saving}
                          className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium disabled:opacity-50"
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-xs font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(item)}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="text-gray-500 mt-4 print:hidden">
          No items match your search.
        </p>
      )}
    </div>
  );
}