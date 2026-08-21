"use client";

import { useEffect, useState } from "react";
import { createBooking, getBlockedDates, updateBooking } from "@/lib/bookings";
import {
  BOOKING_STATUSES,
  BOOKING_TYPES,
  WAREHOUSES,
  isShortNotice,
  toTimeInput,
  type Booking,
  type BookingStatus,
  type BookingType,
  type Supplier,
  type Warehouse,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  suppliers: Supplier[];
  defaultDate: string;
  booking?: Booking | null;
  userEmail: string | null;
}

const label = "block text-xs font-medium uppercase tracking-wide text-slate-700";
const field =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900";

export default function BookingForm({
  open,
  onClose,
  onSaved,
  suppliers,
  defaultDate,
  booking,
  userEmail,
}: Props) {
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [supplier, setSupplier] = useState("");
  const [po, setPo] = useState("");
  const [warehouse, setWarehouse] = useState<Warehouse>("DOCO");
  const [type, setType] = useState<BookingType>("Delivery");
  const [status, setStatus] = useState<BookingStatus>("Pending");
  const [pallets, setPallets] = useState("");
  const [skus, setSkus] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (booking) {
      setDate(booking.booking_date);
      setTime(toTimeInput(booking.booking_time));
      setSupplier(booking.supplier);
      setPo(booking.po_number ?? "");
      setWarehouse(booking.warehouse);
      setType(booking.type);
      setStatus(booking.status);
      setPallets(booking.pallets?.toString() ?? "");
      setSkus(booking.skus?.toString() ?? "");
      setQuantity(booking.quantity?.toString() ?? "");
      setNotes(booking.notes ?? "");
    } else {
      setDate(defaultDate);
      setTime("");
      setSupplier("");
      setPo("");
      setWarehouse("DOCO");
      setType("Delivery");
      setStatus("Pending");
      setPallets("");
      setSkus("");
      setQuantity("");
      setNotes("");
    }
  }, [open, booking, defaultDate]);

  useEffect(() => {
    if (!open) return;
    getBlockedDates()
      .then(setBlockedDates)
      .catch(() => setBlockedDates([]));
  }, [open]);

  if (!open) return null;

  const shortNotice = isShortNotice(date, time || null);
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const isBlocked = blockedDates.includes(date);

  async function save() {
    if (!supplier.trim()) {
      setError("Pick a supplier before saving.");
      return;
    }
    if (isBlocked) {
      setError("This date is blocked for bookings. Choose another date.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        booking_date: date,
        booking_time: time || null,
        supplier: supplier.trim(),
        po_number: po.trim() || null,
        warehouse,
        type,
        status,
        pallets: num(pallets),
        skus: num(skus),
        quantity: num(quantity),
        notes: notes.trim() || null,
        short_notice: shortNotice,
        created_by: booking?.created_by ?? userEmail,
      };

      if (booking) await updateBooking(booking.id, payload);
      else await createBooking(payload);

      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the booking.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:max-w-2xl sm:rounded-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {booking ? "Edit booking" : "New booking"}
            </h2>
            {booking && (
              <p className="font-mono text-xs text-slate-700">
                {booking.ref} · {booking.df_ref}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2">
          <div>
            <label className={label}>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={field}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={label}>Supplier</label>
            <input
              list="supplier-options"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Start typing a supplier name"
              className={field}
            />
            <datalist id="supplier-options">
              {suppliers.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </div>

          <div>
            <label className={label}>PO number</label>
            <input
              value={po}
              onChange={(e) => setPo(e.target.value.toUpperCase())}
              placeholder="UK00028785"
              className={`${field} font-mono`}
            />
          </div>
          <div>
            <label className={label}>Warehouse</label>
            <select
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value as Warehouse)}
              className={field}
            >
              {WAREHOUSES.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={label}>Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as BookingType)}
              className={field}
            >
              {BOOKING_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BookingStatus)}
              className={field}
            >
              {BOOKING_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={label}>Pallets</label>
            <input
              type="number"
              min="0"
              value={pallets}
              onChange={(e) => setPallets(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={label}>SKUs</label>
            <input
              type="number"
              min="0"
              value={skus}
              onChange={(e) => setSkus(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className={label}>Quantity</label>
            <input
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={field}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={label}>Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="8 boxes only"
              className={field}
            />
          </div>

          {isBlocked && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2">
              This date is blocked for bookings. Please choose a different date.
            </div>
          )}

          {shortNotice && !isBlocked && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:col-span-2">
              Less than 72 hours away. This will be saved as short notice.
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2">
              {error}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || isBlocked}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : booking ? "Save changes" : "Create booking"}
          </button>
        </div>
      </div>
    </div>
  );
}