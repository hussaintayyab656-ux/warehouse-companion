"use client";

import { Fragment, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

interface StockItem {
  id: number;
  sku: string;
  description: string;
  qty: number;
  pallet_no: string;
}

interface UnmatchedRow {
  sku: string;
  pallet: string;
  qty: string;
  isFloor: boolean;
}

// Normalize a value cell for matching (SKU / Pallet): trim + uppercase
const normalizeValue = (s: any) => String(s ?? "").trim().toUpperCase();

// Normalize a pallet value specifically: blank/empty means the item hasn't
// physically been moved to a pallet yet (still on the floor after GRV) —
// treat that the same as "Misc" so it matches items already labeled Misc
// in the system, instead of showing as a false "not found".
const normalizePallet = (s: any) => {
  const v = normalizeValue(s);
  return v === "" ? "MISC" : v;
};

// An item counts as "Floor Stock" (GRV'd but not yet physically palletized)
// if its pallet is Misc/blank.
const isFloorPallet = (palletNo: string) => normalizePallet(palletNo) === "MISC";

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
  // Counted quantities for real pallet stock (kept completely separate from
  // floor stock so applying one can never touch the other)
  const [countedQty, setCountedQty] = useState<Record<number, string>>({});
  const [applying, setApplying] = useState(false);
  // Counted quantities for floor stock (Pallet = Misc, GRV'd but not yet
  // physically moved to a pallet)
  const [floorCountedQty, setFloorCountedQty] = useState<Record<number, string>>({});
  const [applyingFloor, setApplyingFloor] = useState(false);

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
    const storagePath = `Boutique_${stamp}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("boutique-pallet-list")
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
        // Also look for a Pallet-like column in that same header row, if present.
        let foundRows: any[][] | null = null;
        let skuIdx = -1;
        let qtyIdx = -1;
        let palletIdx = -1;
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
              palletIdx = header.findIndex((h) => h.includes("pallet"));
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
        const hasPalletColumn = palletIdx !== -1;

        // Real pallet rows: "SKU|PALLET" -> qty
        const skuPalletToQty: Record<string, string> = {};
        // Floor rows: blank/Misc pallet in the file — GRV'd but not yet
        // physically moved to a pallet. SKU -> qty
        const skuToQtyFloor: Record<string, string> = {};
        // Fallback map used only when the file has no pallet column at all
        // (can't tell floor vs pallet apart in that case)
        const skuToQty: Record<string, string> = {};

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          const sku = row[skuIdx];
          const qty = row[qtyIdx];
          if (sku !== undefined && String(sku).trim() !== "") {
            const normSku = normalizeValue(sku);
            const qtyStr = String(qty).trim();
            skuToQty[normSku] = qtyStr;

            if (hasPalletColumn) {
              const palletNorm = normalizePallet(row[palletIdx]);
              if (palletNorm === "MISC") {
                skuToQtyFloor[normSku] = qtyStr;
              } else {
                skuPalletToQty[`${normSku}|${palletNorm}`] = qtyStr;
              }
            }
          }
        }

        const newCounted: Record<number, string> = {};
        const newFloorCounted: Record<number, string> = {};
        const matchedPalletKeys = new Set<string>();
        const matchedFloorSkus = new Set<string>();
        const matchedFallbackSkus = new Set<string>();

        items.forEach((item) => {
          const normSku = normalizeValue(item.sku);

          if (hasPalletColumn) {
            const itemPalletNorm = normalizePallet(item.pallet_no);
            if (itemPalletNorm === "MISC") {
              // Floor stock item — match by SKU only against floor rows
              if (skuToQtyFloor[normSku] !== undefined) {
                newFloorCounted[item.id] = skuToQtyFloor[normSku];
                matchedFloorSkus.add(normSku);
              }
            } else {
              // Real pallet item — match strictly on SKU + Pallet so
              // duplicate SKUs across different pallets don't mix up.
              const key = `${normSku}|${itemPalletNorm}`;
              if (skuPalletToQty[key] !== undefined) {
                newCounted[item.id] = skuPalletToQty[key];
                matchedPalletKeys.add(key);
              }
            }
          } else {
            // No pallet column in the uploaded file — fall back to SKU-only
            // matching (old behavior); can't split floor vs pallet here.
            if (skuToQty[normSku] !== undefined) {
              newCounted[item.id] = skuToQty[normSku];
              matchedFallbackSkus.add(normSku);
            }
          }
        });

        // Figure out which rows from the file never matched anything
        const notFound: UnmatchedRow[] = [];
        if (hasPalletColumn) {
          Object.keys(skuPalletToQty).forEach((key) => {
            if (!matchedPalletKeys.has(key)) {
              const [sku, pallet] = key.split("|");
              notFound.push({ sku, pallet, qty: skuPalletToQty[key], isFloor: false });
            }
          });
          Object.keys(skuToQtyFloor).forEach((sku) => {
            if (!matchedFloorSkus.has(sku)) {
              notFound.push({ sku, pallet: "Misc", qty: skuToQtyFloor[sku], isFloor: true });
            }
          });
        } else {
          Object.keys(skuToQty).forEach((sku) => {
            if (!matchedFallbackSkus.has(sku)) {
              notFound.push({ sku, pallet: "", qty: skuToQty[sku], isFloor: false });
            }
          });
        }

        setCountedQty(newCounted);
        setFloorCountedQty(newFloorCounted);
        setUploadNotFound(notFound);
        setReconcileMode(true);

        const palletMatchedCount = Object.keys(newCounted).length;
        const floorMatchedCount = Object.keys(newFloorCounted).length;

        alert(
          hasPalletColumn
            ? `Matched ${palletMatchedCount} pallet stock item(s) and ${floorMatchedCount} floor stock item(s) (matched by SKU + Pallet). ${
                notFound.length > 0
                  ? notFound.length + " row(s) from the file were not found in the system."
                  : ""
              }`
            : `Matched ${palletMatchedCount} item(s) by SKU only — no Pallet column found in file, so floor stock couldn't be separated. ${
                notFound.length > 0
                  ? notFound.length + " row(s) from the file were not found in the system."
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

  // ---- Reconciliation: apply pallet stock counted quantities ----
  // ONLY touches items that are on a real pallet — never floor stock.
  async function applyCountedQuantities() {
    const entries = Object.entries(countedQty).filter(
      ([, val]) => val.trim() !== ""
    );

    if (entries.length === 0) {
      alert("No pallet stock counted quantities entered yet.");
      return;
    }

    if (
      !confirm(
        `Apply ${entries.length} pallet stock quantity update(s)? This will overwrite the current Qty for those items. Floor stock is not affected.`
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
    alert("Pallet stock quantities applied.");
  }

  // ---- Reconciliation: apply floor stock counted quantities ----
  // ONLY touches items with Pallet = Misc — never real pallet stock.
  async function applyFloorStockQuantities() {
    const entries = Object.entries(floorCountedQty).filter(
      ([, val]) => val.trim() !== ""
    );

    if (entries.length === 0) {
      alert("No floor stock counted quantities entered yet.");
      return;
    }

    if (
      !confirm(
        `Apply ${entries.length} floor stock quantity update(s)? This only affects items on Pallet "Misc" (GRV'd but not yet physically palletized). Pallet stock is not affected.`
      )
    )
      return;

    setApplyingFloor(true);

    for (const [idStr, val] of entries) {
      const id = Number(idStr);
      const newQty = Number(val);
      if (isNaN(newQty)) continue;

      const { error } = await supabase
        .from("bond_stock")
        .update({ qty: newQty })
        .eq("id", id);

      if (error) {
        console.error("Floor stock update error:", error.message);
        continue;
      }

      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, qty: newQty } : item))
      );
    }

    setApplyingFloor(false);
    setFloorCountedQty({});
    alert("Floor stock quantities applied.");
  }

  // ---- Unmatched-row fixes (used by both the pallet and floor panels) ----
  async function fixMovePallet(itemId: number, row: UnmatchedRow) {
    const newQty = Number(row.qty);
    const updatePayload: Partial<StockItem> = { pallet_no: row.pallet };
    if (!isNaN(newQty)) updatePayload.qty = newQty;

    if (
      !confirm(
        `Move this item to Pallet ${row.pallet}${
          !isNaN(newQty) ? ` and set Qty to ${newQty}` : ""
        }?`
      )
    )
      return;

    const { error } = await supabase
      .from("bond_stock")
      .update(updatePayload)
      .eq("id", itemId);

    if (error) {
      console.error("Fix pallet error:", error.message);
      alert("Failed to update: " + error.message);
      return;
    }

    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, ...updatePayload } : i))
    );
    setUploadNotFound((prev) =>
      prev.filter((r) => !(r.sku === row.sku && r.pallet === row.pallet))
    );
  }

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
        pallet_no: row.pallet || "Unassigned",
        category: "boutique",
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
    setUploadNotFound((prev) =>
      prev.filter((r) => !(r.sku === row.sku && r.pallet === row.pallet))
    );
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

  // During reconciliation, group pallet stock first and floor stock (Misc)
  // last, with a divider row between them — so counting the two never gets
  // visually mixed up.
  const displayItems = reconcileMode
    ? [
        ...filtered.filter((i) => !isFloorPallet(i.pallet_no)),
        ...filtered.filter((i) => isFloorPallet(i.pallet_no)),
      ]
    : filtered;

  const floorStartIndex = reconcileMode
    ? displayItems.findIndex((i) => isFloorPallet(i.pallet_no))
    : -1;

  const unmatchedPallet = uploadNotFound.filter((r) => !r.isFloor);
  const unmatchedFloor = uploadNotFound.filter((r) => r.isFloor);

  function renderUnmatchedRow(row: UnmatchedRow, idx: number, isFloorPanel = false) {
    const matches = items.filter((i) => normalizeValue(i.sku) === row.sku);
    return (
      <tr key={`${row.sku}-${row.pallet}-${idx}`} className="border-t">
        <td className="px-3 py-2 font-mono">{row.sku}</td>
        {!isFloorPanel && <td className="px-3 py-2">{row.pallet || "—"}</td>}
        <td className="px-3 py-2">{row.qty}</td>
        <td className="px-3 py-2">
          {matches.length > 0 ? (
            <span className="text-amber-700 text-xs">
              In system on pallet(s): {matches.map((m) => m.pallet_no).join(", ")}
            </span>
          ) : (
            <span className="text-red-600 text-xs">Not in system</span>
          )}
        </td>
        <td className="px-3 py-2">
          {matches.length > 0 ? (
            <div className="flex flex-col gap-1">
              {matches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => fixMovePallet(m.id, row)}
                  className="px-2 py-1 bg-amber-600 text-white rounded text-xs font-medium text-left"
                >
                  Move Pallet {m.pallet_no} → {row.pallet || "?"} (Qty {row.qty})
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => addMissingItem(row)}
              className="px-2 py-1 bg-green-600 text-white rounded text-xs font-medium"
            >
              + Add as new item
            </button>
          )}
        </td>
      </tr>
    );
  }

  function renderRow(item: StockItem) {
    const isEditing = editingId === item.id;
    const isZero = item.qty === 0;
    const isLow = item.qty > 0 && item.qty <= 5;
    const rowClass = isZero
      ? "bg-red-50 hover:bg-red-100"
      : isLow
      ? "bg-yellow-50 hover:bg-yellow-100"
      : "hover:bg-gray-50";
    const itemIsFloor = isFloorPallet(item.pallet_no);
    const stateMap = itemIsFloor ? floorCountedQty : countedQty;
    const setStateMap = itemIsFloor ? setFloorCountedQty : setCountedQty;

    return (
      <tr className={`border-t ${rowClass}`}>
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
                  isZero ? "text-red-600" : isLow ? "text-yellow-700" : ""
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
          <td
            className={`px-4 py-2 print:hidden ${
              itemIsFloor ? "bg-amber-50" : "bg-orange-50"
            }`}
          >
            {(() => {
              const raw = stateMap[item.id] ?? "";
              const counted = raw.trim() === "" ? null : Number(raw);
              const isMatch = counted !== null && counted === item.qty;
              const isMismatch = counted !== null && counted !== item.qty;
              return (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="—"
                    value={raw}
                    onChange={(e) =>
                      setStateMap((prev) => ({
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
  }

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
              setFloorCountedQty({});
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

          {lastUploadedFile && (
            <button
              onClick={() => downloadFileLocally(lastUploadedFile)}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg text-sm font-medium"
            >
              Download Last Uploaded File
            </button>
          )}

          {reconcileMode && (
            <>
              <button
                onClick={applyCountedQuantities}
                disabled={applying}
                className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {applying ? "Applying..." : "Apply Pallet Stock"}
              </button>
              <button
                onClick={applyFloorStockQuantities}
                disabled={applyingFloor}
                className="px-4 py-2 bg-amber-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {applyingFloor ? "Applying..." : "Apply Floor Stock"}
              </button>
            </>
          )}
        </div>

        {uploadNotFound.length > 0 && (
          <div className="space-y-4 mb-4">
            {unmatchedPallet.length > 0 && (
              <div className="border border-orange-300 rounded-lg overflow-hidden">
                <div className="bg-orange-100 px-4 py-2 text-sm font-semibold text-orange-800">
                  {unmatchedPallet.length} pallet stock row(s) from the uploaded
                  file didn't match — review and fix below
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-orange-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">SKU</th>
                        <th className="text-left px-3 py-2 font-semibold">
                          File Pallet
                        </th>
                        <th className="text-left px-3 py-2 font-semibold">
                          File Qty
                        </th>
                        <th className="text-left px-3 py-2 font-semibold">
                          Status
                        </th>
                        <th className="text-left px-3 py-2 font-semibold">Fix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unmatchedPallet.map((row, idx) =>
                        renderUnmatchedRow(row, idx, false)
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {unmatchedFloor.length > 0 && (
              <div className="border border-amber-300 rounded-lg overflow-hidden">
                <div className="bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900">
                  {unmatchedFloor.length} floor stock row(s) — GRV'd but not yet
                  physically palletized — didn't match — review and fix below
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-amber-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">SKU</th>
                        <th className="text-left px-3 py-2 font-semibold">
                          File Qty
                        </th>
                        <th className="text-left px-3 py-2 font-semibold">
                          Status
                        </th>
                        <th className="text-left px-3 py-2 font-semibold">Fix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unmatchedFloor.map((row, idx) =>
                        renderUnmatchedRow(row, idx, true)
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
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
                {displayItems.map((item, idx) => (
                  <Fragment key={item.id}>
                    {reconcileMode && idx === floorStartIndex && (
                      <tr>
                        <td
                          colSpan={6}
                          className="bg-amber-100 text-amber-900 font-semibold text-xs px-4 py-2 border-t-2 border-amber-400"
                        >
                          Floor Stock — GRV'd but not yet physically palletized
                          (Pallet: Misc)
                        </td>
                      </tr>
                    )}
                    {renderRow(item)}
                  </Fragment>
                ))}
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