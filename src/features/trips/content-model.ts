import { z } from "zod";
import type { Database } from "../../lib/supabase/database.types";
import type { TripBookings } from "./booking-model";
import type { TripFinance } from "./expense-model";
import type { TripDocument } from "./document-model";

const timeZone = z.string().trim().max(100).refine((value) => {
  if (!value) return true;
  try { new Intl.DateTimeFormat("es", { timeZone: value }); return true; }
  catch { return false; }
}, "Selecciona una zona horaria válida, como Europe/Madrid.");

function coordinate(limit: number) {
  return z.string().trim().refine((value) => !value || (/^-?\d+(\.\d{1,6})?$/.test(value) && Math.abs(Number(value)) <= limit), "Coordenada no válida (máximo seis decimales).");
}

export const destinationSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre del destino.").max(160),
  description: z.string().trim().max(10000),
  region: z.string().trim().max(160),
  country_code: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/, "Usa dos letras para el país, como ES."),
  arrival_date: z.iso.date(),
  departure_date: z.iso.date(),
  time_zone: timeZone,
  latitude: coordinate(90),
  longitude: coordinate(180),
}).refine((value) => value.departure_date >= value.arrival_date, {
  message: "La salida del destino no puede ser anterior a la llegada.", path: ["departure_date"],
}).refine((value) => Boolean(value.latitude) === Boolean(value.longitude), {
  message: "Completa las dos coordenadas o deja ambas vacías.", path: ["longitude"],
});

export const activityCategories = {
  sightseeing: "Visita", restaurant: "Restaurante", transport: "Desplazamiento",
  accommodation: "Alojamiento", activity: "Actividad", excursion: "Excursión",
  free_time: "Tiempo libre", other: "Otro",
} as const;

const localDateTime = z.union([z.literal(""), z.iso.datetime({ local: true, precision: -1 }).refine((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))]);

export const activitySchema = z.object({
  destination_id: z.union([z.uuid(), z.literal(""), z.null()]).default(null).transform((value) => value || null),
  title: z.string().trim().min(1, "Escribe el título de la actividad.").max(160),
  description: z.string().trim().max(10000),
  local_date: z.iso.date(),
  starts_local: localDateTime,
  ends_local: localDateTime,
  time_zone: timeZone,
  category: z.enum(["sightseeing", "restaurant", "transport", "accommodation", "activity", "excursion", "free_time", "other"]),
  location: z.string().trim().max(160),
  latitude: coordinate(90).default(""),
  longitude: coordinate(180).default(""),
  notes: z.string().trim().max(4000),
}).refine((value) => !value.starts_local || (Boolean(value.time_zone) && value.starts_local.slice(0, 10) === value.local_date), {
  message: "El inicio debe coincidir con el día de la actividad y tener zona horaria.", path: ["starts_local"],
}).refine((value) => !value.ends_local || (Boolean(value.starts_local) && value.ends_local >= value.starts_local), {
  message: "El fin debe ser posterior o igual al inicio.", path: ["ends_local"],
}).refine((value) => Boolean(value.latitude) === Boolean(value.longitude), {
  message: "Completa las dos coordenadas o deja ambas vacías.", path: ["longitude"],
});

export type DestinationInput = z.infer<typeof destinationSchema>;
export type ActivityInput = z.infer<typeof activitySchema>;
type DestinationRow = Database["public"]["Tables"]["destinations"]["Row"];
type ActivityRow = Database["public"]["Tables"]["itinerary_items"]["Row"];
export type Destination = Pick<DestinationRow, "id" | "name" | "description" | "region" | "country_code" | "arrival_date" | "departure_date" | "time_zone" | "latitude" | "longitude" | "position">;
export type Activity = Pick<ActivityRow, "id" | "destination_id" | "title" | "description" | "local_date" | "starts_at" | "ends_at" | "time_zone" | "category" | "location" | "latitude" | "longitude" | "notes" | "position">;
export type TripContent = { destinations: Destination[]; activities: Activity[]; bookings: TripBookings; finance: TripFinance; documents: { items: TripDocument[]; available: boolean } };

export function rangeFits(start: string, end: string, parentStart: string, parentEnd: string) {
  return start >= parentStart && end <= parentEnd && start <= end;
}

export function itineraryDays(activities: readonly Activity[], from: string, to: string, destinationFilter = "all") {
  const visible = activities.filter((activity) => activity.local_date >= from && activity.local_date <= to && (destinationFilter === "all" || (destinationFilter === "unlinked" ? activity.destination_id === null : activity.destination_id === destinationFilter)))
    .sort((first, second) => first.local_date.localeCompare(second.local_date) || (first.starts_at || "").localeCompare(second.starts_at || "") || first.position - second.position || first.id.localeCompare(second.id));
  const days = new Map<string, Activity[]>();
  for (const activity of visible) {
    const items = days.get(activity.local_date);
    if (items) items.push(activity);
    else days.set(activity.local_date, [activity]);
  }
  return Array.from(days, ([date, items]) => ({ date, activities: items }));
}

export function localDateTimeValue(instant: string | null, zone: string | null) {
  if (!instant || !zone) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}