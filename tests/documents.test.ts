import assert from "node:assert/strict";
import test from "node:test";
import { documentSchema, documentFileSchema, documentPath, documentSizeLabel, MAX_DOCUMENT_SIZE } from "../src/features/trips/document-model.ts";
import { documentAccessUrl, validateDocumentFile, runDocumentCleanup } from "../src/features/trips/document-storage.ts";
import { COVER_BUCKET, cleanupTripCovers, coverPath, coverObjectPath, coverUpload, validateCoverFile } from "../src/features/trips/cover-storage.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const trip = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const document = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

test("documents: preview signs only a ready trip document without forcing a download", async () => {
  const filters: [string, string][] = [];
  const signed: { path: string; seconds: number; options: unknown }[] = [];
  const query = {
    select: () => query,
    eq: (field: string, value: string) => { filters.push([field, value]); return query; },
    single: async () => ({ error: null, data: { name: "Billete/ida", bucket_id: "trip-documents", object_path: documentPath(owner, trip, document, "application/pdf"), mime_type: "application/pdf", uploaded_by: owner } }),
  };
  const client = { from: (table: string) => { assert.equal(table, "documents"); return query; }, storage: { from: (bucket: string) => {
    assert.equal(bucket, "trip-documents");
    return { createSignedUrl: async (path: string, seconds: number, options: unknown) => { signed.push({ path, seconds, options }); return { error: null, data: { signedUrl: "https://storage.example/private" } }; } };
  } } } as unknown as Parameters<typeof documentAccessUrl>[0];
  assert.equal(await documentAccessUrl(client, trip, document, "preview"), "https://storage.example/private");
  assert.deepEqual(filters, [["id", document], ["trip_id", trip], ["storage_status", "ready"]]);
  assert.deepEqual(signed, [{ path: documentPath(owner, trip, document, "application/pdf"), seconds: 60, options: undefined }]);
  await documentAccessUrl(client, trip, document, "download");
  assert.deepEqual(signed[1].options, { download: "Billete_ida.pdf" });
});

test("documents: preview rejects missing, foreign-path, unsafe-type and unavailable files", async () => {
  const base = { name: "Billete", bucket_id: "trip-documents", object_path: documentPath(owner, trip, document, "application/pdf"), mime_type: "application/pdf", uploaded_by: owner };
  let current: typeof base | null = base;
  let storageError = false;
  let requests = 0;
  const query = { select: () => query, eq: () => query, single: async () => ({ error: null, data: current }) };
  const client = { from: () => query, storage: { from: () => ({ createSignedUrl: async () => { requests++; return storageError ? { error: { message: "unavailable" }, data: null } : { error: null, data: { signedUrl: "private" } }; } }) } } as unknown as Parameters<typeof documentAccessUrl>[0];
  for (const row of [null, { ...base, bucket_id: "public" }, { ...base, object_path: `${owner}/other/${document}/document.pdf` }, { ...base, mime_type: "text/html" }, { ...base, object_path: `${base.object_path}?forged=1` }]) {
    current = row;
    await assert.rejects(documentAccessUrl(client, trip, document, "preview"));
  }
  assert.equal(requests, 0);
  current = base;
  storageError = true;
  await assert.rejects(documentAccessUrl(client, trip, document, "preview"));
});

test("documents: metadata strips protected fields and requires name and category", () => {
  assert.deepEqual(documentSchema.parse({ name: " Billete ", category: "ticket", object_path: "forged", uploaded_by: "forged", storage_status: "ready" }), { name: "Billete", category: "ticket" });
  for (const patch of [{ name: " " }, { name: "x".repeat(161) }, { category: "forged" }]) assert.equal(documentSchema.safeParse({ name: "Documento", category: "other", ...patch }).success, false);
});

test("covers: private paths reject traversal, external URLs and invalid identifiers", () => {
  const path = coverPath(owner, trip, document, "image/jpeg");
  assert.equal(path, `${owner}/${trip}/${document}.jpg`);
  assert.equal(coverObjectPath(`/api/trip-covers/${path}`), path);
  assert.equal(coverPath(owner, trip, document, "image/png"), `${owner}/${trip}/${document}.png`);
  for (const url of ["https://example.com/image.jpg", "/images/cotopaxi.jpg", `/api/trip-covers/${owner}/${trip}/../x.jpg`, `/api/trip-covers/${path}?forged=1`]) assert.equal(coverObjectPath(url), null);
  assert.throws(() => coverPath(owner, "../other", document, "image/jpeg"));
  assert.throws(() => coverPath(owner, trip, document, "image/svg+xml"));
});

test("covers: empty multipart inputs are not treated as replacement photos", () => {
  const form = new FormData();
  assert.equal(coverUpload(form), null);
  for (const name of ["", "undefined", "blob", "empty.png"]) {
    form.set("cover_file", new File([], name, { type: "application/octet-stream" }));
    assert.equal(coverUpload(form), null);
  }
  form.set("cover_file", "forged");
  assert.equal(coverUpload(form), null);
  form.set("cover_file", new File([new Uint8Array([137,80,78,71])], "photo.png", { type: "image/png" }));
  assert.equal(coverUpload(form)?.size, 4);
});

test("covers: only actual JPEG and PNG content within the limit is accepted", async () => {
  const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0]);
  assert.equal((await validateCoverFile(new File([png], "photo.png", { type: "image/png" }))).mime, "image/png");
  for (const file of [new File(["%PDF-1.7\nExample\n%%EOF"], "photo.pdf", { type: "application/pdf" }), new File(["<svg></svg>"], "photo.jpg", { type: "image/jpeg" }), new File([png], "photo.jpg", { type: "image/jpeg" }), new File([], "empty.png"), new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.png")]) await assert.rejects(validateCoverFile(file));
});

test("covers: cleanup is scoped, retryable and does not ignore storage failures", async () => {
  let names = [`${document}.jpg`];
  let failure: string | null = null;
  const removed: string[] = [];
  const client = { storage: { from: (bucket: string) => {
    assert.equal(bucket, COVER_BUCKET);
    return {
      list: async (prefix: string) => { assert.equal(prefix, `${owner}/${trip}`); return failure ? { error: { message: failure }, data: null } : { error: null, data: names.map((name) => ({ name })) }; },
      remove: async (paths: string[]) => { removed.push(...paths); names = []; return { error: null }; },
    };
  } } } as unknown as Parameters<typeof cleanupTripCovers>[0];
  failure = "network unavailable";
  await assert.rejects(cleanupTripCovers(client, owner, trip));
  assert.deepEqual(removed, []);
  failure = null;
  await cleanupTripCovers(client, owner, trip);
  await cleanupTripCovers(client, owner, trip);
  assert.deepEqual(removed, [`${owner}/${trip}/${document}.jpg`]);
  names = ["../../other.jpg"];
  await assert.rejects(cleanupTripCovers(client, owner, trip));
  assert.equal(removed.length, 1);
  failure = "Bucket not found";
  await cleanupTripCovers(client, owner, trip);
});

test("documents: files have a strict type and size limit", () => {
  for (const type of ["application/pdf", "image/jpeg", "image/png"]) assert.equal(documentFileSchema.safeParse({ size: MAX_DOCUMENT_SIZE, type }).success, true);
  for (const patch of [{ size: 0 }, { size: MAX_DOCUMENT_SIZE + 1 }, { size: 1.5 }, { type: "text/html" }, { type: "image/svg+xml" }]) assert.equal(documentFileSchema.safeParse({ size: 100, type: "application/pdf", ...patch }).success, false);
  assert.equal(documentSizeLabel(MAX_DOCUMENT_SIZE), "4 MiB");
});

test("documents: server-generated paths cannot include a user-supplied filename or traversal", () => {
  assert.equal(documentPath(owner, trip, document, "application/pdf"), `${owner}/${trip}/${document}/document.pdf`);
  assert.equal(documentPath(owner, trip, document, "image/jpeg"), `${owner}/${trip}/${document}/document.jpg`);
  for (const id of ["../other", "", `${trip}/../other`]) assert.throws(() => documentPath(owner, id, document, "application/pdf"));
  assert.throws(() => documentPath(owner, trip, document, "text/html"));
});

test("documents: detects real content instead of trusting filename or declared MIME", async () => {
  const pdf = new File(["%PDF-1.7\nExample\n%%EOF"], "billete.pdf", { type: "application/pdf" });
  const result = await validateDocumentFile(pdf);
  assert.equal(result.mime, "application/pdf");
  assert.equal(result.size, pdf.size);
  for (const file of [new File(["<html>not PDF</html>"], "fake.pdf", { type: "application/pdf" }), new File([await pdf.arrayBuffer()], "fake.png", { type: "image/png" }), new File([], "empty.pdf"), new File([new Uint8Array(MAX_DOCUMENT_SIZE + 1)], "large.pdf")]) await assert.rejects(validateDocumentFile(file));
});

test("documents: interrupted cleanup never discards metadata and can be retried", async () => {
  const calls: string[] = [];
  await assert.rejects(runDocumentCleanup({ beginDelete: async () => { calls.push("begin"); }, deleteObject: async () => { calls.push("object"); throw new Error("network"); }, finishDelete: async () => { calls.push("metadata"); } }));
  assert.deepEqual(calls, ["begin", "object"]);
  let objectExists = true;
  let metadataExists = true;
  let first = true;
  const steps = { beginDelete: async () => {}, deleteObject: async () => { objectExists = false; }, finishDelete: async () => { if (first) { first = false; throw new Error("network"); } metadataExists = false; } };
  await assert.rejects(runDocumentCleanup(steps));
  assert.equal(objectExists, false);
  assert.equal(metadataExists, true);
  await runDocumentCleanup(steps);
  assert.equal(metadataExists, false);
});