// app/grv/page.tsx

"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type GrvItem = {
  id: string;
  item_code: string;
  description: string;
  received_qty: number;
  short_qty: number;
  expiry_date: string | null;
  grv_records: {
    grv_batch_no: string;
    po_no: string;
    date_received: string;
    supplier_name: string;
    warehouse: string;
    received_by: string;
  };
};

export default function GrvListPage() {
  const [items, setItems] = useState<GrvItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("grv_items")
      .select(
        `id, item_code, description, received_qty, short_qty, expiry_date,
         grv_records ( grv_batch_no, po_no, date_received, supplier_name, warehouse, received_by )`
      )
      .order("id", { ascending: false })
      .limit(200);

    if (!error && data) setItems(data as any);
    setLoading(false);
  };

  const filtered = items.filter((it) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      it.item_code?.toLowerCase().includes(q) ||
      it.description?.toLowerCase().includes(q) ||
      it.grv_records?.supplier_name?.toLowerCase().includes(q) ||
      it.grv_records?.po_no?.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>GRV records</h1>

      <input
        type="text"
        placeholder="Search item, supplier, PO..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 6,
          border: "1px solid #ccc",
          marginBottom: 16,
        }}
      />

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #333" }}>
              <th style={{ padding: 6 }}>Item</th>
              <th style={{ padding: 6 }}>Description</th>
              <th style={{ padding: 6 }}>Supplier</th>
              <th style={{ padding: 6 }}>Date</th>
              <th style={{ padding: 6 }}>Qty</th>
              <th style={{ padding: 6 }}>Expiry</th>
              <th style={{ padding: 6 }}>Received By</th>
              <th style={{ padding: 6 }}>PO / GRV</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={it.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 6 }}>{it.item_code}</td>
                <td style={{ padding: 6 }}>{it.description}</td>
                <td style={{ padding: 6 }}>{it.grv_records?.supplier_name}</td>
                <td style={{ padding: 6 }}>{it.grv_records?.date_received}</td>
                <td style={{ padding: 6 }}>{it.received_qty}</td>
                <td style={{ padding: 6 }}>{it.expiry_date || "-"}</td>
                <td style={{ padding: 6 }}>{it.grv_records?.received_by || "-"}</td>
                <td style={{ padding: 6, fontSize: 11, color: "#666" }}>
                  {it.grv_records?.po_no} / {it.grv_records?.grv_batch_no}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && filtered.length === 0 && <p>No matching records.</p>}
    </div>
  );
}