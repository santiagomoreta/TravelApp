import { z } from "zod";
import { activitySchema, destinationSchema } from "./content-model.ts";
import type { Database } from "../../lib/supabase/database.types";

export const transportTypes = { plane: "Avión", train: "Tren", bus: "Autobús", car: "Coche", boat: "Barco", taxi: "Taxi", other: "Otro" } as const;
export const accommodationTypes = { hotel: "Hotel", apartment: "Apartamento", hostel: "Hostal", camping: "Camping", guesthouse: "Casa de huéspedes", other: "Otro" } as const;
const destinationId = z.union([z.literal(""), z.uuid()]);
const title = z.string().trim().min(1, "Completa el nombre o lugar.").max(160);
const fields = {
  destination_id: destinationId,
  amount: z.string().trim().transform((value) => value.replace(",", ".")).refine((value) => !value || /^(0|[1-9]\d{0,13})(\.\d{1,6})?$/.test(value), "Usa un importe positivo o cero, con hasta 14 enteros y 6 decimales."),
  currency: z.string().trim().toUpperCase().regex(/^([A-Z]{3})?$/, "Usa tres letras para la moneda.").default(""),
  booking_reference: z.string().trim().max(160),
  notes: z.string().trim().max(4000),
};
function pricePair(value: { amount: string; currency: string }) { return Boolean(value.amount) === Boolean(value.currency); }
const priceError = { message: "Completa importe y moneda, o deja ambos vacíos.", path: ["amount"] };

export const transportSchema = z.object({
  ...fields,
  origin_destination_id: destinationId,
  type: z.enum(["plane", "train", "bus", "car", "boat", "taxi", "other"]),
  origin_label: title,
  destination_label: title,
  departs_local: activitySchema.shape.starts_local,
  arrives_local: activitySchema.shape.starts_local,
  departure_time_zone: destinationSchema.shape.time_zone,
  arrival_time_zone: destinationSchema.shape.time_zone,
  company: z.string().trim().max(160),
  ticket_number: z.string().trim().max(160),
}).refine(pricePair, priceError).refine((value) => !value.arrives_local || Boolean(value.departs_local), {
  message: "La llegada requiere un horario de salida.", path: ["arrives_local"],
}).refine((value) => (!value.departs_local || Boolean(value.departure_time_zone)) && (!value.arrives_local || Boolean(value.arrival_time_zone)), {
  message: "Cada horario requiere su zona horaria.", path: ["departure_time_zone"],
});

export const accommodationSchema = z.object({
  ...fields,
  name: title,
  type: z.enum(["hotel", "apartment", "hostel", "camping", "guesthouse", "other"]),
  address: z.string().trim().max(4000),
  latitude: destinationSchema.shape.latitude,
  longitude: destinationSchema.shape.longitude,
  check_in: z.iso.date(),
  check_out: z.iso.date(),
  time_zone: destinationSchema.shape.time_zone,
  phone: z.string().trim().max(50),
  url: z.string().trim().max(2048).refine((value) => {
    if (!value) return true;
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
    catch { return false; }
  }, "Usa una dirección HTTPS sin credenciales."),
}).refine(pricePair, priceError).refine((value) => value.check_out > value.check_in, {
  message: "El alojamiento debe incluir al menos una noche.", path: ["check_out"],
}).refine((value) => Boolean(value.latitude) === Boolean(value.longitude), {
  message: "Completa las dos coordenadas o deja ambas vacías.", path: ["longitude"],
});

type TransportRow = Database["public"]["Tables"]["transports"]["Row"];
type AccommodationRow = Database["public"]["Tables"]["accommodations"]["Row"];
export type Transport = Omit<TransportRow, "trip_id" | "created_at" | "updated_at" | "amount"> & { amount: string | null };
export type Accommodation = Omit<AccommodationRow, "trip_id" | "created_at" | "updated_at" | "amount"> & { amount: string | null };
export type TripBookings = { transports: Transport[]; accommodations: Accommodation[] };

export function priceLabel(amount: string | null, currency: string | null) {
  if (amount === null || !currency) return "Sin precio";
  const [whole, fraction = ""] = amount.split(".");
  const decimals = fraction.replace(/0+$/, "");
  return `${BigInt(whole).toLocaleString("es-ES")}${decimals ? `,${decimals}` : ""} ${currency}`;
}

export function bookingTimeline(bookings: TripBookings) {
  return [
    ...bookings.transports.map((record) => ({ kind: "transport" as const, record, day: record.departs_at && record.departure_time_zone ? new Intl.DateTimeFormat("en-CA", { timeZone: record.departure_time_zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(record.departs_at)) : null })),
    ...bookings.accommodations.map((record) => ({ kind: "accommodation" as const, record, day: record.check_in })),
  ].sort((first, second) => (first.day || "9999").localeCompare(second.day || "9999") || (first.kind === "transport" && second.kind === "transport" ? (first.record.departs_at || "").localeCompare(second.record.departs_at || "") : first.kind.localeCompare(second.kind)) || first.record.id.localeCompare(second.record.id));
}