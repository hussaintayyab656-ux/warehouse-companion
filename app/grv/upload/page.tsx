// app/grv/upload/page.tsx

"use client";

import { useState } from "react";

type UploadResult = {
  filename: string;
  status: "pending" | "success" | "error";
  message?: string;
};

export default function GrvUploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setResults([]);
    }
  };

  const handleUpload = async () => {
    setUploading(true);
    const newResults: UploadResult[] = files.map((f) => ({
      filename: f.name,
      status: "pending",
    }));
    setResults(newResults);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/grv-extract", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: res.ok ? "success" : "error",
                  message: res.ok
                    ? `Extracted ${data.itemsCount} item(s)`
                    : data.error || "Failed",
                }
              : r
          )
        );
      } catch (err: any) {
        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i ? { ...r, status: "error", message: err.message } : r
          )
        );
      }
    }

    setUploading(false);
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Upload GRV PDFs</h1>

      <input
        type="file"
        accept="application/pdf"
        multiple
        onChange={handleFileSelect}
        style={{ marginBottom: 16 }}
      />

      <div>
        <button
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid #ccc",
            cursor: files.length === 0 || uploading ? "not-allowed" : "pointer",
          }}
        >
          {uploading ? "Processing..." : `Extract ${files.length} file(s)`}
        </button>
      </div>

      {results.length > 0 && (
        <ul style={{ marginTop: 24, listStyle: "none", padding: 0 }}>
          {results.map((r, i) => (
            <li
              key={i}
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid #eee",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{r.filename}</span>
              <span
                style={{
                  color:
                    r.status === "success"
                      ? "green"
                      : r.status === "error"
                      ? "crimson"
                      : "#888",
                }}
              >
                {r.status === "pending" ? "Processing..." : r.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}