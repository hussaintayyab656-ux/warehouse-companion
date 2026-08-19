export type BookingType = "Delivery" | "Collection" | "Courier";
export type BookingStatus = "Pending" | "Delivered";
export type Warehouse = "DOCO" | "FLTBR";

export interface Booking {
  id: string;
  ref: string;
  df_ref: string | null;
  booking_date: string;
  booking_time: string | null;
  type: BookingType;
  status: BookingStatus;
  supplier: string;
  po_number: string | null;
  warehouse: Warehouse;
  pallets: number | null;
  skus: number | null;
  quantity: number | null;
  short_notice: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export type BookingInput = Omit<
  Booking,
  "id" | "ref" | "df_ref" | "created_at"
>;

export interface Supplier {
  id: string;
  name: string;
}

export const BOOKING_TYPES: BookingType[] = [
  "Delivery",
  "Collection",
  "Courier",
];
export const BOOKING_STATUSES: BookingStatus[] = ["Pending", "Delivered"];
export const WAREHOUSES: Warehouse[] = ["DOCO", "FLTBR"];

/** Local YYYY-MM-DD — never use toISOString(), it shifts the day in BST. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toDateKey(dt);
}

/** "Friday, 22 August 2026" — matches the print header format. */
export function formatLongDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** DB returns "09:30:00"; the time input wants "09:30". Blank prints as 00:00. */
export function toTimeInput(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5);
}

export function displayTime(t: string | null): string {
  return t ? t.slice(0, 5) : "00:00";
}

/** True when the delivery is less than 72 hours away. */
export function isShortNotice(dateKey: string, time: string | null): boolean {
  if (!dateKey) return false;
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  const when = new Date(y, m - 1, d, hh || 0, mm || 0);
  const hours = (when.getTime() - Date.now()) / 36e5;
  return hours < 72;
}