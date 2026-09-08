// app/grv/records/[id]/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  const id = params.id as string;

  const [record, setRecord] = useState<GrvRecord | null>(null);
  const [items, setItems] = useState<GrvItem[]>([]);
  const [loading, setLoading] = useState(true);

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

      <h1 style={{ fontSize: 20, fontWeight: 600, marginTop: 12 }}>
        {record?.po_no} / {record?.grv_batch_no}
      </h1>
      <p style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
        {record?.supplier_name} · {record?.date_received} · Received by{" "}
        {record?.received_by || "-"}
      </p>

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