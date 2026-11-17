"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { tripCovers, tripIdSchema, tripRouteSchema, tripSchema, tripTravelFromForm, type TripActionState, type TripRoute, type TripTravel } from "./model";
import { cleanupTripDocuments } from "./document-storage";
import { COVER_BUCKET, cleanupTripCovers, coverObjectPath, coverPath, coverUpload, validateCoverFile } from "./cover-storage";

export async function saveTrip(_state: TripActionState, form: FormData): Promise<TripActionState> {
  const user = await requireUser();
  const parsed = tripSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const rawId = form.get("id");
  const id = rawId ? tripIdSchema.safeParse(rawId) : null;
  if (id && !id.success) return { error: "El viaje no es válido." };
  let route: TripRoute | null = null;
  const rawRoute = form.get("route");
  if (rawRoute) {
    try { route = tripRouteSchema.parse(JSON.parse(String(rawRoute))); }
    catch { return { error: "Selecciona un lugar válido para el origen y el destino del viaje." }; }
  }
  if (!id && !route) return { error: "Selecciona el origen y el destino del viaje." };
  let travel: TripTravel | null;
  try { travel = tripTravelFromForm(form); }
  catch { return { error: "Selecciona un transporte válido para la ida y la vuelta." }; }
  if (!id && !travel) return { error: "Selecciona cómo viajarás en la ida y en la vuelta." };
  if (process.env.DATABASE_SCHEMA_READY !== "true") return { error: "La base de datos todavía no está activada." };
  const fields = parsed.data;
  const values = {
    name: fields.name,
    description: fields.description || null,
    start_date: fields.start,
    end_date: fields.end,
    status: fields.status,
    currency: fields.currency,
    ...(route ? { route } : {}),
    ...(travel ? { outbound_transport: travel.outbound, return_transport: travel.inbound } : {}),
  };
  let savedId: string;
  let discardUpload: (() => Promise<void>) | undefined;
  try {
    const supabase = await createClient();
    const targetId = id?.success ? id.data : randomUUID();
    let previousCover: string | null = null;
    if (id?.success) {
      const previous = await supabase.from("trips").select("cover_url").eq("id", targetId).eq("owner_id", user.id).single();
      if (previous.error || !previous.data) return { error: "El viaje ya no está disponible. Conservamos tus datos." };
      previousCover = previous.data.cover_url;
    }
    let coverUrl: string | null = fields.image === "custom" ? previousCover : fields.image || null;
    const file = coverUpload(form);
    if (fields.image === "custom") {
      if (file) {
        let photo;
        try { photo = await validateCoverFile(file); }
        catch { return { error: "La foto debe ser un JPEG o PNG válido de hasta 4 MiB." }; }
        const path = coverPath(user.id, targetId, randomUUID(), photo.mime);
        coverUrl = `/api/trip-covers/${path}`;
        const uploadedUrl = coverUrl;
        discardUpload = async () => {
          const current = await supabase.from("trips").select("cover_url").eq("id", targetId).eq("owner_id", user.id).maybeSingle();
          if (!current.error && current.data?.cover_url !== uploadedUrl) await supabase.storage.from(COVER_BUCKET).remove([path]);
        };
        const uploaded = await supabase.storage.from(COVER_BUCKET).upload(path, photo.bytes, { contentType: photo.mime, upsert: false });
        if (uploaded.error) {
          await discardUpload().catch(() => {});
          return { error: /bucket.*not found/i.test(uploaded.error.message)
            ? "Falta aplicar la migración 202611170009_trip_covers.sql en Supabase para subir fotos. Conservamos tus datos."
            : "No se pudo subir la foto. Conservamos tus datos y la portada anterior; inténtalo de nuevo." };
        }
      } else if (!previousCover || tripCovers.some((cover) => cover.value === previousCover)) {
        return { error: "Selecciona una foto JPEG o PNG para la portada." };
      }
    }
    const response = id?.success
      ? await supabase.from("trips").update({ ...values, cover_url: coverUrl }).eq("id", targetId).eq("owner_id", user.id).select("id").single()
      : await supabase.from("trips").insert({ ...values, cover_url: coverUrl, id: targetId, owner_id: user.id }).select("id").single();
    if (response.error || !response.data) {
      await discardUpload?.().catch(() => {});
      if (travel && ["42703", "PGRST204"].includes(response.error?.code || "")) return { error: "Falta aplicar la migración 202611170010_trip_travel.sql en Supabase para guardar el transporte de ida y vuelta. Conservamos tus datos." };
      if (route && ["42703", "PGRST204"].includes(response.error?.code || "")) return { error: "Falta aplicar la migración 202611170008_trip_routes.sql en Supabase para guardar el origen y el destino. Conservamos tus datos." };
      if (response.error?.code === "23514") return { error: "Revisa fechas y moneda: deben ser compatibles con los destinos, reservas, presupuesto y conversiones existentes." };
      return { error: "No se pudo guardar el viaje. Comprueba que sigue disponible e inténtalo de nuevo." };
    }
    savedId = response.data.id;
    discardUpload = undefined;
    const previousPath = coverObjectPath(previousCover);
    if (previousPath?.startsWith(`${user.id}/${targetId}/`) && previousCover !== coverUrl) {
      await supabase.storage.from(COVER_BUCKET).remove([previousPath]).catch(() => {});
    }
  } catch {
    await discardUpload?.().catch(() => {});
    return { error: "No se pudo conectar. Tus cambios no se han confirmado; inténtalo de nuevo." };
  }
  revalidatePath("/", "layout");
  return { success: true, id: savedId };
}

export async function changeTrip(_state: TripActionState, form: FormData): Promise<TripActionState> {
  const user = await requireUser();
  const id = tripIdSchema.safeParse(form.get("id"));
  const operation = form.get("operation");
  if (!id.success || !["archive", "restore", "delete"].includes(String(operation))) {
    return { error: "La operación no es válida." };
  }
  if (operation === "delete" && form.get("confirmation") !== "delete") {
    return { error: "Confirma que quieres eliminar el viaje y todo su contenido." };
  }
  if (process.env.DATABASE_SCHEMA_READY !== "true") return { error: "La base de datos todavía no está activada." };
  try {
    const supabase = await createClient();
    if (operation === "delete") {
      const current = await supabase.from("trips").select("cover_url").eq("id", id.data).eq("owner_id", user.id).single();
      if (current.error || !current.data) return { error: "El viaje ya no está disponible." };
      await cleanupTripDocuments(supabase, id.data);
      await cleanupTripCovers(supabase, user.id, id.data);
    }
    const mutation = operation === "delete"
      ? supabase.from("trips").delete()
      : supabase.from("trips").update({ archived_at: operation === "archive" ? new Date().toISOString() : null });
    const response = await mutation.eq("id", id.data).eq("owner_id", user.id).select("id").single();
    if (response.error || !response.data) return { error: operation === "delete" ? "No se pudo eliminar el viaje. Si quedan documentos, reintenta su limpieza." : "No se pudo completar la operación. El viaje puede no estar disponible." };
  } catch {
    if (operation === "delete") { revalidatePath("/", "layout"); return { error: "La limpieza de documentos o portadas no ha terminado. El viaje se conserva; reintenta eliminarlo para continuar." }; }
    return { error: "No se pudo conectar. Inténtalo de nuevo." };
  }
  revalidatePath("/", "layout");
  return { success: true, id: id.data };
}