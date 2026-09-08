// app/grv/page.tsx

import Link from "next/link";

export default function GrvLandingPage() {
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>GRV</h1>

      <div style={{ display: "grid", gap: 16 }}>
        <Link
          href="/grv/upload"
          style={{
            display: "block",
            padding: "20px",
            border: "1px solid #ddd",
            borderRadius: 8,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 16 }}>GRV Extraction</div>
          <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
            Upload scanned GRV documents for AI extraction
          </div>
        </Link>

        <Link
          href="/grv/records"
          style={{
            display: "block",
            padding: "20px",
            border: "1px solid #ddd",
            borderRadius: 8,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 16 }}>GRV Records</div>
          <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
            Search, view and manage all digitized GRV records
          </div>
        </Link>
      </div>
    </div>
  );
}