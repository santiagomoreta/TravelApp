"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { tripIdSchema, type TripActionState } from "./model";
import { activitySchema, destinationSchema, rangeFits } from "./content-model";

function failure(code?: string): TripActionState {
  if (code === "PGRST202" || code === "42883") return { error: "Falta aplicar la migración 202611160003_trip_content.sql en Supabase." };
  if (code === "23514" || code === "22007" || code === "22008") return { error: "Revisa fechas, coordenadas y horarios: deben encajar en el destino y el viaje. Una hora omitida por el cambio de horario no es válida." };
  return { error: "No se pudo guardar el cambio. Comprueba que el contenido sigue disponible e inténtalo de nuevo." };
}

async function ownedTrip(form: FormData) {
  const user = await requireUser();
  const id = tripIdSchema.safeParse(form.get("trip_id"));
  if (!id.success) return { error: "El viaje no es válido." };
  if (process.env.DATABASE_SCHEMA_READY !== "true") return { error: "La base de datos no está activada." };
  const supabase = await createClient();
  const trip = await supabase.from("trips").select("id,start_date,end_date")
    .eq("id", id.data).eq("owner_id", user.id).single();
  if (trip.error || !trip.data) return { error: "El viaje no está disponible en esta cuenta." };
  return { supabase, trip: trip.data };
}

export async function saveContent(_state: TripActionState, form: FormData): Promise<TripActionState> {
  const context = await ownedTrip(form);
  if (context.error) return { error: context.error };
  const rawId = form.get("id");
  const id = rawId ? tripIdSchema.safeParse(rawId) : null;
  if (id && !id.success) return { error: "El identificador no es válido." };
  const kind = form.get("kind");
  try {
    if (kind === "destination") {
      const parsed = destinationSchema.safeParse(Object.fromEntries(form));
      if (!parsed.success) return { error: parsed.error.issues[0].message };
      if (!rangeFits(parsed.data.arrival_date, parsed.data.departure_date, context.trip!.start_date, context.trip!.end_date)) {
        return { error: "Las fechas del destino deben estar dentro del viaje." };
      }
      const result = await context.supabase!.rpc("save_trip_destination", {
        p_trip_id: context.trip!.id, p_destination_id: id?.success ? id.data : null, p_values: parsed.data,
      });
      if (result.error) return failure(result.error.code);
    } else if (kind === "activity") {
      const parsed = activitySchema.safeParse(Object.fromEntries(form));
      if (!parsed.success) return { error: parsed.error.issues[0].message };
      let rangeStart = context.trip!.start_date;
      let rangeEnd = context.trip!.end_date;
      if (parsed.data.destination_id) {
        const destination = await context.supabase!.from("destinations").select("arrival_date,departure_date")
          .eq("trip_id", context.trip!.id).eq("id", parsed.data.destination_id).single();
        if (destination.error || !destination.data) return { error: "Selecciona una parada de este viaje." };
        rangeStart = destination.data.arrival_date;
        rangeEnd = destination.data.departure_date;
      }
      const endDay = parsed.data.ends_local ? parsed.data.ends_local.slice(0, 10) : parsed.data.local_date;
      if (!rangeFits(parsed.data.local_date, endDay, rangeStart, rangeEnd)) {
        return { error: "La actividad debe estar dentro de las fechas del viaje y de su parada, si está vinculada." };
      }
      const args = {
        p_trip_id: context.trip!.id, p_activity_id: id?.success ? id.data : null, p_values: parsed.data,
      };
      let result = await context.supabase!.rpc("save_trip_activity_details", args);
      if (result.error && ["PGRST202", "42883"].includes(result.error.code)) {
        if (!parsed.data.destination_id) return { error: "Falta aplicar la migración 202611170011_trip_activities.sql en Supabase para guardar actividades sin parada. Tus campos se conservan." };
        result = await context.supabase!.rpc("save_trip_activity_location", args);
      }
      if (result.error && ["PGRST202", "42883"].includes(result.error.code)) {
        const missing = { error: "Falta aplicar la migración 202611160007_activity_locations.sql en Supabase para guardar coordenadas de actividades." };
        if (parsed.data.latitude || parsed.data.longitude) return missing;
        if (id?.success) {
          const previous = await context.supabase!.from("itinerary_items").select("latitude,longitude").eq("trip_id", context.trip!.id).eq("id", id.data).single();
          if (previous.error || previous.data.latitude !== null || previous.data.longitude !== null) return missing;
        }
        result = await context.supabase!.rpc("save_trip_activity", args);
      }
      if (result.error) return failure(result.error.code);
    } else return { error: "El tipo de contenido no es válido." };
  } catch {
    return { error: "No se pudo conectar. Tus campos se conservan para reintentar." };
  }
  revalidatePath("/", "layout");
  return { success: true };
}

export async function changeContent(_state: TripActionState, form: FormData): Promise<TripActionState> {
  const context = await ownedTrip(form);
  if (context.error) return { error: context.error };
  const id = tripIdSchema.safeParse(form.get("id"));
  const kind = form.get("kind");
  const operation = form.get("operation");
  if (!id.success || !["destination", "activity"].includes(String(kind))) return { error: "El contenido no es válido." };
  try {
    if (kind === "destination" && (operation === "up" || operation === "down")) {
      const result = await context.supabase!.rpc("move_trip_destination", {
        p_trip_id: context.trip!.id, p_destination_id: id.data, p_direction: operation === "up" ? -1 : 1,
      });
      if (result.error) return failure(result.error.code);
    } else if (operation === "delete" && form.get("confirmation") === "delete") {
      const result = await context.supabase!.from(kind === "destination" ? "destinations" : "itinerary_items")
        .delete().eq("trip_id", context.trip!.id).eq("id", id.data).select("id").single();
      if (result.error) return failure(result.error.code);
    } else return { error: "La operación requiere una confirmación válida." };
  } catch {
    return { error: "No se pudo conectar. Inténtalo de nuevo." };
  }
  revalidatePath("/", "layout");
  return { success: true };
}