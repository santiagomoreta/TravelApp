begin;

create function public.save_trip_destination(p_trip_id uuid, p_destination_id uuid, p_values jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  saved_id uuid;
begin
  perform id from public.trips where id = p_trip_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Trip unavailable' using errcode = '42501'; end if;
  if p_destination_id is null then
    insert into public.destinations(trip_id, name, description, region, country_code,
      arrival_date, departure_date, time_zone, latitude, longitude, position)
    values (p_trip_id, p_values ->> 'name', nullif(p_values ->> 'description', ''),
      nullif(p_values ->> 'region', ''), nullif(p_values ->> 'country_code', ''),
      (p_values ->> 'arrival_date')::date, (p_values ->> 'departure_date')::date,
      nullif(p_values ->> 'time_zone', ''), nullif(p_values ->> 'latitude', '')::numeric,
      nullif(p_values ->> 'longitude', '')::numeric,
      (select coalesce(max(position), -1) + 1 from public.destinations where trip_id = p_trip_id))
    returning id into saved_id;
  else
    update public.destinations set name = p_values ->> 'name',
      description = nullif(p_values ->> 'description', ''), region = nullif(p_values ->> 'region', ''),
      country_code = nullif(p_values ->> 'country_code', ''),
      arrival_date = (p_values ->> 'arrival_date')::date, departure_date = (p_values ->> 'departure_date')::date,
      time_zone = nullif(p_values ->> 'time_zone', ''), latitude = nullif(p_values ->> 'latitude', '')::numeric,
      longitude = nullif(p_values ->> 'longitude', '')::numeric
    where id = p_destination_id and trip_id = p_trip_id returning id into saved_id;
    if not found then raise exception 'Destination unavailable' using errcode = '42501'; end if;
  end if;
  return saved_id;
end;
$$;

create function public.move_trip_destination(p_trip_id uuid, p_destination_id uuid, p_direction integer)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  current_position integer;
  other_position integer;
  other_id uuid;
begin
  if p_direction is null or p_direction not in (-1, 1) then
    raise exception 'Invalid direction' using errcode = '23514';
  end if;
  perform id from public.trips where id = p_trip_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Trip unavailable' using errcode = '42501'; end if;
  select position into current_position from public.destinations where id = p_destination_id and trip_id = p_trip_id;
  if not found then raise exception 'Destination unavailable' using errcode = '42501'; end if;
  select id, position into other_id, other_position from public.destinations
    where trip_id = p_trip_id and ((p_direction = 1 and position > current_position)
      or (p_direction = -1 and position < current_position))
    order by position * p_direction limit 1;
  if not found then return; end if;
  update public.destinations set position = case when id = p_destination_id then other_position else current_position end
    where trip_id = p_trip_id and id in (p_destination_id, other_id);
end;
$$;

create function public.save_trip_activity(p_trip_id uuid, p_activity_id uuid, p_values jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  saved_id uuid;
  destination uuid := (p_values ->> 'destination_id')::uuid;
  zone_name text := nullif(p_values ->> 'time_zone', '');
  local_start timestamp := nullif(p_values ->> 'starts_local', '')::timestamp;
  local_end timestamp := nullif(p_values ->> 'ends_local', '')::timestamp;
  instant_start timestamptz;
  instant_end timestamptz;
begin
  perform id from public.trips where id = p_trip_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Trip unavailable' using errcode = '42501'; end if;
  perform id from public.destinations where id = destination and trip_id = p_trip_id;
  if not found then raise exception 'Destination unavailable' using errcode = '42501'; end if;
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

revoke all on function public.save_trip_destination(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.move_trip_destination(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.save_trip_activity(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_trip_destination(uuid, uuid, jsonb) to authenticated;
grant execute on function public.move_trip_destination(uuid, uuid, integer) to authenticated;
grant execute on function public.save_trip_activity(uuid, uuid, jsonb) to authenticated;

commit;