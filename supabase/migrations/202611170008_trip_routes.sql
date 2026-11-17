begin;

create function travel_private.valid_trip_route(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  point jsonb;
  endpoint text;
  coordinate numeric;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) is distinct from 'object'
    or value - array['origin', 'destination'] <> '{}'::jsonb then return false; end if;
  foreach endpoint in array array['origin', 'destination'] loop
    point := value -> endpoint;
    if jsonb_typeof(point) is distinct from 'object'
      or point - array['name', 'latitude', 'longitude'] <> '{}'::jsonb
      or jsonb_typeof(point -> 'name') is distinct from 'string'
      or char_length(btrim(point ->> 'name')) not between 1 and 160
      or jsonb_typeof(point -> 'latitude') is distinct from 'number'
      or jsonb_typeof(point -> 'longitude') is distinct from 'number' then return false; end if;
    coordinate := (point ->> 'latitude')::numeric;
    if abs(coordinate) > 90 or coordinate <> round(coordinate, 6) then return false; end if;
    coordinate := (point ->> 'longitude')::numeric;
    if abs(coordinate) > 180 or coordinate <> round(coordinate, 6) then return false; end if;
  end loop;
  return true;
end;
$$;

revoke all on function travel_private.valid_trip_route(jsonb) from public, anon, authenticated;
grant execute on function travel_private.valid_trip_route(jsonb) to authenticated;

alter table public.trips add column route jsonb;
alter table public.trips add constraint trips_route_valid check (travel_private.valid_trip_route(route));
grant update (route) on public.trips to authenticated;

commit;