import { z } from "zod";
import { transportSchema } from "./booking-model.ts";

export const tripStatuses = {
  planning: "Planificando",
  upcoming: "Preparado",
  in_progress: "En curso",
  completed: "Completado",
  cancelled: "Cancelado",
} as const;

export const tripCovers = [
  { value: "", label: "Sin portada" },
  { value: "/images/cotopaxi.jpg", label: "Cotopaxi" },
  { value: "/images/dolomites.jpg", label: "Dolomitas" },
] as const;

export const tripIdSchema = z.uuid();

export const tripLocationSchema = z.object({
  name: z.string().trim().min(1).max(160),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const tripRouteSchema = z.object({
  origin: tripLocationSchema,
  destination: tripLocationSchema,
});
export type TripLocation = z.infer<typeof tripLocationSchema>;
export type TripRoute = z.infer<typeof tripRouteSchema>;

export const tripTravelSchema = z.object({
  outbound: transportSchema.shape.type,
  inbound: transportSchema.shape.type,
});
export type TripTravel = z.infer<typeof tripTravelSchema>;

export function tripTravelFromForm(form: FormData) {
  const outbound = form.get("outbound_transport");
  const inbound = form.get("return_transport");
  if ((outbound === null || outbound === "") && (inbound === null || inbound === "")) return null;
  return tripTravelSchema.parse({ outbound, inbound });
}

export const tripSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre del viaje.").max(160),
  description: z.string().trim().max(10000),
  start: z.iso.date("Selecciona una fecha de salida válida."),
  end: z.iso.date("Selecciona una fecha de vuelta válida."),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Escribe una moneda de tres letras, como EUR.").refine((value) => Intl.supportedValuesOf("currency").includes(value), "Selecciona una moneda ISO admitida, como EUR."),
  status: z.enum(["planning", "upcoming", "in_progress", "completed", "cancelled"]),
  image: z.enum(["", "/images/cotopaxi.jpg", "/images/dolomites.jpg", "custom"]),
}).refine((trip) => trip.end >= trip.start, {
  message: "La vuelta no puede ser anterior a la salida.",
  path: ["end"],
});

export type TripInput = z.infer<typeof tripSchema>;
export type Trip = Omit<TripInput, "image"> & {
  id: string;
  image: string | null;
  route?: TripRoute | null;
  travel?: TripTravel | null;
  destinations: string[];
  archivedAt: string | null;
};

export type TripFilter = "upcoming" | "past" | "all" | "archived";
export type TripActionState = { error?: string; success?: boolean; id?: string };

export function filterTrips(trips: Trip[], today: string, filter: TripFilter, query = "") {
  const search = query.trim().toLocaleLowerCase("es");
  return trips.filter((trip) => {
    const matches = `${trip.name} ${trip.destinations.join(" ")} ${trip.route?.origin.name || ""} ${trip.route?.destination.name || ""}`.toLocaleLowerCase("es").includes(search);
    if (!matches) return false;
    if (filter === "archived") return trip.archivedAt !== null;
    if (trip.archivedAt) return false;
    if (filter === "all") return true;
    if (filter === "past") return trip.end < today || trip.status === "completed";
    return trip.end >= today && trip.status !== "cancelled" && trip.status !== "completed";
  }).sort((first, second) => {
    const order = first.start.localeCompare(second.start) || first.id.localeCompare(second.id);
    return filter === "past" ? -order : order;
  });
}