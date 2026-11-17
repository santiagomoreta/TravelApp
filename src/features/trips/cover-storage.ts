import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import { validateDocumentFile } from "./document-storage.ts";

export const COVER_BUCKET = "trip-covers";
export const MAX_COVER_SIZE = 4 * 1024 * 1024;
const coverPathSchema = z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png)$/);

export function coverUpload(form: FormData) {
  const file = form.get("cover_file");
  return file instanceof File && file.size > 0 ? file : null;
}

export function coverPath(ownerId: string, tripId: string, imageId: string, mime: string) {
  for (const id of [ownerId, tripId, imageId]) z.uuid().parse(id);
  if (!["image/jpeg", "image/png"].includes(mime)) throw new Error("Usa una imagen JPEG o PNG.");
  return `${ownerId}/${tripId}/${imageId}.${mime === "image/jpeg" ? "jpg" : "png"}`;
}

export function coverObjectPath(url: string | null | undefined) {
  if (!url?.startsWith("/api/trip-covers/")) return null;
  const parsed = coverPathSchema.safeParse(url.slice("/api/trip-covers/".length));
  if (!parsed.success) return null;
  const parts = parsed.data.split("/");
  if (!z.uuid().safeParse(parts[0]).success || !z.uuid().safeParse(parts[1]).success || !z.uuid().safeParse(parts[2].slice(0, -4)).success) return null;
  return parsed.data;
}

export async function validateCoverFile(file: File) {
  const result = await validateDocumentFile(file);
  if (!["image/jpeg", "image/png"].includes(result.mime)) throw new Error("Usa una imagen JPEG o PNG de hasta 4 MiB.");
  return result;
}

export async function cleanupTripCovers(supabase: SupabaseClient<Database>, ownerId: string, tripId: string) {
  z.uuid().parse(ownerId);
  z.uuid().parse(tripId);
  const prefix = `${ownerId}/${tripId}`;
  for (let batch = 0; batch < 10; batch++) {
    const listed = await supabase.storage.from(COVER_BUCKET).list(prefix, { limit: 100 });
    if (listed.error) {
      if (/bucket.*not found/i.test(listed.error.message)) return;
      throw new Error("No se pudieron comprobar las portadas privadas.");
    }
    const paths = listed.data.map((file) => `${prefix}/${file.name}`);
    if (!paths.length) return;
    if (paths.some((path) => !coverObjectPath(`/api/trip-covers/${path}`))) throw new Error("La ruta de portada no es válida.");
    const removed = await supabase.storage.from(COVER_BUCKET).remove(paths);
    if (removed.error) throw new Error("No se pudieron limpiar las portadas anteriores.");
  }
  throw new Error("Quedan portadas pendientes de limpieza; vuelve a intentarlo.");
}