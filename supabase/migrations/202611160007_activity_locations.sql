begin;

create function public.save_trip_activity_location(p_trip_id uuid, p_activity_id uuid, p_values jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  saved_id uuid;
  latitude_text text := nullif(p_values ->> 'latitude', '');
  longitude_text text := nullif(p_values ->> 'longitude', '');
begin
  perform id from public.trips where id = p_trip_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Trip unavailable' using errcode = '42501'; end if;
  if (latitude_text is null) <> (longitude_text is null)
    or (latitude_text is not null and latitude_text !~ '^-?[0-9]+(\.[0-9]{1,6})?$')
    or (longitude_text is not null and longitude_text !~ '^-?[0-9]+(\.[0-9]{1,6})?$') then
    raise exception 'Invalid coordinate pair' using errcode = '23514';
  end if;
  if length(latitude_text) > 12 or length(longitude_text) > 12 then
    raise exception 'Invalid coordinates' using errcode = '23514';
  end if;
  if abs(latitude_text::numeric) > 90 or abs(longitude_text::numeric) > 180 then
    raise exception 'Coordinates out of range' using errcode = '23514';
  end if;
  saved_id := public.save_trip_activity(p_trip_id, p_activity_id, p_values);
  if p_values ? 'latitude' or p_values ? 'longitude' then
    update public.itinerary_items set latitude = latitude_text::numeric, longitude = longitude_text::numeric
      where id = saved_id and trip_id = p_trip_id;
  end if;
  return saved_id;
end;
$$;
revoke all on function public.save_trip_activity_location(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.save_trip_activity_location(uuid,uuid,jsonb) to authenticated;

commit;