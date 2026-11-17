begin;

alter table public.trips
  add column outbound_transport text check (outbound_transport in ('plane','train','bus','car','boat','taxi','other')),
  add column return_transport text check (return_transport in ('plane','train','bus','car','boat','taxi','other')),
  add constraint trips_travel_pair check ((outbound_transport is null) = (return_transport is null));

grant update (outbound_transport, return_transport) on public.trips to authenticated;

commit;