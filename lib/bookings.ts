import { supabase } from "./supabase";
import type { Booking, BookingInput, Supplier } from "./types";
import { BOOKING_TYPES, BOOKING_STATUSES, WAREHOUSES } from "./types";

/** All bookings for one day, earliest time first. Blank times sort to the top. */
export async function getBookingsForDate(dateKey: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("booking_date", dateKey)
    .order("booking_time", { ascending: true, nullsFirst: true });

  if (error) throw error;
  return (data ?? []) as Booking[];
}

/** Every booking, most recent date first — used by the Dashboard. */
export async function getAllBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .order("booking_date", { ascending: false })
    .order("booking_time", { ascending: true, nullsFirst: true });

  if (error) throw error;
  return (data ?? []) as Booking[];
}

export async function getSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name")
    .order("name");

  if (error) throw error;
  return (data ?? []) as Supplier[];
}

/** Pulls the next HT/DF pair from the Postgres sequence (see supabase-refs.sql). */
async function nextRefs(): Promise<{ ref: string; df_ref: string }> {
  const { data, error } = await supabase.rpc("next_booking_refs").single();
  if (error) throw error;
  return data as { ref: string; df_ref: string };
}

/** Writes one entry to audit_logs. Never blocks the main action if logging fails. */
async function logAudit(
  action: "insert" | "update" | "delete",
  recordId: string | null,
  changedData: unknown
): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from("audit_logs").insert({
      table_name: "bookings",
      record_id: recordId,
      action,
      user_id: userData?.user?.id ?? null,
      user_email: userData?.user?.email ?? null,
      changed_data: changedData,
    });
  } catch (err) {
    // Logging must never break the actual booking operation
    console.error("Audit log failed:", err);
  }
}

/** Validates booking input before it ever reaches the database. */
function validateBookingInput(input: Partial<BookingInput>): void {
  if (input.booking_date !== undefined) {
    if (!input.booking_date || typeof input.booking_date !== "string") {
      throw new Error("Booking date is required.");
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(input.booking_date)) {
      throw new Error("Booking date must be in YYYY-MM-DD format.");
    }
    const parsedDate = new Date(input.booking_date);
    if (isNaN(parsedDate.getTime())) {
      throw new Error("Booking date is not a valid date.");
    }
  }

  if (input.booking_time) {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
    if (!timeRegex.test(input.booking_time)) {
      throw new Error("Booking time must be in HH:MM format.");
    }
  }

  if (input.supplier !== undefined) {
    if (!input.supplier || typeof input.supplier !== "string" || input.supplier.trim() === "") {
      throw new Error("Supplier is required.");
    }
  }

  if (input.type !== undefined && !BOOKING_TYPES.includes(input.type)) {
    throw new Error(`Type must be one of: ${BOOKING_TYPES.join(", ")}.`);
  }

  if (input.status !== undefined && !BOOKING_STATUSES.includes(input.status)) {
    throw new Error(`Status must be one of: ${BOOKING_STATUSES.join(", ")}.`);
  }

  if (input.warehouse !== undefined && !WAREHOUSES.includes(input.warehouse)) {
    throw new Error(`Warehouse must be one of: ${WAREHOUSES.join(", ")}.`);
  }

  const numericFields: (keyof BookingInput)[] = ["pallets", "skus", "quantity"];
  for (const field of numericFields) {
    const value = (input as any)[field];
    if (value !== undefined && value !== null) {
      if (typeof value !== "number" || isNaN(value)) {
        throw new Error(`${field} must be a valid number.`);
      }
      if (value < 0) {
        throw new Error(`${field} cannot be negative.`);
      }
    }
  }
}

export async function createBooking(input: BookingInput): Promise<Booking> {
  validateBookingInput(input);

  const refs = await nextRefs();
  const { data, error } = await supabase
    .from("bookings")
    .insert({ ...input, ...refs })
    .select()
    .single();

  if (error) throw error;

  await logAudit("insert", data.id, data);

  return data as Booking;
}

export async function updateBooking(
  id: string,
  patch: Partial<BookingInput>,
): Promise<Booking> {
  validateBookingInput(patch);

  const { data, error } = await supabase
    .from("bookings")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  await logAudit("update", id, patch);

  return data as Booking;
}

export async function markDelivered(id: string): Promise<Booking> {
  return updateBooking(id, { status: "Delivered" });
}

export async function deleteBooking(id: string): Promise<void> {
  const { error } = await supabase.from("bookings").delete().eq("id", id);
  if (error) throw error;

  await logAudit("delete", id, null);
}

export async function getBlockedDates(): Promise<string[]> {
  const { data, error } = await supabase
    .from("blocked_dates")
    .select("blocked_date");

  if (error) throw error;
  return (data ?? []).map((d) => d.blocked_date as string);
}