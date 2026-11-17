"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { tripIdSchema, type TripActionState } from "./model";
import { budgetSchema, expenseSchema } from "./expense-model";

function failure(code?: string): TripActionState {
  if (code === "PGRST202" || code === "42883") return { error: "Falta aplicar la migración 202611160005_finance.sql en Supabase." };
  if (["23514", "23503", "22003", "22007", "22008"].includes(code || "")) return { error: "Revisa destino, importes, tasa y fechas. La conversión debe caber en 14 enteros y 6 decimales. Si cambió la moneda del viaje, recarga antes de guardar." };
  return { error: "No se pudo guardar el cambio. Comprueba que el gasto sigue disponible e inténtalo de nuevo." };
}

async function ownedTrip(form: FormData) {
  const user = await requireUser();
  const id = tripIdSchema.safeParse(form.get("trip_id"));
  if (!id.success) return { error: "El viaje no es válido." };
  if (process.env.DATABASE_SCHEMA_READY !== "true") return { error: "La base de datos no está activada." };
  const supabase = await createClient();
  const trip = await supabase.from("trips").select("id,currency").eq("id", id.data).eq("owner_id", user.id).single();
  if (trip.error || !trip.data) return { error: "El viaje no está disponible en esta cuenta." };
  return { supabase, trip: trip.data };
}

export async function saveFinance(_state: TripActionState, form: FormData): Promise<TripActionState> {
  const context = await ownedTrip(form);
  if (context.error) return { error: context.error };
  const kind = form.get("kind");
  if (kind !== "budget" && kind !== "expense") return { error: "La operación no es válida." };
  const rawId = form.get("id");
  const id = rawId ? tripIdSchema.safeParse(rawId) : null;
  if ((id && !id.success) || (kind === "budget" && rawId)) return { error: "El identificador no es válido." };
  if (form.get("expected_currency") !== context.trip!.currency) return { error: "La moneda del viaje ha cambiado. Recarga antes de guardar." };
  const values = Object.fromEntries(form);
  const parsed = kind === "budget" ? budgetSchema.safeParse(values) : expenseSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if ("exchange_rate" in parsed.data && parsed.data.exchange_rate && parsed.data.currency === context.trip!.currency) return { error: "Un gasto en la moneda del viaje no necesita conversión." };
  try {
    const result = await context.supabase!.rpc("save_trip_finance", { p_trip_id: context.trip!.id, p_expense_id: id?.success ? id.data : null, p_kind: kind, p_values: { ...parsed.data, expected_currency: context.trip!.currency } });
    if (result.error || !result.data) return failure(result.error?.code);
  } catch { return { error: "No se pudo conectar. Tus campos se conservan para reintentar." }; }
  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteExpense(_state: TripActionState, form: FormData): Promise<TripActionState> {
  const context = await ownedTrip(form);
  if (context.error) return { error: context.error };
  const id = tripIdSchema.safeParse(form.get("id"));
  if (!id.success || form.get("confirmation") !== "delete") return { error: "Confirma la eliminación de un gasto válido." };
  try {
    const result = await context.supabase!.from("expenses").delete().eq("trip_id", context.trip!.id).eq("id", id.data).select("id").single();
    if (result.error) return failure(result.error.code);
  } catch { return { error: "No se pudo conectar. Inténtalo de nuevo." }; }
  revalidatePath("/", "layout");
  return { success: true };
}