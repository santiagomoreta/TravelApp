begin;

alter table public.documents add column storage_status text not null default 'ready'
  check (storage_status in ('pending', 'ready', 'deleting'));
revoke insert, delete on public.documents from authenticated;
revoke update (name, category, bucket_id, object_path, mime_type, size_bytes, storage_status) on public.documents from authenticated;
grant update (name, category) on public.documents to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('trip-documents', 'trip-documents', false, 4194304, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = 4194304,
  allowed_mime_types = excluded.allowed_mime_types;

create function travel_private.document_object_allowed(p_name text, p_state text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  if p_state = 'read' then
    return exists (select 1 from public.documents d join public.trips t on t.id = d.trip_id
      where d.object_path = p_name and d.bucket_id = 'trip-documents'
      and d.uploaded_by = auth.uid() and t.owner_id = auth.uid());
  end if;
  if p_state not in ('pending','deleting') then return false; end if;
  perform t.id from public.trips t join public.documents d on d.trip_id = t.id
    where d.object_path = p_name and d.bucket_id = 'trip-documents'
    and d.uploaded_by = auth.uid() and t.owner_id = auth.uid() for update of t;
  if not found then return false; end if;
  return exists (select 1 from public.documents where object_path = p_name
    and bucket_id = 'trip-documents' and uploaded_by = auth.uid() and storage_status = p_state);
end;
$$;
revoke all on function travel_private.document_object_allowed(text,text) from public, anon, authenticated;
grant execute on function travel_private.document_object_allowed(text,text) to anon, authenticated;

create policy tp_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'trip-documents' and travel_private.document_object_allowed(name,'read'));
create policy tp_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-documents' and travel_private.document_object_allowed(name,'pending'));
create policy tp_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'trip-documents' and travel_private.document_object_allowed(name,'deleting'));
create policy tp_documents_read_guard on storage.objects as restrictive for select to public
  using (bucket_id <> 'trip-documents' or travel_private.document_object_allowed(name,'read'));
create policy tp_documents_insert_guard on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'trip-documents' or travel_private.document_object_allowed(name,'pending'));
create policy tp_documents_delete_guard on storage.objects as restrictive for delete to public
  using (bucket_id <> 'trip-documents' or travel_private.document_object_allowed(name,'deleting'));
create policy tp_documents_update_guard on storage.objects as restrictive for update to public
  using (bucket_id <> 'trip-documents') with check (bucket_id <> 'trip-documents');

create function public.manage_trip_document(p_trip_id uuid, p_document_id uuid, p_operation text, p_values jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  document_row public.documents%rowtype;
  extension text;
  size_text text := p_values ->> 'size_bytes';
begin
  perform id from public.trips where id = p_trip_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Trip unavailable' using errcode = '42501'; end if;
  if p_document_id is null then raise exception 'Document id required' using errcode = '23514'; end if;
  if p_operation = 'reserve' then
    extension := case p_values ->> 'mime_type' when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' end;
    if extension is null or size_text is null or size_text !~ '^[1-9][0-9]{0,6}$' then
      raise exception 'Invalid document format or size' using errcode = '23514';
    end if;
    if size_text::bigint > 4194304 then raise exception 'Document too large' using errcode = '23514'; end if;
    insert into public.documents(id,trip_id,uploaded_by,name,category,bucket_id,object_path,mime_type,size_bytes,storage_status)
    values (p_document_id,p_trip_id,auth.uid(),p_values ->> 'name',p_values ->> 'category','trip-documents',
      auth.uid()::text || '/' || p_trip_id::text || '/' || p_document_id::text || '/document.' || extension,
      p_values ->> 'mime_type',size_text::bigint,'pending') on conflict (id) do nothing;
    select * into document_row from public.documents where id = p_document_id and trip_id = p_trip_id and uploaded_by = auth.uid();
    if not found or document_row.storage_status <> 'pending'
      or document_row.mime_type is distinct from p_values ->> 'mime_type'
      or document_row.size_bytes is distinct from size_text::bigint
      or document_row.name is distinct from p_values ->> 'name'
      or document_row.category is distinct from p_values ->> 'category' then
      raise exception 'Document unavailable' using errcode = '42501';
    end if;
    return p_document_id;
  end if;
  select * into document_row from public.documents where id = p_document_id and trip_id = p_trip_id and uploaded_by = auth.uid();
  if not found then
    if p_operation in ('begin_delete','finish_delete') then return p_document_id; end if;
    raise exception 'Document unavailable' using errcode = '42501';
  end if;
  if p_operation = 'finalize' then
    if document_row.storage_status not in ('pending','ready') or not exists (
      select 1 from storage.objects where bucket_id = document_row.bucket_id and name = document_row.object_path
      and (metadata ->> 'size')::bigint = document_row.size_bytes and metadata ->> 'mimetype' = document_row.mime_type
    ) then raise exception 'Uploaded object unavailable or mismatched' using errcode = '23514'; end if;
    update public.documents set storage_status = 'ready' where id = p_document_id;
  elsif p_operation = 'begin_delete' then
    update public.documents set storage_status = 'deleting' where id = p_document_id;
  elsif p_operation = 'finish_delete' then
    if document_row.storage_status <> 'deleting' or exists (
      select 1 from storage.objects where bucket_id = document_row.bucket_id and name = document_row.object_path
    ) then raise exception 'Remove stored object before metadata' using errcode = '23514'; end if;
    delete from public.documents where id = p_document_id;
  else raise exception 'Invalid document operation' using errcode = '23514';
  end if;
  return p_document_id;
end;
$$;
revoke all on function public.manage_trip_document(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.manage_trip_document(uuid,uuid,text,jsonb) to authenticated;

create function travel_private.guard_document_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'trips' then
    if exists (select 1 from public.documents where trip_id = old.id)
      or exists (select 1 from storage.objects where bucket_id = 'trip-documents'
        and name like old.owner_id::text || '/' || old.id::text || '/%') then
      raise exception 'Clean up trip documents before deleting trip' using errcode = '23514';
    end if;
  else
    perform id from public.trips where id = old.trip_id for update;
    if exists (select 1 from storage.objects where bucket_id = old.bucket_id and name = old.object_path) then
      raise exception 'Remove stored object before metadata' using errcode = '23514';
    end if;
  end if;
  return old;
end;
$$;
revoke all on function travel_private.guard_document_cleanup() from public, anon, authenticated;
create trigger trips_document_cleanup before delete on public.trips for each row execute function travel_private.guard_document_cleanup();
create trigger documents_object_cleanup before delete on public.documents for each row execute function travel_private.guard_document_cleanup();

commit;