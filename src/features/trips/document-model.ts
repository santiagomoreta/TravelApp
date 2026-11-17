import { z } from "zod";

export const documentCategories = { ticket: "Billete", reservation: "Reserva", passport: "Identidad", insurance: "Seguro", other: "Otro" } as const;
export const documentTypes = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" } as const;
export const MAX_DOCUMENT_SIZE = 4 * 1024 * 1024;
export const DOCUMENT_BUCKET = "trip-documents";
export const documentSchema = z.object({
  name: z.string().trim().min(1, "Completa el nombre del documento.").max(160),
  category: z.enum(["ticket", "reservation", "passport", "insurance", "other"]),
});
export const documentFileSchema = z.object({
  size: z.number().int().min(1, "El archivo está vacío.").max(MAX_DOCUMENT_SIZE, "El archivo supera 4 MiB."),
  type: z.enum(["application/pdf", "image/jpeg", "image/png"], "Usa un archivo PDF, JPEG o PNG."),
});
export type TripDocument = z.infer<typeof documentSchema> & { id: string; mime_type: string; size_bytes: number; created_at: string; storage_status: "pending" | "ready" | "deleting" };

export function documentPath(ownerId: string, tripId: string, documentId: string, mime: string) {
  for (const id of [ownerId, tripId, documentId]) z.uuid().parse(id);
  const type = documentFileSchema.shape.type.parse(mime);
  return `${ownerId}/${tripId}/${documentId}/document.${documentTypes[type]}`;
}

export function documentSizeLabel(size: number) {
  return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KiB` : `${new Intl.NumberFormat("es", { maximumFractionDigits: 1 }).format(size / (1024 * 1024))} MiB`;
}