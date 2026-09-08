// app/grv/records/[id]/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../../lib/supabase";

type GrvItem = {
  id: string;
  item_code: string;
  description: string;
  received_qty: number;
  expiry_date: string | null;
};

type GrvRecord = {
  grv_batch_no: string;
  po_no: string;
  date_received: string;
  supplier_name: string;
  received_by: string;
};

export default function GrvDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [record, setRecord] = useState<GrvRecord | null>(null);
  const [items, setItems] = useState<GrvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (id) fetchDetail();
  }, [id]);

  const fetchDetail = async () => {
    setLoading(true);

    const { data: recordData } = await supabase
      .from("grv_records")
      .select("grv_batch_no, po_no, date_received, supplier_name, received_by")
      .eq("id", id)
      .single();

    const { data: itemsData } = await supabase
      .from("grv_items")
      .select("id, item_code, description, received_qty, expiry_date")
      .eq("grv_record_id", id);

    setRecord(recordData as any);
    setItems((itemsData as any) ?? []);
    setLoading(false);
  };

  const handleDelete = async () => {
    const confirmed = confirm(
      `Delete this GRV (${record?.po_no} / ${record?.grv_batch_no})? This will remove all ${items.length} item(s) and cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);

    await supabase.from("grv_items").delete().eq("grv_record_id", id);
    await supabase.from("delivery_advice").delete().eq("grv_record_id", id);
    const { error } = await supabase.from("grv_records").delete().eq("id", id);

    setDeleting(false);

    if (error) {
      alert("Could not delete: " + error.message);
      return;
    }

    router.push("/grv/records");
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>
      <Link
        href="/grv/records"
        style={{ fontSize: 13, color: "#666", textDecoration: "none" }}
      >
        ← Back to records
      </Link>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginTop: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>
            {record?.po_no} / {record?.grv_batch_no}
          </h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
            {record?.supplier_name} · {record?.date_received} · Received by{" "}
            {record?.received_by || "-"}
          </p>
        </div>

        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid #c0392b",
            color: "#c0392b",
            background: "white",
            cursor: deleting ? "not-allowed" : "pointer",
            fontSize: 13,
            whiteSpace: "nowrap",
          }}
        >
          {deleting ? "Deleting..." : "Delete GRV"}
        </button>
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
          marginTop: 20,
        }}
      >
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #333" }}>
            <th style={{ padding: 6 }}>Item</th>
            <th style={{ padding: 6 }}>Description</th>
            <th style={{ padding: 6 }}>Qty</th>
            <th style={{ padding: 6 }}>Expiry</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 6 }}>{it.item_code}</td>
              <td style={{ padding: 6 }}>{it.description}</td>
              <td style={{ padding: 6 }}>{it.received_qty}</td>
              <td style={{ padding: 6 }}>{it.expiry_date || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {items.length === 0 && <p style={{ marginTop: 16 }}>No items found.</p>}
    </div>
  );
}