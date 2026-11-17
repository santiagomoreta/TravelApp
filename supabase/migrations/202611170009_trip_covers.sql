begin;

alter table public.trips drop constraint trips_cover_url_check;
alter table public.trips add constraint trips_cover_url_check check (
  cover_url is null or (char_length(cover_url) <= 2048 and (
    cover_url ~ '^(https://|/images/)'
    or cover_url ~ ('^/api/trip-covers/' || owner_id::text || '/' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$')
  ))
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('trip-covers', 'trip-covers', false, 4194304, array['image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = 4194304,
  allowed_mime_types = excluded.allowed_mime_types;

create function travel_private.cover_object_allowed(p_name text)
returns boolean language sql stable set search_path = '' as $$
  select auth.uid() is not null and p_name ~ ('^' || auth.uid()::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$');
$$;
revoke all on function travel_private.cover_object_allowed(text) from public, anon, authenticated;
grant execute on function travel_private.cover_object_allowed(text) to anon, authenticated;

create policy tp_covers_read on storage.objects for select to authenticated
  using (bucket_id = 'trip-covers' and travel_private.cover_object_allowed(name));
create policy tp_covers_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-covers' and travel_private.cover_object_allowed(name));
create policy tp_covers_delete on storage.objects for delete to authenticated
  using (bucket_id = 'trip-covers' and travel_private.cover_object_allowed(name));
create policy tp_covers_read_guard on storage.objects as restrictive for select to public
  using (bucket_id <> 'trip-covers' or travel_private.cover_object_allowed(name));
create policy tp_covers_insert_guard on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'trip-covers' or travel_private.cover_object_allowed(name));
create policy tp_covers_delete_guard on storage.objects as restrictive for delete to public
  using (bucket_id <> 'trip-covers' or travel_private.cover_object_allowed(name));
create policy tp_covers_update_guard on storage.objects as restrictive for update to public
  using (bucket_id <> 'trip-covers') with check (bucket_id <> 'trip-covers');

commit;