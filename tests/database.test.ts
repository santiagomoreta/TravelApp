import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const tripA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const tripA2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const tripB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const destinationA = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const destinationA2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const destinationB = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const existingUser = "33333333-3333-4333-8333-333333333333";
const tables = ["profiles", "trips", "trip_members", "destinations", "itinerary_items", "transports", "accommodations", "expenses", "documents", "audit_logs"];

async function asUser<Result>(account: string | null, action: () => Promise<Result>): Promise<Result> {
  await db.exec(`begin; set local role ${account ? "authenticated" : "anon"};`);
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [account || ""]);
  try {
    const result = await action();
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

function sqlCode(code: string) {
  return (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === code;
}

async function insertExpense(trip = tripA, destination: string | null = destinationA, amount = "12.500000") {
  return db.query("insert into public.expenses(trip_id, destination_id, concept, amount, currency, expense_date) values ($1,$2,'Comida',$3,'EUR','2027-02-03') returning id", [trip, destination, amount]);
}

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    grant usage on schema public, auth to anon, authenticated;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    grant usage on schema storage to anon, authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated,anon;
  `);
  await db.query("insert into auth.users(id, raw_user_meta_data) values ($1, $2)", [existingUser, { full_name: "Cuenta anterior" }]);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort()) {
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  }
  const seed = await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8");
  await assert.rejects(db.exec(seed), /Local test seed/);
  await db.exec("rollback; set travel_planner.allow_test_seed = 'local-only';");
  await db.exec(seed);
  await db.exec(seed);
});

after(async () => { await db?.close(); });

test("database: activities without stops retain zoned times, coordinates, trip dates and ownership", async () => {
  const scope = randomUUID();
  const values = { destination_id: null, title: "Museo", description: "Visita", local_date: "2027-03-02", starts_local: "2027-03-02T10:00", ends_local: "2027-03-02T11:30", time_zone: "Europe/Madrid", category: "activity", location: "Museo, Madrid, España", latitude: "40.4138", longitude: "-3.6921", notes: "Entrada" };
  const save = (changes = {}, id: string | null = null, trip = scope) => db.query<{ id: string }>("select public.save_trip_activity_details($1,$2,$3) as id", [trip, id, { ...values, ...changes }]);
  try {
    await asUser(alice, () => db.query("insert into public.trips(id,owner_id,name,start_date,end_date,currency) values($1,$2,'Agenda sin paradas','2027-03-01','2027-03-28','EUR')", [scope, alice]));
    const saved = await asUser(alice, () => save());
    const id = saved.rows[0].id;
    await asUser(alice, async () => {
      assert.equal((await db.query("select id from public.destinations where trip_id=$1", [scope])).rows.length, 0);
      assert.deepEqual((await db.query("select destination_id,title,local_date::text,to_char(starts_at at time zone time_zone,'YYYY-MM-DD\"T\"HH24:MI') as start,to_char(ends_at at time zone time_zone,'YYYY-MM-DD\"T\"HH24:MI') as finish,latitude::text,longitude::text from public.itinerary_items where id=$1", [id])).rows, [{ destination_id: null, title: "Museo", local_date: "2027-03-02", start: "2027-03-02T10:00", finish: "2027-03-02T11:30", latitude: "40.413800", longitude: "-3.692100" }]);
      await db.query("update public.itinerary_items set estimated_amount=123.456789,currency='EUR' where id=$1", [id]);
      await save({ title: "Museo editado", starts_local: "2027-03-02T12:00", ends_local: "2027-03-02T13:00" }, id);
      assert.deepEqual((await db.query("select title,estimated_amount::text from public.itinerary_items where id=$1", [id])).rows, [{ title: "Museo editado", estimated_amount: "123.456789" }]);
    });
    for (const change of [
      { local_date: "2027-02-28", starts_local: "", ends_local: "" },
      { local_date: "2027-03-29", starts_local: "", ends_local: "" },
      { ends_local: "2027-03-29T10:00" }, { local_date: "2027-03-03" },
      { starts_local: "2027-03-02T12:00", ends_local: "2027-03-02T11:00" },
      { local_date: "2027-03-28", starts_local: "2027-03-28T02:30", ends_local: "" },
    ]) await assert.rejects(asUser(alice, () => save(change)), sqlCode("23514"));
    await assert.rejects(asUser(alice, () => save({ destination_id: destinationB })), sqlCode("42501"));
    await assert.rejects(asUser(bob, () => save({}, id)), sqlCode("42501"));
    await assert.rejects(asUser(alice, () => save({}, null, tripB)), sqlCode("42501"));
    await assert.rejects(asUser(null, () => save()), sqlCode("42501"));
    await assert.rejects(asUser(alice, () => db.query("update public.trips set start_date='2027-03-03' where id=$1", [scope])), sqlCode("23514"));
    await assert.rejects(asUser(alice, () => db.query("insert into public.itinerary_items(trip_id,title,local_date) values($1,'Fuera','2027-04-01')", [scope])), sqlCode("23514"));
    await asUser(alice, async () => {
      await save({ starts_local: "", ends_local: "", time_zone: "", latitude: "", longitude: "" }, id);
      assert.deepEqual((await db.query("select starts_at,ends_at,latitude,longitude from public.itinerary_items where id=$1", [id])).rows, [{ starts_at: null, ends_at: null, latitude: null, longitude: null }]);
      await db.query("delete from public.itinerary_items where id=$1", [id]);
    });
  } finally { await asUser(alice, () => db.query("delete from public.trips where id=$1", [scope])); }
});

test("database: round-trip travel modes save atomically and retain owner-only access", async () => {
  const scope = randomUUID();
  try {
    await asUser(alice, () => db.query("insert into public.trips(id,owner_id,name,start_date,end_date,currency) values($1,$2,'Viaje anterior','2027-03-01','2027-03-10','EUR')", [scope, alice]));
    await asUser(alice, async () => {
      assert.deepEqual((await db.query("select outbound_transport,return_transport from public.trips where id=$1", [scope])).rows, [{ outbound_transport: null, return_transport: null }]);
      await db.query("update public.trips set outbound_transport='train',return_transport='bus',budget=123.456789 where id=$1", [scope]);
    });
    for (const [outbound, inbound] of [["flight", "car"], ["train", null], [null, "bus"], ["", "plane"], ["car", "TRAIN"]]) await assert.rejects(asUser(alice, () => db.query("update public.trips set outbound_transport=$1,return_transport=$2,name='No guardar' where id=$3", [outbound, inbound, scope])), sqlCode("23514"));
    await asUser(bob, async () => {
      assert.equal((await db.query("select outbound_transport,return_transport from public.trips where id=$1", [scope])).rows.length, 0);
      assert.equal((await db.query("update public.trips set outbound_transport='car',return_transport='car' where id=$1 returning id", [scope])).rows.length, 0);
    });
    await assert.rejects(asUser(null, () => db.query("update public.trips set outbound_transport='car',return_transport='car' where id=$1", [scope])), sqlCode("42501"));
    await asUser(alice, async () => {
      await db.query("update public.trips set description='Edicion sin cambiar transporte' where id=$1", [scope]);
      assert.deepEqual((await db.query("select name,outbound_transport,return_transport,budget::text from public.trips where id=$1", [scope])).rows, [{ name: "Viaje anterior", outbound_transport: "train", return_transport: "bus", budget: "123.456789" }]);
      for (const mode of ["plane", "train", "bus", "car", "boat", "taxi", "other"]) await db.query("update public.trips set outbound_transport=$1,return_transport=$1 where id=$2", [mode, scope]);
      await db.query("update public.trips set outbound_transport=null,return_transport=null where id=$1", [scope]);
    });
    const created = randomUUID();
    await asUser(alice, async () => {
      await db.query("insert into public.trips(id,owner_id,name,start_date,end_date,currency,outbound_transport,return_transport) values($1,$2,'Nuevo viaje','2027-03-01','2027-03-10','EUR','car','car')", [created, alice]);
      assert.deepEqual((await db.query("select outbound_transport,return_transport from public.trips where id=$1", [created])).rows, [{ outbound_transport: "car", return_transport: "car" }]);
      await db.query("delete from public.trips where id=$1", [created]);
    });
  } finally { await asUser(alice, () => db.query("delete from public.trips where id=$1", [scope])); }
});

test("database: covers are private even with permissive policies and bind to the owning trip", async () => {
  const scope = randomUUID();
  const image = randomUUID();
  const path = `${alice}/${scope}/${image}.jpg`;
  const url = `/api/trip-covers/${path}`;
  try {
    await db.exec("create policy fixture_cover_all on storage.objects for all to public using (true) with check (true)");
    assert.deepEqual((await db.query("select public,file_size_limit::int,allowed_mime_types from storage.buckets where id='trip-covers'")).rows, [{ public: false, file_size_limit: 4194304, allowed_mime_types: ["image/jpeg", "image/png"] }]);
    await asUser(alice, async () => {
      await db.query("insert into storage.objects(bucket_id,name) values('trip-covers',$1)", [path]);
      await db.query("insert into public.trips(id,owner_id,name,start_date,end_date,currency,cover_url) values($1,$2,'Foto propia','2027-03-01','2027-03-10','EUR',$3)", [scope, alice, url]);
      assert.deepEqual((await db.query("select cover_url from public.trips where id=$1", [scope])).rows, [{ cover_url: url }]);
      assert.equal((await db.query("select name from storage.objects where bucket_id='trip-covers' and name=$1", [path])).rows.length, 1);
      assert.equal((await db.query("update storage.objects set name='forged' where name=$1 returning name", [path])).rows.length, 0);
    });
    for (const account of [bob, null]) {
      await asUser(account, async () => {
        assert.equal((await db.query("select name from storage.objects where name=$1", [path])).rows.length, 0);
        assert.equal((await db.query("delete from storage.objects where name=$1 returning name", [path])).rows.length, 0);
      });
      await assert.rejects(asUser(account, () => db.query("insert into storage.objects(bucket_id,name) values('trip-covers',$1)", [`${alice}/${scope}/${randomUUID()}.png`])), sqlCode("42501"));
    }
    for (const invalid of [url.replace(alice, bob), url.replace(scope, tripB), `${url}?forged=1`, "/api/trip-covers/../x.jpg"]) await assert.rejects(asUser(alice, () => db.query("update public.trips set cover_url=$1,name='No guardar' where id=$2", [invalid, scope])), sqlCode("23514"));
    for (const invalid of [`${alice}/${scope}/../photo.jpg`, `${alice}/${scope}/${image}.svg`]) await assert.rejects(asUser(alice, () => db.query("insert into storage.objects(bucket_id,name) values('trip-covers',$1)", [invalid])), sqlCode("42501"));
    await asUser(alice, async () => {
      await db.query("update public.trips set description='Conservar foto' where id=$1", [scope]);
      assert.deepEqual((await db.query("select name,cover_url from public.trips where id=$1", [scope])).rows, [{ name: "Foto propia", cover_url: url }]);
      await db.query("update public.trips set cover_url='/images/cotopaxi.jpg' where id=$1", [scope]);
      assert.equal((await db.query("delete from storage.objects where name=$1 returning name", [path])).rows.length, 1);
      await db.query("update public.trips set cover_url=null where id=$1", [scope]);
    });
  } finally {
    await db.query("delete from storage.objects where bucket_id='trip-covers' and name like $1", [`${alice}/${scope}/%`]);
    await asUser(alice, () => db.query("delete from public.trips where id=$1", [scope]));
    await db.exec("drop policy if exists fixture_cover_all on storage.objects");
  }
});

test("database: trip routes validate both endpoints atomically and retain owner-only access", async () => {
  const scope = randomUUID();
  const route = { origin: { name: "Quito", latitude: 0, longitude: 0 }, destination: { name: "Madrid", latitude: 40.416775, longitude: -3.70379 } };
  try {
    await asUser(alice, () => db.query("insert into public.trips(id,owner_id,name,start_date,end_date,currency,route) values($1,$2,'Ruta','2027-03-01','2027-03-10','EUR',$3)", [scope, alice, route]));
    await asUser(alice, async () => {
      assert.deepEqual((await db.query("select route from public.trips where id=$1", [scope])).rows, [{ route }]);
      await db.query("update public.trips set budget=123.456789 where id=$1", [scope]);
    });
    for (const invalid of [{ origin: route.origin }, { ...route, origin: { ...route.origin, latitude: 91 } }, { ...route, destination: { ...route.destination, longitude: "NaN" } }, { ...route, origin: { ...route.origin, latitude: 0.1234567 } }, { ...route, origin: null }, { ...route, destination: { ...route.destination, name: " " } }, { ...route, owner_id: bob }]) {
      await assert.rejects(asUser(alice, () => db.query("update public.trips set route=$1,name='No guardar' where id=$2", [invalid, scope])), sqlCode("23514"));
    }
    await asUser(bob, async () => {
      assert.equal((await db.query("select route from public.trips where id=$1", [scope])).rows.length, 0);
      assert.equal((await db.query("update public.trips set route=$1 where id=$2 returning id", [route, scope])).rows.length, 0);
    });
    await assert.rejects(asUser(null, () => db.query("update public.trips set route=$1 where id=$2", [route, scope])), sqlCode("42501"));
    const updated = { ...route, destination: { name: "Barcelona", latitude: 41.3874, longitude: 2.1686 } };
    await asUser(alice, async () => {
      await db.query("update public.trips set route=$1 where id=$2", [updated, scope]);
      assert.deepEqual((await db.query("select name,route,budget::text from public.trips where id=$1", [scope])).rows, [{ name: "Ruta", route: updated, budget: "123.456789" }]);
    });
  } finally { await asUser(alice, () => db.query("delete from public.trips where id=$1", [scope])); }
});

test("database: activity map locations save atomically with ownership and preserve unrelated fields", async () => {
  const scope = randomUUID();
  const destination = randomUUID();
  const values = { destination_id: destination, title: "Lugar del mapa", local_date: "2027-03-02", category: "activity", starts_local: "", ends_local: "", time_zone: "UTC", latitude: "0", longitude: "0" };
  const save = (id: string | null, input: object) => db.query<{ id: string }>("select public.save_trip_activity_location($1,$2,$3) as id", [scope, id, input]);
  try {
    await asUser(alice, async () => {
      await db.query("insert into public.trips(id,owner_id,name,start_date,end_date,currency) values($1,$2,'Mapa','2027-03-01','2027-03-10','EUR')", [scope, alice]);
      await db.query("insert into public.destinations(id,trip_id,name,arrival_date,departure_date,position) values($1,$2,'Destino','2027-03-01','2027-03-10',0)", [destination, scope]);
    });
    const id = (await asUser(alice, () => save(null, values))).rows[0].id;
    await asUser(alice, async () => {
      assert.deepEqual((await db.query("select latitude::text,longitude::text from public.itinerary_items where id=$1", [id])).rows, [{ latitude: "0.000000", longitude: "0.000000" }]);
      await db.query("update public.itinerary_items set estimated_amount=123.456789,currency='EUR' where id=$1", [id]);
      await save(id, { ...values, title: "Editado", latitude: "42.123456", longitude: "-1.234567" });
    });
    for (const patch of [{ latitude: "91" }, { longitude: "181" }, { latitude: "NaN" }, { longitude: "" }, { latitude: "0.1234567" }]) await assert.rejects(asUser(alice, () => save(id, { ...values, title: "No guardar", ...patch })), sqlCode("23514"));
    for (const account of [bob, null]) await assert.rejects(asUser(account, () => save(id, values)), sqlCode("42501"));
    await assert.rejects(asUser(alice, () => save(id, { ...values, destination_id: destinationB })), sqlCode("42501"));
    await asUser(alice, async () => {
      assert.deepEqual((await db.query("select title,latitude::text,longitude::text,estimated_amount::text from public.itinerary_items where id=$1", [id])).rows, [{ title: "Editado", latitude: "42.123456", longitude: "-1.234567", estimated_amount: "123.456789" }]);
      await save(id, { ...values, latitude: "", longitude: "" });
      assert.deepEqual((await db.query("select latitude,longitude from public.itinerary_items where id=$1", [id])).rows, [{ latitude: null, longitude: null }]);
    });
  } finally { await asUser(alice, () => db.query("delete from public.trips where id=$1", [scope])); }
});

test("database: private documents lifecycle prevents orphaning and overrides permissive Storage policies", async () => {
  const scope = randomUUID();
  const id = randomUUID();
  const path = `${alice}/${scope}/${id}/document.pdf`;
  const values = { name: "Billete", category: "ticket", mime_type: "application/pdf", size_bytes: "12", uploaded_by: bob, object_path: "forged" };
  const manage = (operation: string, documentId = id, input: object = {}) => db.query("select public.manage_trip_document($1,$2,$3,$4)", [scope, documentId, operation, input]);
  const put = (name = path, metadata: object = { size: 12, mimetype: "application/pdf" }) => db.query("insert into storage.objects(bucket_id,name,metadata) values ('trip-documents',$1,$2)", [name, metadata]);
  try {
    await db.exec("create policy fixture_storage_all on storage.objects for all to public using (true) with check (true)");
    await asUser(alice, () => db.query("insert into public.trips(id,owner_id,name,start_date,end_date,currency) values ($1,$2,'Documentos','2027-03-01','2027-03-10','EUR')", [scope, alice]));
    assert.deepEqual((await db.query("select public,file_size_limit::int,allowed_mime_types from storage.buckets where id='trip-documents'")).rows, [{ public: false, file_size_limit: 4194304, allowed_mime_types: ["application/pdf", "image/jpeg", "image/png"] }]);
    for (const patch of [{ size_bytes: "0" }, { size_bytes: "4194305" }, { mime_type: "image/svg+xml" }]) await assert.rejects(asUser(alice, () => manage("reserve", randomUUID(), { ...values, ...patch })), sqlCode("23514"));
    await asUser(alice, async () => {
      await manage("reserve", id, values);
      await manage("reserve", id, values);
      assert.deepEqual((await db.query("select uploaded_by,object_path,storage_status from public.documents where id=$1", [id])).rows, [{ uploaded_by: alice, object_path: path, storage_status: "pending" }]);
    });
    await assert.rejects(asUser(alice, () => manage("finalize")), sqlCode("23514"));
    await assert.rejects(asUser(alice, () => db.query("delete from public.trips where id=$1", [scope])), sqlCode("23514"));
    for (const account of [bob, null]) {
      for (const operation of ["reserve", "finalize", "begin_delete", "finish_delete"]) await assert.rejects(asUser(account, () => manage(operation, id, values)), sqlCode("42501"));
      await assert.rejects(asUser(account, () => put()), sqlCode("42501"));
    }
    await assert.rejects(asUser(alice, () => put(`${alice}/${scope}/${randomUUID()}/document.pdf`)), sqlCode("42501"));
    await asUser(alice, () => put(path, { size: 13, mimetype: "application/pdf" }));
    await assert.rejects(asUser(alice, () => manage("finalize")), sqlCode("23514"));
    await db.query("update storage.objects set metadata=$1 where name=$2", [{ size: 12, mimetype: "application/pdf" }, path]);
    await asUser(alice, async () => {
      await manage("finalize");
      await manage("finalize");
      assert.equal((await db.query("select id from storage.objects where name=$1", [path])).rows.length, 1);
      assert.equal((await db.query("update storage.objects set name='forged' where name=$1 returning id", [path])).rows.length, 0);
      assert.equal((await db.query("delete from storage.objects where name=$1 returning id", [path])).rows.length, 0);
      await db.query("update public.documents set name='Billete editado',category='reservation' where id=$1", [id]);
    });
    for (const account of [bob, null]) await asUser(account, async () => { assert.equal((await db.query("select id from storage.objects where name=$1", [path])).rows.length, 0); });
    for (const column of ["object_path", "bucket_id", "mime_type", "size_bytes", "storage_status"]) await assert.rejects(asUser(alice, () => db.query(`update public.documents set ${column}=${column} where id=$1`, [id])), sqlCode("42501"));
    await assert.rejects(asUser(alice, () => db.query("delete from public.documents where id=$1", [id])), sqlCode("42501"));
    await assert.rejects(asUser(alice, () => db.query("delete from public.trips where id=$1", [scope])), sqlCode("23514"));
    await asUser(alice, () => manage("begin_delete"));
    await assert.rejects(asUser(alice, () => manage("finish_delete")), sqlCode("23514"));
    assert.equal((await asUser(alice, () => db.query("select id from public.documents where id=$1", [id]))).rows.length, 1);
    await asUser(alice, async () => {
      assert.equal((await db.query("delete from storage.objects where name=$1 returning id", [path])).rows.length, 1);
      assert.equal((await db.query("delete from storage.objects where name=$1 returning id", [path])).rows.length, 0);
    });
    await assert.rejects(asUser(alice, () => put()), sqlCode("42501"));
    await assert.rejects(asUser(alice, () => manage("finalize")), sqlCode("23514"));
    await asUser(alice, async () => {
      await manage("finish_delete");
      await manage("finish_delete");
      assert.equal((await db.query("select id from public.documents where id=$1", [id])).rows.length, 0);
      const abandoned = randomUUID();
      await manage("reserve", abandoned, values);
      await manage("begin_delete", abandoned);
      await manage("finish_delete", abandoned);
      await manage("begin_delete", abandoned);
      await manage("finish_delete", abandoned);
    });
    await db.query("insert into storage.objects(bucket_id,name) values ('trip-documents',$1)", [`${alice}/${scope}/orphan.pdf`]);
    await assert.rejects(asUser(alice, () => db.query("delete from public.trips where id=$1", [scope])), sqlCode("23514"));
    await db.query("delete from storage.objects where name like $1", [`${alice}/${scope}/%`]);
    await asUser(alice, () => db.query("delete from public.trips where id=$1", [scope]));
  } finally {
    await db.query("delete from storage.objects where name like $1", [`${alice}/${scope}/%`]);
    await db.query("delete from public.documents where trip_id=$1", [scope]);
    await asUser(alice, () => db.query("delete from public.trips where id=$1", [scope]));
    await db.exec("drop policy if exists fixture_storage_all on storage.objects");
  }
});

test("database: finance RPC exact budget, expense lifecycle, snapshots and ownership", async () => {
  const scope = randomUUID();
  const values = { expected_currency: "EUR", concept: "Comida", destination_id: "", amount: "99999999999999.999999", currency: "EUR", expense_date: "2027-02-01", category: "food", notes: "Notas", exchange_rate: "", rate_date: "" };
  const save = (kind: string, input: object, id: string | null = null) => db.query<{ id: string }>("select public.save_trip_finance($1,$2,$3,$4) as id", [scope, id, kind, input]);
  try {
    await asUser(alice, () => db.query("insert into public.trips(id,owner_id,name,start_date,end_date,currency) values ($1,$2,'Finanzas','2027-03-01','2027-03-10','EUR')", [scope, alice]));
    await asUser(alice, () => save("budget", { budget: values.amount, expected_currency: "EUR", owner_id: bob }));
    assert.equal((await asUser(alice, () => db.query<{ budget: string }>("select budget::text from public.trips where id=$1", [scope]))).rows[0].budget, values.amount);
    const nativeId = (await asUser(alice, () => save("expense", values))).rows[0].id;
    const foreign = { ...values, concept: "Cambio", amount: "0.1", currency: "USD", exchange_rate: "1.234565", rate_date: "2027-02-01", base_currency: "GBP", converted_amount: "999" };
    const foreignId = (await asUser(alice, () => save("expense", foreign))).rows[0].id;
    await asUser(alice, async () => {
      assert.equal((await db.query<{ amount: string }>("select amount::text from public.expenses where id=$1", [nativeId])).rows[0].amount, values.amount);
      assert.deepEqual((await db.query("select amount::text,exchange_rate::text,base_currency,converted_amount::text from public.expenses where id=$1", [foreignId])).rows, [{ amount: "0.100000", exchange_rate: "1.234565000000", base_currency: "EUR", converted_amount: "0.123457" }]);
      await save("expense", { ...values, concept: "Editado", amount: "0.000001", category: "shopping", notes: "Nueva nota" }, nativeId);
      assert.deepEqual((await db.query("select concept,amount::text,category,notes from public.expenses where id=$1", [nativeId])).rows, [{ concept: "Editado", amount: "0.000001", category: "shopping", notes: "Nueva nota" }]);
    });
    for (const patch of [{ amount: "0.0000001" }, { amount: "NaN" }, { amount: "-1" }, { amount: "1e2" }, { amount: "100000000000000" }, { exchange_rate: "0", rate_date: "2027-02-01" }, { exchange_rate: "1", rate_date: "" }, { exchange_rate: "0.0000000000001", rate_date: "2027-02-01" }, { expected_currency: "GBP" }]) await assert.rejects(asUser(alice, () => save("expense", { ...foreign, ...patch })), sqlCode("23514"));
    await assert.rejects(asUser(alice, () => save("expense", { ...foreign, amount: values.amount, exchange_rate: "999999999999" })), sqlCode("22003"));
    await assert.rejects(asUser(alice, () => save("budget", { budget: "0.0000001", expected_currency: "EUR" })), sqlCode("23514"));
    for (const destination_id of [destinationA, destinationB]) await assert.rejects(asUser(alice, () => save("expense", { ...values, destination_id })), sqlCode("23503"));
    await assert.rejects(asUser(alice, () => save("expense", values, randomUUID())), sqlCode("42501"));
    const otherId = (await asUser(alice, () => insertExpense())).rows[0] as { id: string };
    await assert.rejects(asUser(alice, () => save("expense", values, otherId.id)), sqlCode("42501"));
    await asUser(alice, () => db.query("delete from public.expenses where id=$1", [otherId.id]));
    for (const account of [bob, null]) {
      for (const kind of ["budget", "expense"]) await assert.rejects(asUser(account, () => save(kind, { ...values, budget: "1" }, kind === "expense" ? nativeId : null)), sqlCode("42501"));
      await assert.rejects(asUser(account, () => save("expense", values)), sqlCode("42501"));
    }
    await assert.rejects(asUser(alice, () => db.query("update public.trips set currency='GBP' where id=$1", [scope])), sqlCode("23514"));
    const destination = (await asUser(alice, () => db.query<{ id: string }>("insert into public.destinations(trip_id,name,arrival_date,departure_date,position) values ($1,'Madrid','2027-03-01','2027-03-10',0) returning id", [scope]))).rows[0].id;
    await asUser(alice, async () => {
      await save("expense", { ...foreign, destination_id: destination }, foreignId);
      await db.query("delete from public.destinations where id=$1", [destination]);
      assert.deepEqual((await db.query("select destination_id,amount::text,converted_amount::text from public.expenses where id=$1", [foreignId])).rows, [{ destination_id: null, amount: "0.100000", converted_amount: "0.123457" }]);
      await save("expense", { ...foreign, exchange_rate: "", rate_date: "" }, foreignId);
      assert.deepEqual((await db.query("select exchange_rate,base_currency,converted_amount from public.expenses where id=$1", [foreignId])).rows, [{ exchange_rate: null, base_currency: null, converted_amount: null }]);
    });
    await assert.rejects(asUser(alice, () => db.query("update public.trips set currency='GBP' where id=$1", [scope])), sqlCode("23514"));
    await asUser(alice, async () => {
      await save("budget", { budget: "", expected_currency: "EUR" });
      assert.equal((await db.query<{ budget: null }>("select budget from public.trips where id=$1", [scope])).rows[0].budget, null);
      await db.query("update public.trips set currency='GBP' where id=$1", [scope]);
    });
    for (const kind of ["budget", "expense"]) await assert.rejects(asUser(alice, () => save(kind, { ...values, budget: "1" }, kind === "expense" ? nativeId : null)), sqlCode("23514"));
    await asUser(bob, async () => { assert.equal((await db.query("delete from public.expenses where trip_id=$1 returning id", [scope])).rows.length, 0); });
    await asUser(alice, async () => {
      await db.query("delete from public.expenses where id=$1", [nativeId]);
      assert.equal((await db.query("select id from public.expenses where trip_id=$1", [scope])).rows.length, 1);
      await db.query("delete from public.expenses where id=$1", [foreignId]);
      assert.equal((await db.query("select id from public.expenses where trip_id=$1", [scope])).rows.length, 0);
    });
  } finally { await asUser(alice, () => db.query("delete from public.trips where id=$1", [scope])); }
});

test("database: booking RPC preserves decimals, zones, ownership and unlinked reservations", async () => {
  const scope = randomUUID();
  const transport = { type: "plane", origin_destination_id: "", destination_id: "", origin_label: "Madrid", destination_label: "Nueva York", departs_local: "2027-03-28T15:00", arrives_local: "2027-03-28T12:00", departure_time_zone: "Europe/Madrid", arrival_time_zone: "America/New_York", amount: "99999999999999.999999", currency: "EUR", company: "Compania", booking_reference: "REF", ticket_number: "TICKET", notes: "Notas" };
  const hotel = { destination_id: "", name: "Hotel", type: "hotel", address: "Direccion", latitude: "40.416775", longitude: "-3.703790", check_in: "2027-03-28", check_out: "2027-03-30", time_zone: "Europe/Madrid", amount: "12.345678", currency: "EUR", booking_reference: "HOTEL", phone: "+34123456", url: "https://example.com", notes: "Notas hotel" };
  const save = (kind: string, values: object, id: string | null = null) => db.query<{ id: string }>("select public.save_trip_booking($1,$2,$3,$4) as id", [scope, id, kind, values]);
  try {
    await asUser(alice, () => db.query("insert into public.trips(id,owner_id,name,start_date,end_date,currency) values ($1,$2,'Reservas','2027-03-01','2027-04-10','EUR')", [scope, alice]));
    const destination = await asUser(alice, () => db.query<{ id: string }>("insert into public.destinations(trip_id,name,arrival_date,departure_date,position) values ($1,'Madrid','2027-03-20','2027-04-01',0) returning id", [scope]));
    const destinationId = destination.rows[0].id;
    const flight = (await asUser(alice, () => save("transport", { ...transport, origin_destination_id: destinationId, destination_id: destinationId }))).rows[0].id;
    const stay = (await asUser(alice, () => save("accommodation", { ...hotel, destination_id: destinationId }))).rows[0].id;
    await asUser(alice, async () => {
      const read = await db.query<{ amount: string; utc: string }>("select amount::text,to_char(departs_at at time zone 'UTC','YYYY-MM-DD HH24:MI') as utc from public.transports where id=$1", [flight]);
      assert.deepEqual(read.rows, [{ amount: "99999999999999.999999", utc: "2027-03-28 13:00" }]);
      await save("transport", { ...transport, company: "Editada" }, flight);
      await save("accommodation", { ...hotel, destination_id: destinationId, name: "Hotel editado" }, stay);
      assert.equal((await db.query<{ amount: string }>("select amount::text from public.accommodations where id=$1", [stay])).rows[0].amount, "12.345678");
    });
    for (const patch of [{ departs_local: "2027-03-28T02:30" }, { arrives_local: "2027-03-28T01:00" }, { departure_time_zone: "Bad/Zone" }, { arrives_local: "2027-04-11T12:00" }, { amount: "NaN" }, { amount: "0.0000001" }, { currency: "" }]) await assert.rejects(asUser(alice, () => save("transport", { ...transport, ...patch })), sqlCode("23514"));
    for (const patch of [{ check_out: hotel.check_in }, { check_in: "2027-02-28" }, { destination_id: destinationId, check_out: "2027-04-02" }]) await assert.rejects(asUser(alice, () => save("accommodation", { ...hotel, ...patch })), sqlCode("23514"));
    for (const kind of ["transport", "accommodation"]) {
      const values = kind === "transport" ? transport : hotel;
      await assert.rejects(asUser(alice, () => save(kind, { ...values, destination_id: destinationA })), sqlCode("23503"));
      await assert.rejects(asUser(alice, () => save(kind, values, randomUUID())), sqlCode("42501"));
      for (const account of [bob, null]) {
        await assert.rejects(asUser(account, () => save(kind, values)), sqlCode("42501"));
        await assert.rejects(asUser(account, () => save(kind, values, kind === "transport" ? flight : stay)), sqlCode("42501"));
      }
    }
    await asUser(alice, async () => {
      await save("transport", { ...transport, origin_destination_id: destinationId, destination_id: destinationId }, flight);
      await db.query("delete from public.destinations where id=$1", [destinationId]);
      const read = await db.query<{ origin_destination_id: string | null; destination_id: string | null; origin_label: string; amount: string }>("select origin_destination_id,destination_id,origin_label,amount::text from public.transports where id=$1", [flight]);
      assert.deepEqual(read.rows, [{ origin_destination_id: null, destination_id: null, origin_label: "Madrid", amount: "99999999999999.999999" }]);
      assert.equal((await db.query<{ destination_id: string | null }>("select destination_id from public.accommodations where id=$1", [stay])).rows[0].destination_id, null);
      await save("transport", { ...transport, amount: "", currency: "", departs_local: "", arrives_local: "", departure_time_zone: "", arrival_time_zone: "" }, flight);
      assert.equal((await db.query<{ amount: string | null }>("select amount::text from public.transports where id=$1", [flight])).rows[0].amount, null);
      await db.query("delete from public.transports where id=$1", [flight]);
      await db.query("delete from public.accommodations where id=$1", [stay]);
      assert.equal((await db.query("select id from public.expenses where trip_id=$1", [scope])).rows.length, 0);
    });
  } finally { await asUser(alice, () => db.query("delete from public.trips where id=$1", [scope])); }
});

test("database: destination RPC lifecycle, atomic ordering, zoned activities and isolation", async () => {
  const scope = randomUUID();
  const destinationValues = { name: "Madrid", description: "", region: "", country_code: "ES", arrival_date: "2027-03-01", departure_date: "2027-04-10", time_zone: "Europe/Madrid", latitude: "", longitude: "" };
  try {
    await asUser(alice, () => db.query("insert into public.trips(id,owner_id,name,start_date,end_date,currency) values ($1,$2,'Contenido','2027-03-01','2027-04-10','EUR')", [scope, alice]));
    const first = await asUser(alice, () => db.query<{ id: string }>("select public.save_trip_destination($1,null,$2) as id", [scope, destinationValues]));
    const firstId = first.rows[0].id;
    const second = await asUser(alice, () => db.query<{ id: string }>("select public.save_trip_destination($1,null,$2) as id", [scope, { ...destinationValues, name: "Toledo" }]));
    const secondId = second.rows[0].id;
    await asUser(alice, () => db.query("select public.move_trip_destination($1,$2,1)", [scope, firstId]));
    await asUser(alice, async () => {
      const order = await db.query<{ id: string }>("select id from public.destinations where trip_id=$1 order by position", [scope]);
      assert.deepEqual(order.rows.map((row) => row.id), [secondId, firstId]);
      await db.query("select public.move_trip_destination($1,$2,-1)", [scope, secondId]);
      assert.deepEqual((await db.query<{ id: string }>("select id from public.destinations where trip_id=$1 order by position", [scope])).rows.map((row) => row.id), [secondId, firstId]);
      await db.query("select public.save_trip_destination($1,$2,$3)", [scope, secondId, { ...destinationValues, name: "Toledo editado" }]);
    });
    await assert.rejects(asUser(alice, () => db.query("select public.move_trip_destination($1,$2,0)", [scope, firstId])), sqlCode("23514"));
    await assert.rejects(asUser(alice, () => db.query("select public.move_trip_destination($1,$2,1)", [scope, destinationB])), sqlCode("42501"));
    const activityValues = { destination_id: firstId, title: "Paseo", description: "", local_date: "2027-03-28", starts_local: "2027-03-28T01:30", ends_local: "2027-03-28T03:30", time_zone: "Europe/Madrid", category: "sightseeing", location: "Centro", notes: "" };
    const activity = await asUser(alice, () => db.query<{ id: string }>("select public.save_trip_activity($1,null,$2) as id", [scope, activityValues]));
    const activityId = activity.rows[0].id;
    await asUser(alice, async () => {
      const saved = await db.query<{ instant: string }>("select to_char(starts_at at time zone 'UTC','YYYY-MM-DD HH24:MI') as instant from public.itinerary_items where id=$1", [activityId]);
      assert.equal(saved.rows[0].instant, "2027-03-28 00:30");
      await db.query("update public.itinerary_items set estimated_amount=12.345678,currency='EUR' where id=$1", [activityId]);
      await db.query("select public.save_trip_activity($1,$2,$3)", [scope, activityId, { ...activityValues, title: "Paseo editado", starts_local: "", ends_local: "", time_zone: "" }]);
      const edited = await db.query<{ title: string; amount: string }>("select title,estimated_amount::text as amount from public.itinerary_items where id=$1", [activityId]);
      assert.deepEqual(edited.rows, [{ title: "Paseo editado", amount: "12.345678" }]);
    });
    await assert.rejects(asUser(alice, () => db.query("select public.save_trip_activity($1,null,$2)", [scope, { ...activityValues, starts_local: "2027-03-28T02:30" }])), sqlCode("23514"));
    await assert.rejects(asUser(alice, () => db.query("select public.save_trip_activity($1,null,$2)", [scope, { ...activityValues, destination_id: destinationB }])), sqlCode("42501"));
    await assert.rejects(asUser(alice, () => db.query("select public.save_trip_destination($1,null,$2)", [scope, { ...destinationValues, arrival_date: "2027-02-28" }])), sqlCode("23514"));
    for (const account of [bob, null]) {
      await assert.rejects(asUser(account, () => db.query("select public.save_trip_destination($1,null,$2)", [scope, destinationValues])), sqlCode("42501"));
      await assert.rejects(asUser(account, () => db.query("select public.move_trip_destination($1,$2,1)", [scope, firstId])), sqlCode("42501"));
      await assert.rejects(asUser(account, () => db.query("select public.save_trip_activity($1,$2,$3)", [scope, activityId, activityValues])), sqlCode("42501"));
    }
    await asUser(alice, async () => {
      await db.query("delete from public.destinations where id=$1", [firstId]);
      assert.equal((await db.query("select id from public.itinerary_items where id=$1", [activityId])).rows.length, 0);
      assert.equal((await db.query("select id from public.destinations where id=$1", [secondId])).rows.length, 1);
    });
  } finally {
    await asUser(alice, () => db.query("delete from public.trips where id=$1", [scope]));
  }
});

test("database: trip lifecycle persists edits, archives, restores and denies foreign mutations", async () => {
  const id = randomUUID();
  try {
    await asUser(alice, () => db.query(`
      insert into public.trips(id,owner_id,name,description,start_date,end_date,currency,budget,cover_url)
      values ($1,$2,'Escapada','Descripción inicial','2028-04-01','2028-04-05','EUR',123.456789,'/images/cotopaxi.jpg')
    `, [id, alice]));
    await asUser(alice, async () => {
      const read = await db.query<{ name: string; budget: string }>("select name,budget::text from public.trips where id=$1", [id]);
      assert.deepEqual(read.rows, [{ name: "Escapada", budget: "123.456789" }]);
      await db.query("update public.trips set name='Escapada editada',description='Nueva descripción',start_date='2028-04-02',end_date='2028-04-06',status='upcoming',cover_url='/images/dolomites.jpg' where id=$1 and owner_id=$2", [id, alice]);
    });
    await asUser(bob, async () => {
      assert.equal((await db.query("select id from public.trips where id=$1", [id])).rows.length, 0);
      for (const statement of [
        "update public.trips set name='Intruso' where id=$1 returning id",
        "update public.trips set archived_at=now() where id=$1 returning id",
        "update public.trips set archived_at=null where id=$1 returning id",
        "delete from public.trips where id=$1 returning id",
      ]) assert.equal((await db.query(statement, [id])).rows.length, 0);
    });
    await asUser(alice, () => db.query("update public.trips set archived_at=now() where id=$1 and owner_id=$2", [id, alice]));
    await asUser(alice, async () => {
      const archived = await db.query<{ name: string; archived: boolean; budget: string; status: string }>("select name, archived_at is not null as archived, budget::text,status from public.trips where id=$1", [id]);
      assert.deepEqual(archived.rows, [{ name: "Escapada editada", archived: true, budget: "123.456789", status: "upcoming" }]);
      await db.query("update public.trips set archived_at=null where id=$1", [id]);
    });
    await asUser(alice, async () => {
      assert.equal((await db.query<{ archived_at: string | null }>("select archived_at from public.trips where id=$1", [id])).rows[0].archived_at, null);
      await db.query("insert into public.destinations(trip_id,name,arrival_date,departure_date,position) values ($1,'Parada','2028-04-02','2028-04-06',0)", [id]);
      await db.query("delete from public.trips where id=$1 and owner_id=$2", [id, alice]);
    });
    await asUser(alice, async () => {
      for (const [table, column] of [["trips", "id"], ["trip_members", "trip_id"], ["destinations", "trip_id"]]) {
        assert.equal((await db.query(`select id from public.${table} where ${column}=$1`, [id])).rows.length, 0);
      }
    });
  } finally {
    await asUser(alice, () => db.query("delete from public.trips where id=$1", [id]));
  }
});

test("database: all ten application tables start with RLS enabled", async () => {
  const result = await db.query<{ name: string; rls: boolean }>(`
    select relname as name, relrowsecurity as rls
    from pg_class join pg_namespace on pg_namespace.oid = relnamespace
    where nspname = 'public' and relkind = 'r' order by relname
  `);
  assert.equal(result.rows.length, 10);
  assert.ok(result.rows.every((row) => row.rls));
});

test("database: profiles backfill existing users and sanitize new Auth metadata", async () => {
  const previous = await db.query<{ display_name: string }>("select display_name from public.profiles where id=$1", [existingUser]);
  assert.equal(previous.rows[0].display_name, "Cuenta anterior");
  for (const metadata of [null, [], { display_name: 123 }, { display_name: " " }, { display_name: "x" }]) {
    const id = randomUUID();
    await db.query("insert into auth.users(id,raw_user_meta_data) values ($1,$2)", [id, JSON.stringify(metadata)]);
    const profile = await db.query<{ display_name: string }>("select display_name from public.profiles where id=$1", [id]);
    assert.equal(profile.rows[0].display_name, "Viajero");
  }
  const id = randomUUID();
  await db.query("insert into auth.users(id,raw_user_meta_data) values ($1,$2)", [id, { name: "N".repeat(200) }]);
  assert.equal((await db.query<{ display_name: string }>("select display_name from public.profiles where id=$1", [id])).rows[0].display_name.length, 80);
});

test("database: profile edits persist and cannot read or edit another profile", async () => {
  await asUser(alice, async () => {
    assert.equal((await db.query("select id from public.profiles where id=$1", [bob])).rows.length, 0);
    assert.equal((await db.query("update public.profiles set display_name='Intruso' where id=$1 returning id", [bob])).rows.length, 0);
    await db.query("update public.profiles set display_name='Nombre editado' where id=$1", [alice]);
  });
  await asUser(alice, async () => {
    assert.equal((await db.query<{ display_name: string }>("select display_name from public.profiles")).rows[0].display_name, "Nombre editado");
    await db.query("update public.profiles set display_name='Perfil A' where id=$1", [alice]);
  });
  await assert.rejects(asUser(alice, () => db.query("update public.profiles set id=$1 where id=$2", [bob, alice])), sqlCode("42501"));
});

test("database: anonymous role has no access to any application table", async () => {
  for (const table of tables) {
    await assert.rejects(asUser(null, () => db.query(`select * from public.${table}`)), sqlCode("42501"));
  }
});

test("database: owner membership is automatic and cannot be forged or edited", async () => {
  await asUser(alice, async () => {
    const members = await db.query<{ user_id: string; role: string }>("select user_id,role from public.trip_members where trip_id=$1", [tripA]);
    assert.deepEqual(members.rows, [{ user_id: alice, role: "owner" }]);
    assert.equal((await db.query("select id from public.trip_members where trip_id=$1", [tripB])).rows.length, 0);
  });
  await assert.rejects(asUser(alice, () => db.query("insert into public.trip_members(trip_id,user_id,role) values ($1,$2,'editor')", [tripA, bob])), sqlCode("42501"));
  await assert.rejects(asUser(alice, () => db.query("delete from public.trip_members where trip_id=$1", [tripA])), sqlCode("42501"));
  await assert.rejects(asUser(alice, () => db.query("update public.trips set owner_id=$1 where id=$2", [bob, tripA])), sqlCode("42501"));
  await assert.rejects(asUser(alice, () => db.query("insert into public.trips(owner_id,name,start_date,end_date,currency) values ($1,'Ajeno','2027-02-01','2027-02-28','EUR')", [bob])), sqlCode("42501"));
});

test("database: content CRUD belongs to its owner and other users see no rows", async () => {
  await asUser(alice, () => insertExpense());
  await asUser(bob, () => insertExpense(tripB, destinationB));
  for (const [account, deniedTrip] of [[alice, tripB], [bob, tripA]]) {
    await asUser(account, async () => {
      assert.equal((await db.query("select id from public.trips where id=$1", [deniedTrip])).rows.length, 0);
      assert.equal((await db.query("update public.trips set name='Intruso' where id=$1 returning id", [deniedTrip])).rows.length, 0);
      for (const table of tables.filter((table) => !["profiles", "trips", "audit_logs"].includes(table))) {
        assert.equal((await db.query(`select id from public.${table} where trip_id=$1`, [deniedTrip])).rows.length, 0);
      }
      assert.equal((await db.query("update public.expenses set concept='Intruso' where trip_id=$1 returning id", [deniedTrip])).rows.length, 0);
      assert.equal((await db.query("delete from public.expenses where trip_id=$1 returning id", [deniedTrip])).rows.length, 0);
    });
  }
  await assert.rejects(asUser(alice, () => insertExpense(tripB, destinationB)), sqlCode("42501"));
  await assert.rejects(asUser(bob, () => insertExpense(tripA, destinationA)), sqlCode("42501"));
  await asUser(alice, async () => {
    const inserted = await insertExpense();
    const id = (inserted.rows[0] as { id: string }).id;
    await db.query("update public.expenses set concept='Actualizado' where id=$1", [id]);
    assert.equal((await db.query<{ concept: string }>("select concept from public.expenses where id=$1", [id])).rows[0].concept, "Actualizado");
    await db.query("delete from public.expenses where id=$1", [id]);
    assert.equal((await db.query("select id from public.expenses where id=$1", [id])).rows.length, 0);
  });
});

test("database: composite FKs reject destinations from another trip, including own trips", async () => {
  for (const destination of [destinationA2, destinationB]) {
    await assert.rejects(asUser(alice, () => insertExpense(tripA, destination)), sqlCode("23503"));
    await assert.rejects(asUser(alice, () => db.query("insert into public.itinerary_items(trip_id,destination_id,title,local_date) values ($1,$2,'Actividad','2027-02-03')", [tripA, destination])), sqlCode("23503"));
    await assert.rejects(asUser(alice, () => db.query("insert into public.transports(trip_id,origin_destination_id,origin_label,destination_label) values ($1,$2,'Origen','Destino')", [tripA, destination])), sqlCode("23503"));
    await assert.rejects(asUser(alice, () => db.query("insert into public.accommodations(trip_id,destination_id,name,check_in,check_out) values ($1,$2,'Hotel','2027-02-03','2027-02-04')", [tripA, destination])), sqlCode("23503"));
  }
});

test("database: parent edits and invalid dates, zones or coordinates are rejected", async () => {
  await assert.rejects(asUser(alice, () => db.query("update public.trips set start_date='2027-02-02' where id=$1", [tripA])), sqlCode("23514"));
  await assert.rejects(asUser(alice, () => db.query("update public.destinations set departure_date='2027-03-01' where id=$1", [destinationA])), sqlCode("23514"));
  await assert.rejects(asUser(alice, () => db.query("update public.destinations set time_zone='Invalid/Zone' where id=$1", [destinationA])), sqlCode("23514"));
  await assert.rejects(asUser(alice, () => db.query("update public.destinations set latitude=91,longitude=0 where id=$1", [destinationA])), sqlCode("23514"));
  await assert.rejects(asUser(alice, () => db.query("update public.destinations set latitude=1 where id=$1", [destinationA])), sqlCode("23514"));
});

test("database: local dates use the activity zone, not its UTC date", async () => {
  await asUser(alice, () => db.query("insert into public.itinerary_items(trip_id,destination_id,title,local_date,starts_at,time_zone) values ($1,$2,'Noche','2027-02-03','2027-02-04T02:00:00Z','America/Guayaquil')", [tripA, destinationA]));
  await assert.rejects(asUser(alice, () => db.query("insert into public.itinerary_items(trip_id,destination_id,title,local_date,starts_at,time_zone) values ($1,$2,'Dia incorrecto','2027-02-04','2027-02-04T02:00:00Z','America/Guayaquil')", [tripA, destinationA])), sqlCode("23514"));
  await assert.rejects(asUser(alice, () => db.query("update public.destinations set arrival_date='2027-02-05' where id=$1", [destinationA])), sqlCode("23514"));
});

test("database: money stays decimal and conversion is generated and tied to the trip currency", async () => {
  await assert.rejects(asUser(alice, () => insertExpense(tripA, destinationA, "-1")), sqlCode("23514"));
  await assert.rejects(asUser(alice, () => insertExpense(tripA, destinationA, "NaN")), sqlCode("23514"));
  await assert.rejects(asUser(alice, () => db.query("insert into public.expenses(trip_id,concept,amount,currency,expense_date,exchange_rate,rate_date,base_currency) values ($1,'Tasa invalida',1,'USD','2027-02-03','NaN','2027-02-03','EUR')", [tripA])), sqlCode("23514"));
  await asUser(alice, async () => {
    const result = await db.query<{ amount: string }>("select (0.100000::public.tp_amount + 0.200000::public.tp_amount)::text as amount");
    assert.equal(result.rows[0].amount, "0.300000");
    const converted = await db.query<{ converted: string }>("insert into public.expenses(trip_id,concept,amount,currency,expense_date,exchange_rate,rate_date,base_currency) values ($1,'Conversion','10.25','USD','2027-02-03','0.9','2027-02-03','EUR') returning converted_amount::text as converted", [tripA]);
    assert.equal(converted.rows[0].converted, "9.225000");
  });
  await assert.rejects(asUser(alice, () => db.query("update public.trips set currency='USD' where id=$1", [tripA])), sqlCode("23514"));
  await assert.rejects(asUser(alice, () => db.query("insert into public.expenses(trip_id,concept,amount,currency,expense_date,exchange_rate) values ($1,'Incompleto',1,'USD','2027-02-03',0.9)", [tripA])), sqlCode("23514"));
});

test("database: destination reordering is atomic and trip identity is immutable", async () => {
  const second = randomUUID();
  await asUser(alice, async () => {
    await db.query("insert into public.destinations(id,trip_id,name,arrival_date,departure_date,position) values ($1,$2,'Segundo','2027-02-01','2027-02-28',1)", [second, tripA]);
    await db.query("update public.destinations set position=case when id=$1 then 1 else 0 end where trip_id=$2", [destinationA, tripA]);
  });
  await assert.rejects(asUser(alice, () => db.query("update public.destinations set trip_id=$1 where id=$2", [tripA2, second])), sqlCode("42501"));
  await asUser(alice, () => db.query("delete from public.destinations where id=$1", [second]));
});

test("database: document uploader and paths cannot be forged", async () => {
  const id = randomUUID();
  const insert = (uploader: string, path: string) => db.query("insert into public.documents(id,trip_id,uploaded_by,name,object_path,mime_type,size_bytes) values ($1,$2,$3,'Reserva',$4,'application/pdf',100)", [id, tripA, uploader, path]);
  await assert.rejects(asUser(alice, () => insert(bob, `${bob}/${tripA}/${id}/reserva.pdf`)), sqlCode("42501"));
  await assert.rejects(asUser(alice, () => insert(alice, "https://public.example/reserva.pdf")), sqlCode("42501"));
  await asUser(alice, async () => {
    await db.query("select public.manage_trip_document($1,$2,'reserve',$3)", [tripA, id, { name: "Reserva", category: "reservation", mime_type: "application/pdf", size_bytes: "100", uploaded_by: bob, object_path: "forged" }]);
    assert.deepEqual((await db.query("select uploaded_by,object_path from public.documents where id=$1", [id])).rows, [{ uploaded_by: alice, object_path: `${alice}/${tripA}/${id}/document.pdf` }]);
  });
  await asUser(bob, async () => { assert.equal((await db.query("select id from public.documents where id=$1", [id])).rows.length, 0); });
  await assert.rejects(asUser(alice, () => db.query("update public.documents set uploaded_by=$1 where id=$2", [bob, id])), sqlCode("42501"));
});

test("database: destination removal preserves reservations and expenses with trip_id intact", async () => {
  await asUser(alice, async () => {
    await db.query("insert into public.transports(trip_id,origin_destination_id,destination_id,origin_label,destination_label) values ($1,$2,$2,'Origen conservado','Destino conservado')", [tripA2, destinationA2]);
    await db.query("insert into public.accommodations(trip_id,destination_id,name,check_in,check_out) values ($1,$2,'Hotel conservado','2027-02-03','2027-02-04')", [tripA2, destinationA2]);
    await insertExpense(tripA2, destinationA2);
    await db.query("insert into public.itinerary_items(trip_id,destination_id,title,local_date) values ($1,$2,'Actividad temporal','2027-02-03')", [tripA2, destinationA2]);
    await db.query("delete from public.destinations where id=$1", [destinationA2]);
    for (const table of ["transports", "accommodations", "expenses"]) {
      const rows = await db.query<{ trip_id: string; destination_id: string | null }>(`select trip_id,destination_id from public.${table} where trip_id=$1`, [tripA2]);
      assert.equal(rows.rows.length, 1);
      assert.equal(rows.rows[0].trip_id, tripA2);
      assert.equal(rows.rows[0].destination_id, null);
    }
    assert.equal((await db.query("select id from public.itinerary_items where trip_id=$1", [tripA2])).rows.length, 0);
  });
});

test("database: audit is isolated, immutable and retained after cascading trip deletion", async () => {
  await asUser(alice, async () => {
    const logs = await db.query<{ actor_id: string; owner_id: string; summary: object }>("select actor_id,owner_id,summary from public.audit_logs where actor_id is not null");
    assert.ok(logs.rows.length > 0);
    assert.ok(logs.rows.every((log) => log.actor_id === alice && log.owner_id === alice));
    assert.ok(logs.rows.every((log) => Object.keys(log.summary).length === 0));
  });
  await assert.rejects(asUser(alice, () => db.query("delete from public.audit_logs")), sqlCode("42501"));
  await assert.rejects(asUser(alice, () => db.query("select travel_private.initial_display_name('{}'::jsonb)")), sqlCode("42501"));
  await asUser(alice, () => db.query("delete from public.trips where id=$1", [tripA2]));
  await asUser(alice, async () => {
    assert.equal((await db.query("select id from public.trip_members where trip_id=$1", [tripA2])).rows.length, 0);
    assert.equal((await db.query("select id from public.expenses where trip_id=$1", [tripA2])).rows.length, 0);
    const deletion = await db.query<{ trip_id: string | null }>("select trip_id from public.audit_logs where entity_id=$1 and action='DELETE'", [tripA2]);
    assert.deepEqual(deletion.rows, [{ trip_id: null }]);
  });
  await assert.rejects(db.query("delete from auth.users where id=$1", [alice]), { constraint: "trips_owner_id_fkey" });
});

test("database: five non-file content tables allow own CRUD and reject other users writes", async () => {
  const cases = [
    { table: "destinations", field: "name", values: { name: "Destino CRUD", arrival_date: "2027-02-01", departure_date: "2027-02-28", position: 99 } },
    { table: "itinerary_items", field: "title", values: { destination_id: destinationA, title: "Actividad CRUD", local_date: "2027-02-03" } },
    { table: "transports", field: "origin_label", values: { origin_label: "Origen CRUD", destination_label: "Destino CRUD" } },
    { table: "accommodations", field: "name", values: { name: "Hotel CRUD", check_in: "2027-02-03", check_out: "2027-02-04" } },
    { table: "expenses", field: "concept", values: { concept: "Gasto CRUD", amount: "0.10", currency: "EUR", expense_date: "2027-02-03" } },
  ];
  for (const entry of cases) {
    const id = randomUUID();
    const insert = (recordId: string) => {
      const values = { id: recordId, trip_id: tripA, ...entry.values };
      const fields = Object.keys(values);
      return db.query(`insert into public.${entry.table} (${fields.join(",")}) values (${fields.map((_, index) => `$${index + 1}`).join(",")}) returning id`, Object.values(values));
    };
    await asUser(alice, () => insert(id));
    await asUser(bob, async () => {
      assert.equal((await db.query(`select id from public.${entry.table} where id=$1`, [id])).rows.length, 0);
      assert.equal((await db.query(`update public.${entry.table} set ${entry.field}='Intruso' where id=$1 returning id`, [id])).rows.length, 0);
      assert.equal((await db.query(`delete from public.${entry.table} where id=$1 returning id`, [id])).rows.length, 0);
    });
    await assert.rejects(asUser(bob, () => insert(randomUUID())), sqlCode("42501"));
    await asUser(alice, async () => {
      assert.equal((await db.query(`update public.${entry.table} set ${entry.field}='Editado' where id=$1 returning id`, [id])).rows.length, 1);
      assert.equal((await db.query<Record<string, string>>(`select ${entry.field} from public.${entry.table} where id=$1`, [id])).rows[0][entry.field], "Editado");
      assert.equal((await db.query(`delete from public.${entry.table} where id=$1 returning id`, [id])).rows.length, 1);
    });
  }
});