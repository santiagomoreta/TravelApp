import assert from "node:assert/strict";
import test from "node:test";
import { filterTrips, tripIdSchema, tripRouteSchema, tripSchema, tripTravelSchema, tripTravelFromForm, type Trip } from "../src/features/trips/model.ts";

const fields = {
  name: "  Una escapada  ", description: " Un fin de semana ",
  start: "2027-02-20", end: "2027-02-22", currency: "eur",
  status: "planning", image: "",
};

test("trip routes require two selected places, accept zero and reject invalid coordinates", () => {
  const origin = { name: "  Quito  ", latitude: 0, longitude: 0 };
  const destination = { name: "Madrid", latitude: 40.416775, longitude: -3.70379 };
  const route = tripRouteSchema.parse({ origin, destination, owner_id: "forged" });
  assert.equal(route.origin.name, "Quito");
  assert.equal(route.origin.latitude, 0);
  assert.equal("owner_id" in route, false);
  for (const patch of [{ name: " " }, { latitude: 91 }, { longitude: -181 }, { latitude: NaN }, { longitude: Infinity }]) {
    assert.equal(tripRouteSchema.safeParse({ origin: { ...origin, ...patch }, destination }).success, false);
  }
  assert.equal(tripRouteSchema.safeParse({ origin }).success, false);
  assert.equal(tripRouteSchema.safeParse({ origin: "Quito", destination }).success, false);
});

test("trip travel requires valid outbound and return modes and supports different choices", () => {
  for (const mode of ["plane", "train", "bus", "car", "boat", "taxi", "other"]) assert.deepEqual(tripTravelSchema.parse({ outbound: mode, inbound: mode }), { outbound: mode, inbound: mode });
  assert.deepEqual(tripTravelSchema.parse({ outbound: "train", inbound: "bus", owner_id: "forged" }), { outbound: "train", inbound: "bus" });
  for (const invalid of [{ outbound: "car" }, { inbound: "plane" }, { outbound: "", inbound: "train" }, { outbound: "train", inbound: "flight" }, { outbound: null, inbound: "car" }, { outbound: "TRAIN", inbound: "bus" }]) assert.equal(tripTravelSchema.safeParse(invalid).success, false);
});

test("trip travel form preserves legacy omissions but rejects partially selected journeys", () => {
  const form = new FormData();
  assert.equal(tripTravelFromForm(form), null);
  form.set("outbound_transport", "");
  form.set("return_transport", "");
  assert.equal(tripTravelFromForm(form), null);
  form.set("outbound_transport", "train");
  assert.throws(() => tripTravelFromForm(form));
  form.set("return_transport", "bus");
  assert.deepEqual(tripTravelFromForm(form), { outbound: "train", inbound: "bus" });
  form.set("return_transport", "train");
  assert.deepEqual(tripTravelFromForm(form), { outbound: "train", inbound: "train" });
  form.set("return_transport", new File(["plane"], "forged"));
  assert.throws(() => tripTravelFromForm(form));
});

test("trip validation normalizes input and strips protected fields", () => {
  const result = tripSchema.parse({ ...fields, owner_id: "someone-else", budget: 123, archived_at: "forged" });
  assert.equal(result.name, "Una escapada");
  assert.equal(result.currency, "EUR");
  assert.equal(result.description, "Un fin de semana");
  assert.equal("owner_id" in result, false);
  assert.equal("budget" in result, false);
  assert.equal("archived_at" in result, false);
  assert.equal(tripSchema.parse({ ...fields, image: "custom" }).image, "custom");
  assert.equal(tripSchema.safeParse({ ...fields, image: "https://example.com/forged.jpg" }).success, false);
});

test("trip validation rejects impossible dates, reversed ranges and unsupported fields", () => {
  for (const change of [
    { start: "2027-02-29" }, { end: "2027-02-19" }, { start: "2027-13-01" },
    { name: " " }, { name: "a".repeat(161) }, { description: "a".repeat(10001) },
    { currency: "EURO" }, { status: "admin" }, { image: "javascript:alert(1)" },
  ]) assert.equal(tripSchema.safeParse({ ...fields, ...change }).success, false);
  assert.equal(tripSchema.safeParse({ ...fields, end: fields.start }).success, true);
  assert.equal(tripSchema.safeParse({ ...fields, start: "2028-02-29", end: "2028-02-29" }).success, true);
  assert.equal(tripIdSchema.safeParse("../perfil").success, false);
});

test("dashboard excludes archived, completed and cancelled trips from upcoming", () => {
  const base = { ...tripSchema.parse(fields), image: null, archivedAt: null, destinations: ["Quito"] };
  const trips: Trip[] = [
    { ...base, id: "next" },
    { ...base, id: "ongoing", start: "2027-02-01" },
    { ...base, id: "archived", archivedAt: "2026-11-16T00:00:00Z" },
    { ...base, id: "cancelled", status: "cancelled" },
    { ...base, id: "completed", status: "completed" },
    { ...base, id: "past", start: "2026-01-01", end: "2026-01-05" },
  ];
  assert.deepEqual(filterTrips(trips, "2027-02-10", "upcoming").map((trip) => trip.id), ["ongoing", "next"]);
  assert.deepEqual(filterTrips(trips, "2027-02-10", "past").map((trip) => trip.id), ["completed", "past"]);
  assert.deepEqual(filterTrips(trips, "2027-02-10", "archived").map((trip) => trip.id), ["archived"]);
  assert.equal(filterTrips(trips, "2027-02-10", "all").length, 5);
  assert.equal(filterTrips(trips, "2027-02-10", "all", "  QUITO  ").length, 5);
  assert.equal(filterTrips(trips, "2027-02-10", "all", "Madrid").length, 0);
  const routed: Trip = { ...trips[0], route: { origin: { name: "Barcelona", latitude: 41, longitude: 2 }, destination: { name: "Madrid", latitude: 40, longitude: -3 } } };
  assert.equal(filterTrips([routed], "2027-02-10", "all", "Madrid").length, 1);
  assert.equal(filterTrips([routed], "2027-02-10", "all", "Barcelona").length, 1);
});