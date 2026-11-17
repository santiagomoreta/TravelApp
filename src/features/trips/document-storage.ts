import { fileTypeFromBuffer } from "file-type";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types";
import { DOCUMENT_BUCKET, MAX_DOCUMENT_SIZE, documentFileSchema, documentPath } from "./document-model.ts";

export class DocumentStorageError extends Error {
  code?: string;
  constructor(code?: string) { super("Document storage operation failed"); this.code = code; }
}

export async function documentAccessUrl(supabase: SupabaseClient<Database>, tripId: string, documentId: string, mode: "preview" | "download") {
  const row = await supabase.from("documents").select("name,bucket_id,object_path,mime_type,uploaded_by").eq("id", documentId).eq("trip_id", tripId).eq("storage_status", "ready").single();
  if (row.error || !row.data || row.data.bucket_id !== DOCUMENT_BUCKET) throw new DocumentStorageError(row.error?.code);
  const mime = documentFileSchema.shape.type.safeParse(row.data.mime_type);
  if (!mime.success || row.data.object_path !== documentPath(row.data.uploaded_by, tripId, documentId, mime.data)) throw new DocumentStorageError();
  const extension = mime.data === "application/pdf" ? "pdf" : mime.data === "image/jpeg" ? "jpg" : "png";
  const name = row.data.name.replace(/[^\p{L}\p{N} ._-]/gu, "_").slice(0, 150);
  const result = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(row.data.object_path, 60, mode === "download" ? { download: `${name}.${extension}` } : undefined);
  if (result.error || !result.data) throw new DocumentStorageError();
  return result.data.signedUrl;
}

export async function validateDocumentFile(file: File) {
  if (file.size < 1 || file.size > MAX_DOCUMENT_SIZE) throw new Error("El archivo debe ocupar entre 1 byte y 4 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let detected;
  try { detected = await fileTypeFromBuffer(bytes); } catch { throw new Error("El archivo no tiene un formato reconocible."); }
  const parsed = documentFileSchema.safeParse({ type: detected?.mime, size: bytes.byteLength });
  if (!parsed.success || (file.type && file.type !== detected?.mime)) throw new Error("El contenido no coincide con un PDF, JPEG o PNG válido.");
  return { bytes, mime: parsed.data.type, size: parsed.data.size };
}

export async function runDocumentCleanup(steps: { beginDelete: () => Promise<void>; deleteObject: () => Promise<void>; finishDelete: () => Promise<void> }) {
  await steps.beginDelete();
  await steps.deleteObject();
  await steps.finishDelete();
}

export async function cleanupDocument(supabase: SupabaseClient<Database>, tripId: string, documentId: string) {
  const row = await supabase.from("documents").select("bucket_id,object_path,uploaded_by").eq("trip_id", tripId).eq("id", documentId).maybeSingle();
  if (row.error) throw new DocumentStorageError(row.error.code);
  if (!row.data) return;
  const parts = row.data.object_path.split("/");
  if (row.data.bucket_id !== DOCUMENT_BUCKET || parts.length !== 4 || parts[0] !== row.data.uploaded_by || parts[1] !== tripId || parts[2] !== documentId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(parts[3])) throw new DocumentStorageError();
  const path = row.data.object_path;
  const manage = async (operation: string) => {
    const result = await supabase.rpc("manage_trip_document", { p_trip_id: tripId, p_document_id: documentId, p_operation: operation, p_values: {} });
    if (result.error) throw new DocumentStorageError(result.error.code);
  };
  await runDocumentCleanup({
    beginDelete: () => manage("begin_delete"),
    deleteObject: async () => { const result = await supabase.storage.from(DOCUMENT_BUCKET).remove([path]); if (result.error) throw new DocumentStorageError(); },
    finishDelete: () => manage("finish_delete"),
  });
}

export async function cleanupTripDocuments(supabase: SupabaseClient<Database>, tripId: string) {
  const rows = await supabase.from("documents").select("id").eq("trip_id", tripId).limit(20);
  if (rows.error) throw new DocumentStorageError(rows.error.code);
  for (const row of rows.data || []) await cleanupDocument(supabase, tripId, row.id);
  const remaining = await supabase.from("documents").select("id").eq("trip_id", tripId).limit(1);
  if (remaining.error || remaining.data?.length) throw new DocumentStorageError("TP_MORE_DOCUMENTS");
}