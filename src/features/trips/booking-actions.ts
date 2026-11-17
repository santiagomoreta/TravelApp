"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { tripIdSchema, type TripActionState } from "./model";
import { accommodationSchema, transportSchema } from "./booking-model";
import { rangeFits } from "./content-model";

function failure(code?: string): TripActionState {
  if (code === "PGRST202" || code === "42883") return { error: "Falta aplicar la migración 202611160004_bookings.sql en Supabase." };
  if (["23514", "23503", "22007", "22008", "22003"].includes(code || "")) return { error: "Revisa destinos, fechas, zonas e importe. La llegada debe ser posterior a la salida real; las horas omitidas por el cambio horario no son válidas." };
  return { error: "No se pudo guardar el cambio. Comprueba que la reserva sigue disponible e inténtalo de nuevo." };
}

async function ownedTrip(form: FormData) {
  const user = await requireUser();
  const id = tripIdSchema.safeParse(form.get("trip_id"));
  if (!id.success) return { error: "El viaje no es válido." };
  if (process.env.DATABASE_SCHEMA_READY !== "true") return { error: "La base de datos no está activada." };
  const supabase = await createClient();
  const trip = await supabase.from("trips").select("id,start_date,end_date").eq("id", id.data).eq("owner_id", user.id).single();
  if (trip.error || !trip.data) return { error: "El viaje no está disponible en esta cuenta." };
  return { supabase, trip: trip.data };
}

export async function saveBooking(_state: TripActionState, form: FormData): Promise<TripActionState> {
  const context = await ownedTrip(form);
  if (context.error) return { error: context.error };
  const kind = form.get("kind");
  if (kind !== "transport" && kind !== "accommodation") return { error: "El tipo de reserva no es válido." };
  const rawId = form.get("id");
  const id = rawId ? tripIdSchema.safeParse(rawId) : null;
  if (id && !id.success) return { error: "El identificador no es válido." };
  const values = Object.fromEntries(form);
  const parsed = kind === "transport" ? transportSchema.safeParse(values) : accommodationSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if ("check_in" in parsed.data && !rangeFits(parsed.data.check_in, parsed.data.check_out, context.trip!.start_date, context.trip!.end_date)) return { error: "El alojamiento debe estar dentro de las fechas del viaje." };
  try {
    const result = await context.supabase!.rpc("save_trip_booking", { p_trip_id: context.trip!.id, p_booking_id: id?.success ? id.data : null, p_kind: kind, p_values: parsed.data });
    if (result.error || !result.data) return failure(result.error?.code);
  } catch { return { error: "No se pudo conectar. Tus campos se conservan para reintentar." }; }
  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteBooking(_state: TripActionState, form: FormData): Promise<TripActionState> {
  const context = await ownedTrip(form);
  if (context.error) return { error: context.error };
  const kind = form.get("kind");
  const id = tripIdSchema.safeParse(form.get("id"));
  if (!id.success || (kind !== "transport" && kind !== "accommodation") || form.get("confirmation") !== "delete") return { error: "Confirma la eliminación de una reserva válida." };
  try {
    const result = await context.supabase!.from(kind === "transport" ? "transports" : "accommodations").delete().eq("trip_id", context.trip!.id).eq("id", id.data).select("id").single();
    if (result.error) return failure(result.error.code);
  } catch { return { error: "No se pudo conectar. Inténtalo de nuevo." }; }
  revalidatePath("/", "layout");
  return { success: true };
}