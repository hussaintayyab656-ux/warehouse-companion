"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { useRequireAuth } from "@/lib/useAuth";

type BlockedDate = {
  id: string;
  blocked_date: string;
  reason: string | null;
};

type EventItem = {
  id: string;
  title: string;
  message: string;
  event_date: string;
};

export default function AdminPage() {
  const router = useRouter();
  const { checking, role } = useRequireAuth();
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState("");
  const [newReason, setNewReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventMessage, setNewEventMessage] = useState("");
  const [newEventDate, setNewEventDate] = useState("");
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  // PO Data Upload state
  const [poFile, setPoFile] = useState<File | null>(null);
  const [poUploading, setPoUploading] = useState(false);
  const [poError, setPoError] = useState<string | null>(null);
  const [poResult, setPoResult] = useState<string | null>(null);

  useEffect(() => {
    if (!checking && role !== "admin") {
      router.replace("/");
    }
  }, [checking, role, router]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("blocked_dates")
      .select("id, blocked_date, reason")
      .order("blocked_date", { ascending: true });
    if (!error) setBlockedDates(data ?? []);
    setLoading(false);
  }, []);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    const { data, error } = await supabase
      .from("events")
      .select("id, title, message, event_date")
      .order("event_date", { ascending: true });
    if (!error) setEvents(data ?? []);
    setEventsLoading(false);
  }, []);

  useEffect(() => {
    if (role === "admin") {
      load();
      loadEvents();
    }
  }, [role, load, loadEvents]);

  async function addBlockedDate() {
    if (!newDate) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("blocked_dates")
      .insert({ blocked_date: newDate, reason: newReason || null });
    if (error) {
      setError(error.message);
    } else {
      setNewDate("");
      setNewReason("");
      load();
    }
    setSaving(false);
  }

  async function removeBlockedDate(id: string) {
    if (!confirm("Remove this blocked date?")) return;
    await supabase.from("blocked_dates").delete().eq("id", id);
    load();
  }

  async function addEvent() {
    if (!newEventTitle || !newEventMessage || !newEventDate) return;
    setSavingEvent(true);
    setEventError(null);
    const { error } = await supabase.from("events").insert({
      title: newEventTitle,
      message: newEventMessage,
      event_date: newEventDate,
    });
    if (error) {
      setEventError(error.message);
    } else {
      setNewEventTitle("");
      setNewEventMessage("");
      setNewEventDate("");
      loadEvents();
    }
    setSavingEvent(false);
  }

  async function removeEvent(id: string) {
    if (!confirm("Remove this event/reminder?")) return;
    await supabase.from("events").delete().eq("id", id);
    loadEvents();
  }

  // Helper: find a column value from a row using several possible header names
  function pick(row: Record<string, unknown>, names: string[]): string {
    for (const key of Object.keys(row)) {
      const normalized = key.trim().toLowerCase().replace(/[\s_]/g, "");
      for (const name of names) {
        if (normalized === name) {
          const val = row[key];
          return val === undefined || val === null ? "" : String(val).trim();
        }
      }
    }
    return "";
  }

  async function handlePoUpload() {
    if (!poFile) return;
    setPoUploading(true);
    setPoError(null);
    setPoResult(null);

    try {
      const buffer = await poFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
      });

      if (rawRows.length === 0) {
        setPoError("No rows found in the file.");
        setPoUploading(false);
        return;
      }

      const today = new Date().toISOString().slice(0, 10);

      const rows = rawRows
        .map((r) => {
          const po_number = pick(r, ["ponumber", "po", "ponum", "purchaseorder"]);
          const sku = pick(r, ["sku", "code", "productcode"]);
          const description = pick(r, ["description", "desc", "productdescription"]);
          const quantityStr = pick(r, ["quantity", "qty", "osqty", "o/sqty"]);
          const warehouse = pick(r, ["warehouse", "wh"]);
          const supplier = pick(r, ["supplier", "suppliername", "suppliersreference"]);
          const deliveryDateRaw = pick(r, ["deliverydate", "reqdeldate", "date"]);
          const status = pick(r, ["status", "otif"]) || "Pending";

          const quantity = quantityStr ? Number(quantityStr) : null;

          let delivery_date: string | null = null;
          if (deliveryDateRaw) {
            const d = new Date(deliveryDateRaw);
            if (!isNaN(d.getTime())) {
              delivery_date = d.toISOString().slice(0, 10);
            }
          }

          return {
            po_number,
            sku: sku || null,
            description: description || null,
            quantity: quantity !== null && !isNaN(quantity) ? quantity : null,
            warehouse: warehouse || null,
            supplier: supplier || null,
            delivery_date,
            status,
            upload_batch_date: today,
          };
        })
        .filter((r) => r.po_number);

      if (rows.length === 0) {
        setPoError(
          "Couldn't find a PO number column in this file. Check the file's headers."
        );
        setPoUploading(false);
        return;
      }

      const { error } = await supabase.from("po_data").insert(rows);

      if (error) {
        setPoError(error.message);
      } else {
        setPoResult(`Uploaded ${rows.length} rows for ${today}.`);
        setPoFile(null);
      }
    } catch {
      setPoError("Couldn't read this file. Make sure it's a valid .xlsx or .csv file.");
    }

    setPoUploading(false);
  }

  if (checking || role !== "admin") return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-navy">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-3">
          <p className="text-lg font-bold text-gold">Warehouse Companion</p>
          <Link href="/" className="text-sm text-white hover:text-gold">
            ← Back to Home
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-navy">Admin Panel</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage blocked booking dates, event reminders, and team access.
        </p>

        {/* Blocked Dates Section */}
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">Blocked Dates</h2>
          <p className="mt-1 text-sm text-slate-600">
            Block a date (e.g. stock count day) so no new bookings can be
            added.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Date
              </label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-slate-600">
                Reason (optional)
              </label>
              <input
                type="text"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="e.g. Stock count"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={addBlockedDate}
              disabled={saving || !newDate}
              className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-gold-hover disabled:opacity-50"
            >
              {saving ? "Adding…" : "Block date"}
            </button>
          </div>

          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

          <div className="mt-5 divide-y divide-slate-100">
            {loading ? (
              <p className="py-4 text-sm text-slate-600">Loading…</p>
            ) : blockedDates.length === 0 ? (
              <p className="py-4 text-sm text-slate-600">
                No blocked dates yet.
              </p>
            ) : (
              blockedDates.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-mono text-sm text-slate-900">
                      {b.blocked_date}
                    </p>
                    {b.reason && (
                      <p className="text-xs text-slate-600">{b.reason}</p>
                    )}
                  </div>
                  <button
                    onClick={() => removeBlockedDate(b.id)}
                    className="rounded-md border border-red-300 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Events & Reminders Section */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">
            Events & Reminders
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Add a reminder (e.g. &quot;Bond Stock Count&quot;) for a specific
            date. It will show as a banner on the home page and bookings
            page.
          </p>

          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Date
                </label>
                <input
                  type="date"
                  value={newEventDate}
                  onChange={(e) => setNewEventDate(e.target.value)}
                  className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-slate-600">
                  Title
                </label>
                <input
                  type="text"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  placeholder="e.g. Bond Stock Count"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Message
              </label>
              <input
                type="text"
                value={newEventMessage}
                onChange={(e) => setNewEventMessage(e.target.value)}
                placeholder="e.g. Bond Stock Count is happening today, be ready."
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={addEvent}
              disabled={
                savingEvent || !newEventDate || !newEventTitle || !newEventMessage
              }
              className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-gold-hover disabled:opacity-50"
            >
              {savingEvent ? "Adding…" : "Add reminder"}
            </button>
          </div>

          {eventError && (
            <p className="mt-2 text-sm text-red-700">{eventError}</p>
          )}

          <div className="mt-5 divide-y divide-slate-100">
            {eventsLoading ? (
              <p className="py-4 text-sm text-slate-600">Loading…</p>
            ) : events.length === 0 ? (
              <p className="py-4 text-sm text-slate-600">
                No reminders yet.
              </p>
            ) : (
              events.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-mono text-sm text-slate-900">
                      {ev.event_date} — {ev.title}
                    </p>
                    <p className="text-xs text-slate-600">{ev.message}</p>
                  </div>
                  <button
                    onClick={() => removeEvent(ev.id)}
                    className="rounded-md border border-red-300 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* PO Data Upload Section */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">PO Data Upload</h2>
          <p className="mt-1 text-sm text-slate-600">
            Upload the PO file from TRS whenever a new one arrives (.xlsx or
            .csv). Each upload is saved as a new snapshot — old data is
            kept, not overwritten, so you can see history for a PO over
            time.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setPoFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <button
              onClick={handlePoUpload}
              disabled={poUploading || !poFile}
              className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-gold-hover disabled:opacity-50"
            >
              {poUploading ? "Uploading…" : "Upload"}
            </button>
          </div>

          {poError && <p className="mt-2 text-sm text-red-700">{poError}</p>}
          {poResult && (
            <p className="mt-2 text-sm text-green-700">{poResult}</p>
          )}
        </div>

        {/* Team Members Section */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">Team Members</h2>
          <p className="mt-1 text-sm text-slate-600">
            New logins are currently created from the Supabase dashboard
            (Authentication → Users), then approved in the{" "}
            <span className="font-mono">profiles</span> table. A full
            in-app &quot;Add user&quot; button is planned for a future
            update.
          </p>
        </div>
      </div>
    </div>
  );
}