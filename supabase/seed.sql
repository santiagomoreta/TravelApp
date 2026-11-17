begin;

do $$
begin
  if current_setting('travel_planner.allow_test_seed', true) is distinct from 'local-only' then
    raise exception 'Local test seed requires explicit local-only opt-in';
  end if;
end;
$$;

insert into auth.users(id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.invalid', '{"display_name":"Perfil A"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.invalid', '{"full_name":"Perfil B"}')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
insert into public.trips(id, owner_id, name, start_date, end_date, currency, budget) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', auth.uid(), 'Viaje A', '2027-02-01', '2027-02-28', 'EUR', 1000),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', auth.uid(), 'Otro viaje A', '2027-02-01', '2027-02-28', 'EUR', 500)
on conflict (id) do nothing;
insert into public.destinations(id, trip_id, name, arrival_date, departure_date, position, time_zone) values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Quito', '2027-02-01', '2027-02-28', 0, 'America/Guayaquil'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Cuenca', '2027-02-01', '2027-02-28', 0, 'America/Guayaquil')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
insert into public.trips(id, owner_id, name, start_date, end_date, currency) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', auth.uid(), 'Viaje B', '2027-02-01', '2027-02-28', 'EUR')
on conflict (id) do nothing;
insert into public.destinations(id, trip_id, name, arrival_date, departure_date, position) values
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Lisboa', '2027-02-01', '2027-02-28', 0)
on conflict (id) do nothing;

commit;