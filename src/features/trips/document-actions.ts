"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import { tripIdSchema, type TripActionState } from "./model";
import { DOCUMENT_BUCKET, documentPath, documentSchema } from "./document-model";
import { cleanupDocument, documentAccessUrl, DocumentStorageError, validateDocumentFile } from "./document-storage";

export type DocumentActionState = TripActionState & { url?: string };

function failure(error: unknown): DocumentActionState {
  if (error instanceof DocumentStorageError && ["PGRST202", "42883", "42703", "PGRST204"].includes(error.code || "")) return { error: "Falta aplicar la migración 202611160006_documents.sql en Supabase." };
  return { error: "No se pudo completar la operación. Tus campos se conservan; puedes reintentar la subida o la limpieza pendiente." };
}

async function ownedTrip(form: FormData) {
  const user = await requireUser();
  const id = tripIdSchema.safeParse(form.get("trip_id"));
  if (!id.success || process.env.DATABASE_SCHEMA_READY !== "true") return { error: "El viaje no está disponible." };
  const supabase = await createClient();
  const trip = await supabase.from("trips").select("id").eq("id", id.data).eq("owner_id", user.id).single();
  if (trip.error || !trip.data) return { error: "El viaje no está disponible en esta cuenta." };
  return { user, supabase, tripId: id.data };
}

export async function uploadDocument(_state: DocumentActionState, form: FormData): Promise<DocumentActionState> {
  const context = await ownedTrip(form);
  if (context.error) return { error: context.error };
  const parsed = documentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "Selecciona un archivo PDF, JPEG o PNG." };
  let content;
  try { content = await validateDocumentFile(file); }
  catch (error) { return { error: error instanceof Error ? error.message : "Archivo no válido." }; }
  const id = crypto.randomUUID();
  try {
    const reserved = await context.supabase!.rpc("manage_trip_document", { p_trip_id: context.tripId!, p_document_id: id, p_operation: "reserve", p_values: { ...parsed.data, mime_type: content.mime, size_bytes: String(content.size) } });
    if (reserved.error) throw new DocumentStorageError(reserved.error.code);
    const path = documentPath(context.user!.id, context.tripId!, id, content.mime);
    const uploaded = await context.supabase!.storage.from(DOCUMENT_BUCKET).upload(path, content.bytes, { contentType: content.mime, upsert: false, cacheControl: "0" });
    if (uploaded.error) throw new DocumentStorageError();
    const finalized = await context.supabase!.rpc("manage_trip_document", { p_trip_id: context.tripId!, p_document_id: id, p_operation: "finalize", p_values: {} });
    if (finalized.error) throw new DocumentStorageError(finalized.error.code);
  } catch (error) {
    try { await cleanupDocument(context.supabase!, context.tripId!, id); }
    catch { revalidatePath("/", "layout"); return { error: "Subida no completada. Queda una limpieza pendiente; elimina el documento para reintentarla." }; }
    revalidatePath("/", "layout");
    return failure(error);
  }
  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateDocument(_state: DocumentActionState, form: FormData): Promise<DocumentActionState> {
  const context = await ownedTrip(form);
  if (context.error) return { error: context.error };
  const id = tripIdSchema.safeParse(form.get("id"));
  const parsed = documentSchema.safeParse(Object.fromEntries(form));
  if (!id.success || !parsed.success) return { error: "Revisa el documento, nombre y categoría." };
  try {
    const result = await context.supabase!.from("documents").update(parsed.data).eq("trip_id", context.tripId!).eq("id", id.data).eq("storage_status", "ready").select("id").single();
    if (result.error) throw new DocumentStorageError(result.error.code);
  } catch (error) { return failure(error); }
  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteDocument(_state: DocumentActionState, form: FormData): Promise<DocumentActionState> {
  const context = await ownedTrip(form);
  if (context.error) return { error: context.error };
  const id = tripIdSchema.safeParse(form.get("id"));
  if (!id.success || form.get("confirmation") !== "delete") return { error: "Confirma la eliminación de un documento válido." };
  try { await cleanupDocument(context.supabase!, context.tripId!, id.data); }
  catch (error) { revalidatePath("/", "layout"); return failure(error); }
  revalidatePath("/", "layout");
  return { success: true };
}

async function accessDocument(form: FormData, mode: "preview" | "download"): Promise<DocumentActionState> {
  const context = await ownedTrip(form);
  if (context.error) return { error: context.error };
  const id = tripIdSchema.safeParse(form.get("id"));
  if (!id.success) return { error: "El documento no es válido." };
  try {
    const url = await documentAccessUrl(context.supabase!, context.tripId!, id.data, mode);
    return { success: true, url };
  } catch (error) { return failure(error); }
}

export async function downloadDocument(_state: DocumentActionState, form: FormData): Promise<DocumentActionState> {
  return accessDocument(form, "download");
}

export async function previewDocument(_state: DocumentActionState, form: FormData): Promise<DocumentActionState> {
  return accessDocument(form, "preview");
}