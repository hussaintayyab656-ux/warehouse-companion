import { supabase } from "./supabase";
import type { Booking, BookingInput, Supplier } from "./types";

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

export async function createBooking(input: BookingInput): Promise<Booking> {
  const refs = await nextRefs();
  const { data, error } = await supabase
    .from("bookings")
    .insert({ ...input, ...refs })
    .select()
    .single();

  if (error) throw error;
  return data as Booking;
}

export async function updateBooking(
  id: string,
  patch: Partial<BookingInput>,
): Promise<Booking> {
  const { data, error } = await supabase
    .from("bookings")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Booking;
}

export async function markDelivered(id: string): Promise<Booking> {
  return updateBooking(id, { status: "Delivered" });
}

export async function deleteBooking(id: string): Promise<void> {
  const { error } = await supabase.from("bookings").delete().eq("id", id);
  if (error) throw error;
}

export async function getBlockedDates(): Promise<string[]> {
  const { data, error } = await supabase
    .from("blocked_dates")
    .select("blocked_date");

  if (error) throw error;
  return (data ?? []).map((d) => d.blocked_date as string);
}