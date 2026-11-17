begin;

alter table public.itinerary_items alter column destination_id drop not null;

create or replace function public.save_trip_activity(p_trip_id uuid, p_activity_id uuid, p_values jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  saved_id uuid;
  destination uuid := nullif(p_values ->> 'destination_id', '')::uuid;
  zone_name text := nullif(p_values ->> 'time_zone', '');
  local_start timestamp := nullif(p_values ->> 'starts_local', '')::timestamp;
  local_end timestamp := nullif(p_values ->> 'ends_local', '')::timestamp;
  instant_start timestamptz;
  instant_end timestamptz;
begin
  perform id from public.trips where id = p_trip_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Trip unavailable' using errcode = '42501'; end if;
  if destination is not null then
    perform id from public.destinations where id = destination and trip_id = p_trip_id;
    if not found then raise exception 'Destination unavailable' using errcode = '42501'; end if;
  end if;
  if (local_start is not null and zone_name is null) or
    (local_end is not null and local_start is null) then
    raise exception 'Incomplete schedule' using errcode = '23514';
  end if;
  if zone_name is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = zone_name) then
    raise exception 'Unknown time zone' using errcode = '23514';
  end if;
  instant_start := local_start at time zone zone_name;
  instant_end := local_end at time zone zone_name;
  if (instant_start at time zone zone_name) is distinct from local_start
    or (instant_end at time zone zone_name) is distinct from local_end then
    raise exception 'Local time does not exist due to daylight saving' using errcode = '23514';
  end if;
  if p_activity_id is null then
    insert into public.itinerary_items(trip_id, destination_id, title, description, local_date,
      starts_at, ends_at, time_zone, category, location, notes, position)
    values (p_trip_id, destination, p_values ->> 'title', nullif(p_values ->> 'description', ''),
      (p_values ->> 'local_date')::date, instant_start, instant_end, zone_name,
      p_values ->> 'category', nullif(p_values ->> 'location', ''), nullif(p_values ->> 'notes', ''),
      (select coalesce(max(position), -1) + 1 from public.itinerary_items where trip_id = p_trip_id))
    returning id into saved_id;
  else
    update public.itinerary_items set destination_id = destination, title = p_values ->> 'title',
      description = nullif(p_values ->> 'description', ''), local_date = (p_values ->> 'local_date')::date,
      starts_at = instant_start, ends_at = instant_end, time_zone = zone_name,
      category = p_values ->> 'category', location = nullif(p_values ->> 'location', ''), notes = nullif(p_values ->> 'notes', '')
    where id = p_activity_id and trip_id = p_trip_id returning id into saved_id;
    if not found then raise exception 'Activity unavailable' using errcode = '42501'; end if;
  end if;
  return saved_id;
end;
$$;

create function travel_private.validate_unlinked_activity_dates()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  payload jsonb;
  scope_id uuid;
  parent public.trips%rowtype;
begin
  if tg_op = 'DELETE' then payload := to_jsonb(old); else payload := to_jsonb(new); end if;
  if tg_table_name = 'trips' then scope_id := (payload ->> 'id')::uuid;
  else scope_id := (payload ->> 'trip_id')::uuid; end if;
  select * into parent from public.trips where id = scope_id for update;
  if not found then return null; end if;
  if exists (
    select 1 from public.itinerary_items item
    where item.trip_id = scope_id and item.destination_id is null and (
      item.local_date < parent.start_date or item.local_date > parent.end_date
      or (item.starts_at is not null and (item.starts_at at time zone item.time_zone)::date <> item.local_date)
      or (item.ends_at is not null and (item.ends_at at time zone item.time_zone)::date > parent.end_date)
    )
  ) then raise exception 'Activity dates outside trip or local day' using errcode = '23514'; end if;
  return null;
end;
$$;

revoke all on function travel_private.validate_unlinked_activity_dates() from public, anon, authenticated;
create constraint trigger unlinked_activity_dates after insert or update or delete on public.itinerary_items
  deferrable initially deferred for each row execute function travel_private.validate_unlinked_activity_dates();
create constraint trigger unlinked_activity_dates after update on public.trips
  deferrable initially deferred for each row execute function travel_private.validate_unlinked_activity_dates();

create function public.save_trip_activity_details(p_trip_id uuid, p_activity_id uuid, p_values jsonb)
returns uuid language sql security invoker set search_path = '' as $$
  select public.save_trip_activity_location(p_trip_id, p_activity_id, p_values);
$$;
revoke all on function public.save_trip_activity_details(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.save_trip_activity_details(uuid,uuid,jsonb) to authenticated;

commit;