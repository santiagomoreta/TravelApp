export type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };

type Timestamps = { id: string; created_at: string; updated_at: string };
type TripContent = Timestamps & { trip_id: string };
type Coordinates = { latitude: number | null; longitude: number | null };
type Price = { amount: number | null; currency: string | null };

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required | "converted_amount">>;
  Update: Partial<Omit<Row, "id" | "trip_id" | "owner_id" | "uploaded_by" | "created_at" | "updated_at" | "converted_amount">>;
  Relationships: [];
};

type Profile = Timestamps & { display_name: string; avatar_url: string | null };
type Trip = Timestamps & {
  owner_id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  cover_url: string | null;
  status: "planning" | "upcoming" | "in_progress" | "completed" | "cancelled";
  currency: string;
  budget: number | null;
  archived_at: string | null;
  route: Json | null;
  outbound_transport: "plane" | "train" | "bus" | "car" | "boat" | "taxi" | "other" | null;
  return_transport: "plane" | "train" | "bus" | "car" | "boat" | "taxi" | "other" | null;
};
type Membership = TripContent & { user_id: string; role: "owner" | "editor" | "viewer" };
type Destination = TripContent & Coordinates & {
  name: string;
  country_code: string | null;
  region: string | null;
  arrival_date: string;
  departure_date: string;
  time_zone: string | null;
  image_url: string | null;
  description: string | null;
  position: number;
};
type ItineraryItem = TripContent & Coordinates & {
  destination_id: string | null;
  title: string;
  description: string | null;
  local_date: string;
  starts_at: string | null;
  ends_at: string | null;
  time_zone: string | null;
  location: string | null;
  category: "sightseeing" | "restaurant" | "transport" | "accommodation" | "activity" | "excursion" | "free_time" | "other";
  notes: string | null;
  estimated_amount: number | null;
  currency: string | null;
  position: number;
};
type Transport = TripContent & Price & {
  origin_destination_id: string | null;
  destination_id: string | null;
  type: "plane" | "train" | "bus" | "car" | "boat" | "taxi" | "other";
  origin_label: string;
  destination_label: string;
  departs_at: string | null;
  arrives_at: string | null;
  departure_time_zone: string | null;
  arrival_time_zone: string | null;
  company: string | null;
  booking_reference: string | null;
  ticket_number: string | null;
  notes: string | null;
};
type Accommodation = TripContent & Coordinates & Price & {
  destination_id: string | null;
  name: string;
  type: "hotel" | "apartment" | "hostel" | "camping" | "guesthouse" | "other";
  address: string | null;
  check_in: string;
  check_out: string;
  time_zone: string | null;
  booking_reference: string | null;
  phone: string | null;
  url: string | null;
  notes: string | null;
};
type Expense = TripContent & {
  destination_id: string | null;
  concept: string;
  amount: number;
  currency: string;
  expense_date: string;
  category: "transport" | "accommodation" | "food" | "activities" | "shopping" | "other";
  notes: string | null;
  exchange_rate: number | null;
  rate_date: string | null;
  base_currency: string | null;
  converted_amount: number | null;
};
type Document = TripContent & {
  uploaded_by: string;
  name: string;
  category: "ticket" | "reservation" | "passport" | "insurance" | "other";
  bucket_id: string;
  object_path: string;
  mime_type: string;
  size_bytes: number;
  storage_status: "pending" | "ready" | "deleting";
};
type AuditLog = {
  id: string;
  trip_id: string | null;
  owner_id: string | null;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  summary: Json;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, "id" | "display_name">;
      trips: Table<Trip, "owner_id" | "name" | "start_date" | "end_date" | "currency">;
      trip_members: Table<Membership, "trip_id" | "user_id">;
      destinations: Table<Destination, "trip_id" | "name" | "arrival_date" | "departure_date" | "position">;
      itinerary_items: Table<ItineraryItem, "trip_id" | "title" | "local_date">;
      transports: Table<Transport, "trip_id" | "origin_label" | "destination_label">;
      accommodations: Table<Accommodation, "trip_id" | "name" | "check_in" | "check_out">;
      expenses: Table<Expense, "trip_id" | "concept" | "amount" | "currency" | "expense_date">;
      documents: Table<Document, "trip_id" | "uploaded_by" | "name" | "object_path" | "mime_type" | "size_bytes">;
      audit_logs: Table<AuditLog, "entity_type" | "entity_id" | "action">;
    };
    Views: Record<string, never>;
    Functions: {
      save_trip_destination: { Args: { p_trip_id: string; p_destination_id: string | null; p_values: Json }; Returns: string };
      save_trip_activity_details: { Args: { p_trip_id: string; p_activity_id: string | null; p_values: Json }; Returns: string };
      move_trip_destination: { Args: { p_trip_id: string; p_destination_id: string; p_direction: number }; Returns: undefined };
      save_trip_activity: { Args: { p_trip_id: string; p_activity_id: string | null; p_values: Json }; Returns: string };
      save_trip_activity_location: { Args: { p_trip_id: string; p_activity_id: string | null; p_values: Json }; Returns: string };
      save_trip_booking: { Args: { p_trip_id: string; p_booking_id: string | null; p_kind: string; p_values: Json }; Returns: string };
      save_trip_finance: { Args: { p_trip_id: string; p_expense_id: string | null; p_kind: string; p_values: Json }; Returns: string };
      manage_trip_document: { Args: { p_trip_id: string; p_document_id: string; p_operation: string; p_values: Json }; Returns: string };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};