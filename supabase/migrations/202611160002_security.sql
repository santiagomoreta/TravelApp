begin;

create function travel_private.initial_display_name(metadata jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  field_name text;
  candidate text;
begin
  foreach field_name in array array['display_name', 'full_name', 'name'] loop
    if jsonb_typeof(metadata -> field_name) = 'string' then
      candidate := left(btrim(regexp_replace(metadata ->> field_name, '[[:cntrl:]]', '', 'g')), 80);
      if char_length(candidate) >= 2 then return candidate; end if;
    end if;
  end loop;
  return 'Viajero';
end;
$$;

create function travel_private.create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
    values (new.id, travel_private.initial_display_name(new.raw_user_meta_data))
    on conflict (id) do nothing;
  return new;
end;
$$;

create function travel_private.guard_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  payload jsonb := to_jsonb(new);
  previous jsonb;
  field_name text;
  zone_name text;
begin
  if tg_op = 'UPDATE' then
    previous := to_jsonb(old);
    foreach field_name in array array['id', 'owner_id', 'trip_id', 'uploaded_by'] loop
      if previous -> field_name is distinct from payload -> field_name then
        raise exception 'Immutable field: %', field_name using errcode = '23514';
      end if;
    end loop;
    new.created_at := old.created_at;
  else
    new.created_at := clock_timestamp();
  end if;
  new.updated_at := clock_timestamp();
  if payload ? 'trip_id' then
    perform id from public.trips where id = (payload ->> 'trip_id')::uuid for update;
  end if;
  foreach field_name in array array['time_zone', 'departure_time_zone', 'arrival_time_zone'] loop
    zone_name := payload ->> field_name;
    if zone_name is not null and not exists (
      select 1 from pg_catalog.pg_timezone_names where name = zone_name
    ) then
      raise exception 'Unknown time zone' using errcode = '23514';
    end if;
  end loop;
  if tg_table_name = 'documents' and tg_op = 'INSERT'
    and (payload ->> 'uploaded_by')::uuid is distinct from auth.uid() then
    raise exception 'Invalid uploader' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function travel_private.create_trip_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.trip_members(trip_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create function travel_private.validate_trip_integrity()
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

  if (select count(*) from public.trip_members where trip_id = scope_id) <> 1
    or not exists (select 1 from public.trip_members where trip_id = scope_id and user_id = parent.owner_id and role = 'owner') then
    raise exception 'A trip must have exactly its owner membership' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.destinations
    where trip_id = scope_id and (arrival_date < parent.start_date or departure_date > parent.end_date)
  ) then raise exception 'Destination dates outside trip' using errcode = '23514'; end if;
  if exists (
    select 1 from public.itinerary_items item
    join public.destinations destination on destination.id = item.destination_id
    where item.trip_id = scope_id and (
      item.local_date < destination.arrival_date or item.local_date > destination.departure_date
      or (item.starts_at is not null and (item.starts_at at time zone item.time_zone)::date <> item.local_date)
      or (item.ends_at is not null and (item.ends_at at time zone item.time_zone)::date > destination.departure_date)
    )
  ) then raise exception 'Activity dates outside destination or local day' using errcode = '23514'; end if;
  if exists (
    select 1 from public.accommodations accommodation
    left join public.destinations destination on destination.id = accommodation.destination_id
    where accommodation.trip_id = scope_id and (
      accommodation.check_in < parent.start_date or accommodation.check_out > parent.end_date
      or accommodation.check_in < destination.arrival_date or accommodation.check_out > destination.departure_date
    )
  ) then raise exception 'Accommodation dates outside trip or destination' using errcode = '23514'; end if;
  if exists (
    select 1 from public.transports transport where trip_id = scope_id and (
      (departs_at at time zone departure_time_zone)::date < parent.start_date
      or (departs_at at time zone departure_time_zone)::date > parent.end_date
      or (arrives_at at time zone arrival_time_zone)::date < parent.start_date
      or (arrives_at at time zone arrival_time_zone)::date > parent.end_date
    )
  ) then raise exception 'Transport dates outside trip' using errcode = '23514'; end if;
  if exists (select 1 from public.expenses where trip_id = scope_id and base_currency is not null and base_currency <> parent.currency) then
    raise exception 'Conversion base currency differs from trip' using errcode = '23514';
  end if;
  return null;
end;
$$;

create function travel_private.audit_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  payload jsonb;
  scope_id uuid;
  account_id uuid;
begin
  if tg_op = 'DELETE' then payload := to_jsonb(old); else payload := to_jsonb(new); end if;
  if tg_table_name = 'profiles' then
    account_id := (payload ->> 'id')::uuid;
    if tg_op = 'DELETE' then account_id := null; end if;
  elsif tg_table_name = 'trips' then
    scope_id := (payload ->> 'id')::uuid;
    account_id := (payload ->> 'owner_id')::uuid;
    if tg_op = 'DELETE' then scope_id := null; end if;
  else
    scope_id := (payload ->> 'trip_id')::uuid;
    select owner_id into account_id from public.trips where id = scope_id;
    if not found then return null; end if;
  end if;
  insert into public.audit_logs(trip_id, owner_id, actor_id, entity_type, entity_id, action)
    values (scope_id, account_id, auth.uid(), tg_table_name, (payload ->> 'id')::uuid, tg_op);
  return null;
end;
$$;

create trigger travel_planner_profile after insert on auth.users
  for each row execute function travel_private.create_profile();
create trigger a_trip_owner after insert on public.trips
  for each row execute function travel_private.create_trip_owner();

do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles', 'trips', 'trip_members', 'destinations', 'itinerary_items', 'transports', 'accommodations', 'expenses', 'documents'] loop
    execute format('create trigger guard_write before insert or update on public.%I for each row execute function travel_private.guard_write()', table_name);
    execute format('create trigger z_audit after insert or update or delete on public.%I for each row execute function travel_private.audit_change()', table_name);
    if table_name <> 'profiles' then
      execute format('create constraint trigger trip_integrity after insert or update or delete on public.%I deferrable initially deferred for each row execute function travel_private.validate_trip_integrity()', table_name);
    end if;
  end loop;
end;
$$;

insert into public.profiles(id, display_name)
  select id, travel_private.initial_display_name(raw_user_meta_data) from auth.users
  on conflict (id) do nothing;

grant usage on schema public to authenticated;
grant select on public.profiles, public.trip_members, public.audit_logs to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant select, insert, delete on public.trips to authenticated;
grant update (name, description, start_date, end_date, cover_url, status, currency, budget, archived_at) on public.trips to authenticated;

create policy profile_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profile_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy trip_read on public.trips for select to authenticated using (owner_id = (select auth.uid()));
create policy trip_insert on public.trips for insert to authenticated with check (owner_id = (select auth.uid()));
create policy trip_update on public.trips for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy trip_delete on public.trips for delete to authenticated using (owner_id = (select auth.uid()));
create policy membership_read on public.trip_members for select to authenticated using (
  exists (select 1 from public.trips where trips.id = trip_members.trip_id and owner_id = (select auth.uid()))
);
create policy audit_read on public.audit_logs for select to authenticated using (owner_id = (select auth.uid()));

do $$
<<permissions>>
declare
  table_name text;
  editable_columns text;
begin
  foreach table_name in array array['destinations', 'itinerary_items', 'transports', 'accommodations', 'expenses', 'documents'] loop
    execute format('grant select, insert, delete on public.%I to authenticated', table_name);
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into editable_columns
      from information_schema.columns
      where table_schema = 'public' and information_schema.columns.table_name = permissions.table_name
        and column_name not in ('id', 'trip_id', 'uploaded_by', 'created_at', 'updated_at') and is_generated = 'NEVER';
    execute format('grant update (%s) on public.%I to authenticated', editable_columns, table_name);
    execute format('create policy owner_read on public.%1$I for select to authenticated using (exists (select 1 from public.trips where trips.id = %1$I.trip_id and owner_id = (select auth.uid())))', table_name);
    execute format('create policy owner_insert on public.%1$I for insert to authenticated with check (exists (select 1 from public.trips where trips.id = %1$I.trip_id and owner_id = (select auth.uid())))', table_name);
    execute format('create policy owner_update on public.%1$I for update to authenticated using (exists (select 1 from public.trips where trips.id = %1$I.trip_id and owner_id = (select auth.uid()))) with check (exists (select 1 from public.trips where trips.id = %1$I.trip_id and owner_id = (select auth.uid())))', table_name);
    execute format('create policy owner_delete on public.%1$I for delete to authenticated using (exists (select 1 from public.trips where trips.id = %1$I.trip_id and owner_id = (select auth.uid())))', table_name);
  end loop;
end;
$$;

revoke all on function travel_private.initial_display_name(jsonb) from public, anon, authenticated;
revoke all on function travel_private.create_profile() from public, anon, authenticated;
revoke all on function travel_private.guard_write() from public, anon, authenticated;
revoke all on function travel_private.create_trip_owner() from public, anon, authenticated;
revoke all on function travel_private.validate_trip_integrity() from public, anon, authenticated;
revoke all on function travel_private.audit_change() from public, anon, authenticated;

commit;