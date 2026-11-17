import "server-only";

import { cache } from "react";
import { requireUser } from "@/features/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Trip } from "./model";
import { tripIdSchema, tripRouteSchema, tripTravelSchema } from "./model";
import type { TripContent } from "./content-model";

export const getTrips = cache(async (): Promise<Trip[]> => {
  const user = await requireUser();
  if (process.env.DATABASE_SCHEMA_READY !== "true") {
    throw new Error("La base de datos de viajes todavía no está activada.");
  }
  const supabase = await createClient();
  const [trips, destinations, routes, travel] = await Promise.all([
    supabase.from("trips")
      .select("id,name,description,start_date,end_date,cover_url,status,currency,archived_at")
      .eq("owner_id", user.id).order("start_date").order("id"),
    supabase.from("destinations").select("trip_id,name,position").order("position"),
    supabase.from("trips").select("id,route").eq("owner_id", user.id),
    supabase.from("trips").select("id,outbound_transport,return_transport").eq("owner_id", user.id),
  ]);
  if (travel.error && !["42703", "PGRST204"].includes(travel.error.code)) throw new Error("No se pudo cargar el transporte de tus viajes. Inténtalo de nuevo.");
  if (routes.error && !["42703", "PGRST204"].includes(routes.error.code)) throw new Error("No se pudo cargar la ruta de tus viajes. Inténtalo de nuevo.");
  if (trips.error || destinations.error || !trips.data || !destinations.data) {
    throw new Error("No se pudieron cargar tus viajes. Inténtalo de nuevo.");
  }
  const travelByTrip = new Map(travel.data?.map((row) => [row.id, { outbound: row.outbound_transport, inbound: row.return_transport }]) || []);
  return trips.data.map((trip) => ({
    id: trip.id,
    name: trip.name,
    description: trip.description || "",
    start: trip.start_date,
    end: trip.end_date,
    image: trip.cover_url,
    status: trip.status,
    currency: trip.currency,
    archivedAt: trip.archived_at,
    route: tripRouteSchema.safeParse(routes.data?.find((item) => item.id === trip.id)?.route).data || null,
    travel: tripTravelSchema.safeParse(travelByTrip.get(trip.id)).data || null,
    destinations: destinations.data.filter((destination) => destination.trip_id === trip.id)
      .map((destination) => destination.name),
  }));
});

export const getTripContent = cache(async (id: string): Promise<TripContent | null> => {
  if (!tripIdSchema.safeParse(id).success) return null;
  if (!(await getTrips()).some((trip) => trip.id === id)) return null;
  const supabase = await createClient();
  const [destinations, activities, transports, accommodations, finance, expenses, documents] = await Promise.all([
    supabase.from("destinations")
      .select("id,name,description,region,country_code,arrival_date,departure_date,time_zone,latitude,longitude,position")
      .eq("trip_id", id).order("position").order("id"),
    supabase.from("itinerary_items")
      .select("id,destination_id,title,description,local_date,starts_at,ends_at,time_zone,category,location,latitude,longitude,notes,position")
      .eq("trip_id", id).order("local_date").order("position").order("id"),
    supabase.from("transports")
      .select("id,origin_destination_id,destination_id,type,origin_label,destination_label,departs_at,arrives_at,departure_time_zone,arrival_time_zone,company,booking_reference,ticket_number,amount::text,currency,notes")
      .eq("trip_id", id).order("departs_at", { nullsFirst: false }).order("id"),
    supabase.from("accommodations")
      .select("id,destination_id,name,type,address,latitude,longitude,check_in,check_out,time_zone,amount::text,currency,booking_reference,phone,url,notes")
      .eq("trip_id", id).order("check_in").order("id"),
    supabase.from("trips").select("budget::text").eq("id", id).single(),
    supabase.from("expenses")
      .select("id,destination_id,concept,amount::text,currency,expense_date,category,notes,exchange_rate::text,rate_date,base_currency,converted_amount::text")
      .eq("trip_id", id).order("expense_date", { ascending: false }).order("id"),
    supabase.from("documents").select("id,name,category,mime_type,size_bytes,created_at,storage_status")
      .eq("trip_id", id).order("created_at", { ascending: false }).order("id"),
  ]);
  const documentsUnavailable = ["42703", "PGRST204"].includes(documents.error?.code || "");
  if (documents.error && !documentsUnavailable) throw new Error("No se pudieron cargar los documentos del viaje.");
  if (destinations.error || activities.error || transports.error || accommodations.error || finance.error || expenses.error || !destinations.data || !activities.data || !transports.data || !accommodations.data || !finance.data || !expenses.data) {
    throw new Error("No se pudo cargar el contenido del viaje. Inténtalo de nuevo.");
  }
  return { destinations: destinations.data, activities: activities.data, bookings: { transports: transports.data, accommodations: accommodations.data }, finance: { budget: finance.data.budget, expenses: expenses.data }, documents: { items: documents.data || [], available: !documentsUnavailable } };
});