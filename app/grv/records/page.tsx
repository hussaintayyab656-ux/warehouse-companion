// app/grv/records/page.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

type GrvGroup = {
  record_id: string;
  grv_batch_no: string;
  po_no: string;
  date_received: string;
  supplier_name: string;
  warehouse: string;
  received_by: string;
  item_count: number;
};

export default function GrvListPage() {
  const [groups, setGroups] = useState<GrvGroup[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("grv_items")
      .select(
        `id,
         grv_records ( id, grv_batch_no, po_no, date_received, supplier_name, warehouse, received_by )`
      )
      .order("id", { ascending: false })
      .limit(1000);

    if (!error && data) {
      const map = new Map<string, GrvGroup>();
      (data as any[]).forEach((row) => {
        const r = row.grv_records;
        if (!r) return;
        const key = r.id;
        if (!map.has(key)) {
          map.set(key, {
            record_id: r.id,
            grv_batch_no: r.grv_batch_no,
            po_no: r.po_no,
            date_received: r.date_received,
            supplier_name: r.supplier_name,
            warehouse: r.warehouse,
            received_by: r.received_by,
            item_count: 0,
          });
        }
        map.get(key)!.item_count += 1;
      });

      const list = Array.from(map.values()).sort((a, b) =>
        (b.date_received || "").localeCompare(a.date_received || "")
      );
      setGroups(list);
    }
    setLoading(false);
  };

  const filtered = groups.filter((g) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      g.supplier_name?.toLowerCase().includes(q) ||
      g.po_no?.toLowerCase().includes(q) ||
      g.grv_batch_no?.toLowerCase().includes(q) ||
      g.received_by?.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>GRV records</h1>

      <input
        type="text"
        placeholder="Search supplier, PO, received by..."
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((g) => (
            <div
              key={g.record_id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: "12px 16px",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {g.po_no} / {g.grv_batch_no}
                </div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                  {g.supplier_name} · {g.date_received} · Received by{" "}
                  {g.received_by || "-"} · {g.item_count} item
                  {g.item_count === 1 ? "" : "s"}
                </div>
              </div>
              <Link
                href={`/grv/records/${g.record_id}`}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "1px solid #333",
                  fontSize: 13,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                Open
              </Link>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && <p>No matching records.</p>}
    </div>
  );
}