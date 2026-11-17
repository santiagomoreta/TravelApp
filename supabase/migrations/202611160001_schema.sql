begin;

do $$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'Travel Planner requires PostgreSQL 15 or newer';
  end if;
end;
$$;

create schema travel_private;
revoke all on schema travel_private from public, anon, authenticated;

create domain public.tp_title as text
  check (char_length(btrim(value)) between 1 and 160);
create domain public.tp_description as text check (char_length(value) <= 10000);
create domain public.tp_notes as text check (char_length(value) <= 4000);
create domain public.tp_currency as text check (value ~ '^[A-Z]{3}$');
create domain public.tp_amount as numeric(20,6) check (value >= 0 and value <> 'NaN'::numeric);
create domain public.tp_latitude as numeric(9,6) check (value between -90 and 90);
create domain public.tp_longitude as numeric(9,6) check (value between -180 and 180);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  avatar_url text check (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name public.tp_title not null,
  description public.tp_description,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  cover_url text check (char_length(cover_url) <= 2048 and cover_url ~ '^(https://|/images/)'),
  status text not null default 'planning' check (status in ('planning', 'upcoming', 'in_progress', 'completed', 'cancelled')),
  currency public.tp_currency not null,
  budget public.tp_amount,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, user_id)
);
create unique index trip_members_one_owner on public.trip_members(trip_id) where role = 'owner';

create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name public.tp_title not null,
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  region public.tp_title,
  arrival_date date not null,
  departure_date date not null check (departure_date >= arrival_date),
  latitude public.tp_latitude,
  longitude public.tp_longitude,
  time_zone text,
  image_url text check (char_length(image_url) <= 2048 and image_url ~ '^(https://|/images/)'),
  description public.tp_description,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trip_id),
  unique (trip_id, position) deferrable initially deferred,
  check ((latitude is null) = (longitude is null))
);

create table public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  destination_id uuid not null,
  title public.tp_title not null,
  description public.tp_description,
  local_date date not null,
  starts_at timestamptz,
  ends_at timestamptz,
  time_zone text,
  location public.tp_title,
  latitude public.tp_latitude,
  longitude public.tp_longitude,
  category text not null default 'other' check (category in ('sightseeing', 'restaurant', 'transport', 'accommodation', 'activity', 'excursion', 'free_time', 'other')),
  notes public.tp_notes,
  estimated_amount public.tp_amount,
  currency public.tp_currency,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (destination_id, trip_id) references public.destinations(id, trip_id) on delete cascade,
  check ((latitude is null) = (longitude is null)),
  check ((estimated_amount is null) = (currency is null)),
  check (ends_at is null or (starts_at is not null and ends_at >= starts_at)),
  check (starts_at is null or time_zone is not null)
);

create table public.transports (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  origin_destination_id uuid,
  destination_id uuid,
  type text not null default 'other' check (type in ('plane', 'train', 'bus', 'car', 'boat', 'taxi', 'other')),
  origin_label public.tp_title not null,
  destination_label public.tp_title not null,
  departs_at timestamptz,
  arrives_at timestamptz,
  departure_time_zone text,
  arrival_time_zone text,
  company public.tp_title,
  booking_reference public.tp_title,
  ticket_number public.tp_title,
  amount public.tp_amount,
  currency public.tp_currency,
  notes public.tp_notes,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (origin_destination_id, trip_id) references public.destinations(id, trip_id) on delete set null (origin_destination_id),
  foreign key (destination_id, trip_id) references public.destinations(id, trip_id) on delete set null (destination_id),
  check ((amount is null) = (currency is null)),
  check (arrives_at is null or (departs_at is not null and arrives_at >= departs_at)),
  check (departs_at is null or departure_time_zone is not null),
  check (arrives_at is null or arrival_time_zone is not null)
);

create table public.accommodations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  destination_id uuid,
  name public.tp_title not null,
  type text not null default 'other' check (type in ('hotel', 'apartment', 'hostel', 'camping', 'guesthouse', 'other')),
  address public.tp_notes,
  latitude public.tp_latitude,
  longitude public.tp_longitude,
  check_in date not null,
  check_out date not null check (check_out > check_in),
  time_zone text,
  amount public.tp_amount,
  currency public.tp_currency,
  booking_reference public.tp_title,
  phone text check (char_length(phone) <= 50),
  url text check (char_length(url) <= 2048 and url ~ '^https://'),
  notes public.tp_notes,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (destination_id, trip_id) references public.destinations(id, trip_id) on delete set null (destination_id),
  check ((latitude is null) = (longitude is null)),
  check ((amount is null) = (currency is null))
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  destination_id uuid,
  concept public.tp_title not null,
  amount public.tp_amount not null,
  currency public.tp_currency not null,
  expense_date date not null,
  category text not null default 'other' check (category in ('transport', 'accommodation', 'food', 'activities', 'shopping', 'other')),
  notes public.tp_notes,
  exchange_rate numeric(24,12) check (exchange_rate > 0 and exchange_rate <> 'NaN'::numeric),
  rate_date date,
  base_currency public.tp_currency,
  converted_amount numeric(20,6) generated always as (round(amount * exchange_rate, 6)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (destination_id, trip_id) references public.destinations(id, trip_id) on delete set null (destination_id),
  check ((exchange_rate is null) = (rate_date is null) and (exchange_rate is null) = (base_currency is null))
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  name public.tp_title not null,
  category text not null default 'other' check (category in ('ticket', 'reservation', 'passport', 'insurance', 'other')),
  bucket_id text not null default 'trip-documents' check (bucket_id = 'trip-documents'),
  object_path text not null,
  mime_type text not null check (char_length(mime_type) between 1 and 160),
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, object_path),
  check (object_path ~ ('^' || uploaded_by::text || '/' || trip_id::text || '/' || id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$'))
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object'),
  created_at timestamptz not null default now()
);

create index trips_owner_dates on public.trips(owner_id, start_date) where archived_at is null;
create index trips_owner on public.trips(owner_id);
create index trip_members_user on public.trip_members(user_id);
create index itinerary_trip on public.itinerary_items(trip_id);
create index itinerary_destination_day on public.itinerary_items(destination_id, local_date, position);
create index transports_trip_date on public.transports(trip_id, departs_at);
create index transports_origin on public.transports(origin_destination_id);
create index transports_destination on public.transports(destination_id);
create index accommodations_trip_date on public.accommodations(trip_id, check_in);
create index accommodations_destination on public.accommodations(destination_id);
create index expenses_trip_date on public.expenses(trip_id, expense_date);
create index expenses_destination on public.expenses(destination_id);
create index documents_trip_date on public.documents(trip_id, created_at);
create index documents_uploader on public.documents(uploaded_by);
create index audit_trip_date on public.audit_logs(trip_id, created_at);
create index audit_owner on public.audit_logs(owner_id);
create index audit_actor on public.audit_logs(actor_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles', 'trips', 'trip_members', 'destinations', 'itinerary_items', 'transports', 'accommodations', 'expenses', 'documents', 'audit_logs'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
  end loop;
end;
$$;

commit;