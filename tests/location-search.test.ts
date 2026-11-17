import assert from "node:assert/strict";
import test from "node:test";
import { createPlaceSearch, parsePlaceResults } from "../src/features/trips/location-search.ts";

const feature = { geometry: { type: "Point", coordinates: [2.168612345, 41.387412345] }, properties: { name: "Barcelona", city: "Barcelona", country: "España", private_note: "not returned" } };

test("place search: validates external features, rounds coordinates and strips unrelated data", () => {
  const places = parsePlaceResults({ features: [feature, { ...feature, geometry: { type: "Point", coordinates: [181, 0] } }, { ...feature, geometry: { type: "Point", coordinates: [0, NaN] } }, { geometry: { type: "Point", coordinates: [0, 0] }, properties: { name: "Origen" } }] });
  assert.equal(places.length, 2);
  assert.deepEqual(places[0], { id: "2.168612:41.387412:0", name: "Barcelona", detail: "España", latitude: 41.387412, longitude: 2.168612 });
  assert.equal(places[1].latitude, 0);
  assert.throws(() => parsePlaceResults({ error: "unavailable" }));
});

test("place search: explicit query only, cache and cooldown prevent repeated provider requests", async () => {
  let time = 0;
  const requests: URL[] = [];
  const search = createPlaceSearch({ endpoint: () => "https://photon.komoot.io/api/", now: () => time, fetcher: async (input, options) => {
    requests.push(new URL(String(input)));
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.redirect, "error");
    return Response.json({ features: [feature] });
  } });
  assert.equal((await search("  Barcelona  ")).places.length, 1);
  assert.equal((await search("barcelona")).places.length, 1);
  assert.match((await search("Girona")).error!, /Espera/);
  assert.equal(requests.length, 1);
  assert.deepEqual([...requests[0].searchParams], [["q", "Barcelona"], ["limit", "5"]]);
  time = 1200;
  assert.equal((await search("Girona")).places.length, 1);
  time = 16 * 60 * 1000;
  await search("Barcelona");
  assert.equal(requests.length, 3);
});

test("place search: invalid input, network/provider errors and configuration fail safely", async () => {
  let requests = 0;
  const search = createPlaceSearch({ endpoint: () => "https://photon.komoot.io/api/", fetcher: async () => { requests++; throw new Error("private upstream details"); } });
  for (const query of [null, {}, "ab", "x".repeat(161), "private\ntext"]) assert.ok((await search(query)).error);
  assert.equal(requests, 0);
  const failed = await search("Barcelona");
  assert.ok(failed.error);
  assert.equal(failed.error.includes("private upstream"), false);
  const invalid = createPlaceSearch({ endpoint: () => "http://unsafe.example/api/", fetcher: async () => { throw Error("must not run"); } });
  assert.ok((await invalid("Barcelona")).error);
  for (const response of [new Response("unavailable", { status: 503 }), Response.json({ unexpected: true })]) {
    const unavailable = createPlaceSearch({ endpoint: () => "https://photon.komoot.io/api/", fetcher: async () => response });
    assert.ok((await unavailable("Barcelona")).error);
  }
});

test("place search: city lookup sends only approximate coordinates and shares the search quota", async () => {
  let time = 0;
  const requests: URL[] = [];
  const search = createPlaceSearch({ endpoint: () => "https://photon.komoot.io/api/", now: () => time, fetcher: async (input) => {
    requests.push(new URL(String(input)));
    return Response.json({ features: [feature] });
  } });
  assert.ok((await search({ latitude: 91, longitude: 0 }, "city")).error);
  assert.equal(requests.length, 0);
  const result = await search({ latitude: 41.387412345, longitude: 2.168612345, notes: "private" }, "city");
  assert.equal(result.places[0].name, "Barcelona");
  assert.equal(requests[0].pathname, "/reverse");
  assert.deepEqual([...requests[0].searchParams], [["lat", "41.387"], ["lon", "2.169"], ["layer", "city"], ["radius", "50"], ["limit", "1"]]);
  assert.ok((await search("Barcelona")).error);
  time = 1200;
  await search("Barcelona");
  time = 2400;
  await search({ latitude: 41.387412345, longitude: 2.168612345 }, "city");
  assert.equal(requests.length, 3);
  assert.equal(requests[2].pathname, "/reverse");
});