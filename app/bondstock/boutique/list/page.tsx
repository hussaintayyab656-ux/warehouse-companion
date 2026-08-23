"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

interface StockItem {
  id: number;
  sku: string;
  description: string;
  qty: number;
  pallet_no: string;
}

export default function BoutiqueListPage() {
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
    pallet_no: "",
  });
  const [adding, setAdding] = useState(false);

  // Pallet filter state
  const [palletFilter, setPalletFilter] = useState("");

  // Sort mode
  const [sortBy, setSortBy] = useState<"sku" | "pallet">("sku");

  // Reconciliation (stock count) mode
  const [reconcileMode, setReconcileMode] = useState(false);
  const [countedQty, setCountedQty] = useState<Record<number, string>>({});
  const [applying, setApplying] = useState(false);
  const [uploadNotFound, setUploadNotFound] = useState<string[]>([]);

  // ---- Bulk reconciliation via CSV/Excel upload ----
  function handleReconcileFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
        });

        if (rows.length < 2) {
          alert("File seems empty.");
          return;
        }

        // Normalize a header cell: lowercase, strip spaces/punctuation
        const normalize = (s: any) =>
          String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

        const header = rows[0].map(normalize);

        // Flexible matching: sku column contains "sku"
        // qty column contains "qty" or "quantity" or "count"
        const skuIdx = header.findIndex((h) => h.includes("sku"));
        const qtyIdx = header.findIndex(
          (h) => h.includes("qty") || h.includes("quantity") || h.includes("count")
        );

        if (skuIdx === -1 || qtyIdx === -1) {
          alert(
            "Couldn't find SKU and Qty columns. Make sure the file has headers like 'SKU' and 'Qty' (or 'Quantity')."
          );
          return;
        }

        const skuToQty: Record<string, string> = {};
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const sku = row[skuIdx];
          const qty = row[qtyIdx];
          if (sku !== undefined && String(sku).trim() !== "") {
            skuToQty[String(sku).trim().toUpperCase()] = String(qty).trim();
          }
        }

        const newCounted: Record<number, string> = {};
        const notFound: string[] = [];
        const matchedSkus = new Set<string>();

        items.forEach((item) => {
          const upperSku = item.sku.trim().toUpperCase();
          if (skuToQty[upperSku] !== undefined) {
            newCounted[item.id] = skuToQty[upperSku];
            matchedSkus.add(upperSku);
          }
        });

        Object.keys(skuToQty).forEach((sku) => {
          if (!matchedSkus.has(sku)) notFound.push(sku);
        });

        setCountedQty(newCounted);
        setUploadNotFound(notFound);
        setReconcileMode(true);
        alert(
          `Matched ${Object.keys(newCounted).length} items. ${
            notFound.length > 0
              ? notFound.length + " SKUs from the file were not found in the system."
              : ""
          }`
        );
      } catch (err: any) {
        console.error("File parse error:", err);
        alert("Couldn't read this file. Make sure it's a valid CSV or Excel file.");
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
      .eq("category", "boutique")
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
        pallet_no: newItem.pallet_no.trim() || "Unassigned",
        category: "boutique",
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
    setNewItem({ sku: "", description: "", qty: "", pallet_no: "" });
    setShowAddForm(false);
  }

  // ---- Edit existing item ----
  function startEdit(item: StockItem) {
    setEditingId(item.id);
    setEditForm({
      sku: item.sku,
      description: item.description,
      qty: item.qty,
      pallet_no: item.pallet_no,
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
        pallet_no: editForm.pallet_no,
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

  function handlePrint() {
    window.print();
  }

  const [showPalletLabel, setShowPalletLabel] = useState(false);
  const [labelFontSize, setLabelFontSize] = useState(72); // in px, default ~text-7xl

  function printPalletLabel() {
    setShowPalletLabel(true);
    setTimeout(() => {
      window.print();
      setShowPalletLabel(false);
    }, 100);
  }

  function exportToExcel() {
    const rows = [["SKU", "Description", "Qty", "Pallet No."]];
    filtered.forEach((item) => {
      rows.push([item.sku, item.description, String(item.qty), item.pallet_no]);
    });

    const csvContent = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const filename = palletFilter
      ? `Pallet_${palletFilter}_list.csv`
      : `Boutique_full_list.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Unique pallet numbers for the quick-select dropdown
  const uniquePallets = Array.from(
    new Set(items.map((i) => i.pallet_no))
  ).sort((a, b) => {
    const na = parseInt(a);
    const nb = parseInt(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  const filtered = items
    .filter((item) => {
      const matchesSearch =
        item.sku.toLowerCase().includes(search.toLowerCase()) ||
        item.description.toLowerCase().includes(search.toLowerCase()) ||
        String(item.pallet_no).toLowerCase().includes(search.toLowerCase());

      const matchesPallet =
        palletFilter === "" || item.pallet_no === palletFilter;

      return matchesSearch && matchesPallet;
    })
    .sort((a, b) => {
      if (sortBy === "sku") return a.sku.localeCompare(b.sku);
      // sort by pallet
      const na = parseInt(a.pallet_no);
      const nb = parseInt(b.pallet_no);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      if (!isNaN(na) && !isNaN(nb)) return a.sku.localeCompare(b.sku);
      return a.pallet_no.localeCompare(b.pallet_no);
    });

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className={showPalletLabel ? "min-h-screen bg-gray-50 print:p-0" : "min-h-screen bg-gray-50 p-6"}>
      {/* Controls — hidden when printing */}
      <div className="print:hidden">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">Bond Stock — Boutique List</h1>
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
            <input
              placeholder="Pallet No."
              value={newItem.pallet_no}
              onChange={(e) =>
                setNewItem((f) => ({ ...f, pallet_no: e.target.value }))
              }
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
              placeholder="Search SKU, description, or pallet..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Filter by Pallet
            </label>
            <select
              value={palletFilter}
              onChange={(e) => setPalletFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48"
            >
              <option value="">All Pallets</option>
              {uniquePallets.map((p) => (
                <option key={p} value={p}>
                  Pallet {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "sku" | "pallet")}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-40"
            >
              <option value="sku">SKU (A-Z)</option>
              <option value="pallet">Pallet Number</option>
            </select>
          </div>

          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
          >
            {palletFilter ? `Export Pallet ${palletFilter} as PDF` : "Export to PDF"}
          </button>

          {palletFilter && (
            <>
              <button
                onClick={printPalletLabel}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium"
              >
                Print Pallet {palletFilter} Label
              </button>

              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">
                  Label size
                </label>
                <button
                  onClick={() => setLabelFontSize((s) => Math.max(24, s - 8))}
                  className="w-7 h-7 flex items-center justify-center bg-gray-200 rounded text-sm font-bold hover:bg-gray-300"
                >
                  −
                </button>
                <span className="text-xs w-8 text-center">{labelFontSize}px</span>
                <button
                  onClick={() => setLabelFontSize((s) => Math.min(200, s + 8))}
                  className="w-7 h-7 flex items-center justify-center bg-gray-200 rounded text-sm font-bold hover:bg-gray-300"
                >
                  +
                </button>
              </div>
            </>
          )}

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
              reconcileMode
                ? "bg-gray-700 text-white"
                : "bg-orange-600 text-white"
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
          <p className="text-xs text-orange-700 mb-2">
            {uploadNotFound.length} SKU(s) from the uploaded file were not found in the
            system: {uploadNotFound.slice(0, 10).join(", ")}
            {uploadNotFound.length > 10 ? "..." : ""}
          </p>
        )}
      </div>

      {/* Big pallet label — only shows during print when triggered */}
      {showPalletLabel && palletFilter && (
        <div className="hidden print:flex print:fixed print:inset-0 print:items-center print:justify-center print:bg-white">
          <h1
            className="font-black tracking-tight"
            style={{ fontSize: `${labelFontSize}px` }}
          >
            PALLET {palletFilter}
          </h1>
        </div>
      )}

      {/* Print header — only shows when printing the list */}
      {!showPalletLabel && (
        <>
          <div className="hidden print:block mb-4">
            <h1 className="text-2xl font-bold">
              {palletFilter
                ? `Pallet ${palletFilter} — Picking List`
                : "Boutique — Full List"}
            </h1>
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
                  <th className="text-left px-4 py-2 font-semibold">Pallet</th>
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
                            const counted =
                              raw.trim() === "" ? null : Number(raw);
                            const isMatch =
                              counted !== null && counted === item.qty;
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
                      <td className="px-4 py-2">
                        {isEditing ? (
                          <input
                            value={editForm.pallet_no ?? ""}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                pallet_no: e.target.value,
                              }))
                            }
                            className="border rounded px-2 py-1 w-16"
                          />
                        ) : (
                          item.pallet_no
                        )}
                      </td>
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
        </>
      )}
    </div>
  );
}