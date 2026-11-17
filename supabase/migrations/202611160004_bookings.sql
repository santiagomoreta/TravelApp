begin;

create function public.save_trip_booking(p_trip_id uuid, p_booking_id uuid, p_kind text, p_values jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  saved_id uuid;
  price_text text := nullif(p_values ->> 'amount', '');
  price numeric;
  local_departure timestamp;
  local_arrival timestamp;
  departure_zone text;
  arrival_zone text;
  departure timestamptz;
  arrival timestamptz;
begin
  perform id from public.trips where id = p_trip_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Trip unavailable' using errcode = '42501'; end if;
  if price_text is not null and price_text !~ '^(0|[1-9][0-9]{0,13})([.][0-9]{1,6})?$' then
    raise exception 'Invalid exact decimal price' using errcode = '23514';
  end if;
  price := price_text::numeric;
  if p_kind = 'transport' then
    local_departure := nullif(p_values ->> 'departs_local', '')::timestamp;
    local_arrival := nullif(p_values ->> 'arrives_local', '')::timestamp;
    departure_zone := nullif(p_values ->> 'departure_time_zone', '');
    arrival_zone := nullif(p_values ->> 'arrival_time_zone', '');
    if (local_departure is not null and departure_zone is null)
      or (local_arrival is not null and (local_departure is null or arrival_zone is null)) then
      raise exception 'Incomplete schedule' using errcode = '23514';
    end if;
    if (departure_zone is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = departure_zone))
      or (arrival_zone is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = arrival_zone)) then
      raise exception 'Unknown time zone' using errcode = '23514';
    end if;
    departure := local_departure at time zone departure_zone;
    arrival := local_arrival at time zone arrival_zone;
    if (departure at time zone departure_zone) is distinct from local_departure
      or (arrival at time zone arrival_zone) is distinct from local_arrival then
      raise exception 'Local time does not exist due to daylight saving' using errcode = '23514';
    end if;
    if p_booking_id is null then
      insert into public.transports(trip_id, origin_destination_id, destination_id, type,
        origin_label, destination_label, departs_at, arrives_at, departure_time_zone, arrival_time_zone,
        company, booking_reference, ticket_number, amount, currency, notes)
      values (p_trip_id, nullif(p_values ->> 'origin_destination_id', '')::uuid,
        nullif(p_values ->> 'destination_id', '')::uuid, p_values ->> 'type',
        p_values ->> 'origin_label', p_values ->> 'destination_label', departure, arrival, departure_zone, arrival_zone,
        nullif(p_values ->> 'company', ''), nullif(p_values ->> 'booking_reference', ''),
        nullif(p_values ->> 'ticket_number', ''), price, nullif(p_values ->> 'currency', ''), nullif(p_values ->> 'notes', ''))
      returning id into saved_id;
    else
      update public.transports set origin_destination_id = nullif(p_values ->> 'origin_destination_id', '')::uuid,
        destination_id = nullif(p_values ->> 'destination_id', '')::uuid, type = p_values ->> 'type',
        origin_label = p_values ->> 'origin_label', destination_label = p_values ->> 'destination_label',
        departs_at = departure, arrives_at = arrival, departure_time_zone = departure_zone, arrival_time_zone = arrival_zone,
        company = nullif(p_values ->> 'company', ''), booking_reference = nullif(p_values ->> 'booking_reference', ''),
        ticket_number = nullif(p_values ->> 'ticket_number', ''), amount = price,
        currency = nullif(p_values ->> 'currency', ''), notes = nullif(p_values ->> 'notes', '')
      where id = p_booking_id and trip_id = p_trip_id returning id into saved_id;
      if not found then raise exception 'Booking unavailable' using errcode = '42501'; end if;
    end if;
  elsif p_kind = 'accommodation' then
    if p_booking_id is null then
      insert into public.accommodations(trip_id, destination_id, name, type, address, latitude, longitude,
        check_in, check_out, time_zone, amount, currency, booking_reference, phone, url, notes)
      values (p_trip_id, nullif(p_values ->> 'destination_id', '')::uuid, p_values ->> 'name', p_values ->> 'type',
        nullif(p_values ->> 'address', ''), nullif(p_values ->> 'latitude', '')::numeric, nullif(p_values ->> 'longitude', '')::numeric,
        (p_values ->> 'check_in')::date, (p_values ->> 'check_out')::date, nullif(p_values ->> 'time_zone', ''),
        price, nullif(p_values ->> 'currency', ''), nullif(p_values ->> 'booking_reference', ''),
        nullif(p_values ->> 'phone', ''), nullif(p_values ->> 'url', ''), nullif(p_values ->> 'notes', ''))
      returning id into saved_id;
    else
      update public.accommodations set destination_id = nullif(p_values ->> 'destination_id', '')::uuid,
        name = p_values ->> 'name', type = p_values ->> 'type', address = nullif(p_values ->> 'address', ''),
        latitude = nullif(p_values ->> 'latitude', '')::numeric, longitude = nullif(p_values ->> 'longitude', '')::numeric,
        check_in = (p_values ->> 'check_in')::date, check_out = (p_values ->> 'check_out')::date,
        time_zone = nullif(p_values ->> 'time_zone', ''), amount = price, currency = nullif(p_values ->> 'currency', ''),
        booking_reference = nullif(p_values ->> 'booking_reference', ''), phone = nullif(p_values ->> 'phone', ''),
        url = nullif(p_values ->> 'url', ''), notes = nullif(p_values ->> 'notes', '')
      where id = p_booking_id and trip_id = p_trip_id returning id into saved_id;
      if not found then raise exception 'Booking unavailable' using errcode = '42501'; end if;
    end if;
  else
    raise exception 'Invalid booking kind' using errcode = '23514';
  end if;
  return saved_id;
end;
$$;

revoke all on function public.save_trip_booking(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_trip_booking(uuid, uuid, text, jsonb) to authenticated;

commit;