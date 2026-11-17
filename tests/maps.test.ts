import assert from "node:assert/strict";
import test from "node:test";
import { activitySchema } from "../src/features/trips/content-model.ts";
import { destinationLines, filterMapPlaces, mapBounds, mapPlaces, placeCoordinates, placeDirections, tripRouteDirections, tripRouteLines, type MapPlace } from "../src/features/trips/map-model.ts";

const destination = { id: "destination", name: "Parada", position: 0, arrival_date: "2027-06-10", departure_date: "2027-06-12", latitude: 0, longitude: 0 };
const input = { destinations: [destination], activities: [{ id: "activity", title: "Visita", destination_id: destination.id, local_date: "2027-06-11", position: 0, location: "Lugar sin coordenadas" }], accommodations: [{ id: "hotel", name: "Hotel", destination_id: null, check_in: "2027-06-10", check_out: "2027-06-12", address: "Calle", latitude: 42, longitude: 1 }] };

test("maps: activity coordinates are optional, paired and range checked", () => {
  const values = { destination_id: "11111111-1111-4111-8111-111111111111", title: "Visita", description: "", local_date: "2027-06-11", starts_local: "", ends_local: "", time_zone: "", category: "activity", location: "", notes: "" };
  assert.equal(activitySchema.safeParse(values).success, true);
  assert.equal(activitySchema.safeParse({ ...values, latitude: "0", longitude: "0" }).success, true);
  for (const patch of [{ latitude: "42", longitude: "" }, { latitude: "91", longitude: "0" }, { latitude: "0", longitude: "181" }, { latitude: "0.1234567", longitude: "0" }]) assert.equal(activitySchema.safeParse({ ...values, ...patch }).success, false);
});

test("maps: zero coordinates are valid and unknown locations never inherit a destination pin", () => {
  assert.deepEqual(placeCoordinates(destination), [0, 0]);
  for (const value of [{ latitude: NaN, longitude: 0 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }, { latitude: 0 }, { latitude: null, longitude: 0 }]) assert.equal(placeCoordinates(value), null);
  const places = mapPlaces(input);
  assert.equal(places.length, 3);
  assert.equal(places.find((place) => place.kind === "activity")?.coordinates, null);
  assert.deepEqual(places.find((place) => place.kind === "accommodation")?.coordinates, [1, 42]);
});

test("maps: filters combine kind, destination and local day without counting checkout as a night", () => {
  const places = mapPlaces(input);
  const filter = (kind = "all", destination = "all", day = "") => filterMapPlaces(places, { kind, destination, day });
  assert.equal(filter().length, 3);
  assert.deepEqual(filter("all", "destination").map((place) => place.kind).sort(), ["activity", "destination"]);
  assert.equal(filter("all", "unlinked")[0].id, "hotel");
  assert.equal(filter("activity", "destination", "2027-06-11").length, 1);
  assert.equal(filter("activity", "destination", "2027-06-10").length, 0);
  assert.equal(filter("accommodation", "all", "2027-06-12").length, 0);
  assert.equal(filter("destination", "all", "2027-06-12").length, 1);
});

test("maps: activities without stops retain their own location and daily filters", () => {
  const places = mapPlaces({ destinations: [], accommodations: [], activities: [{ ...input.activities[0], destination_id: null, latitude: 40.4138, longitude: -3.6921 }] });
  assert.equal(places.length, 1);
  assert.deepEqual(places[0].coordinates, [-3.6921, 40.4138]);
  assert.equal(places[0].destinationId, null);
  assert.equal(filterMapPlaces(places, { kind: "activity", destination: "unlinked", day: "2027-06-11" }).length, 1);
  assert.equal(filterMapPlaces(places, { kind: "activity", destination: "unlinked", day: "2027-06-12" }).length, 0);
});

test("maps: destination order is not a road route and missing stops break the line", () => {
  const places = mapPlaces({ ...input, destinations: [destination, { ...destination, id: "second", position: 1, latitude: 1, longitude: 2 }, { ...destination, id: "missing", position: 2, latitude: null, longitude: null }, { ...destination, id: "last", position: 3, latitude: 2, longitude: 3 }] });
  assert.deepEqual(destinationLines(places).geometry.coordinates, [[[0, 0], [2, 1]]]);
  const located = places.find((place) => place.kind === "destination")!;
  const url = new URL(placeDirections(located)!);
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.searchParams.get("destination"), "0,0");
  assert.equal(url.searchParams.has("name"), false);
  assert.equal(placeDirections(places.find((place) => place.id === "missing")!), null);
});

test("maps: fitting and lines take the short path across the antimeridian", () => {
  const places = mapPlaces({ ...input, destinations: [{ ...destination, longitude: 179 }, { ...destination, id: "second", longitude: -179, position: 1 }], accommodations: [], activities: [] });
  assert.deepEqual(mapBounds(places), [[179, 0], [181, 0]]);
  assert.deepEqual(destinationLines(places).geometry.coordinates, [[[179, 0], [181, 0]]]);
  assert.equal(mapBounds([]), null);
  assert.equal(mapBounds([{ ...places[0], coordinates: null }] as MapPlace[]), null);
});

test("maps: a trip route has independent origin/arrival markers, schematic line and real-route link", () => {
  const route = { origin: { name: "Salida", latitude: 0, longitude: 179 }, destination: { name: "Llegada", latitude: 1, longitude: -179 } };
  const places = mapPlaces({ ...input, route, start: "2027-06-10", end: "2027-06-12" });
  assert.equal(places.length, 5);
  assert.deepEqual(places.slice(0, 2).map((place) => place.kind), ["origin", "arrival"]);
  assert.equal(places.filter((place) => place.kind === "destination").length, 1);
  assert.deepEqual(tripRouteLines(places).geometry.coordinates, [[[179, 0], [181, 1]]]);
  assert.equal(tripRouteLines(places.filter((place) => place.kind !== "origin")).geometry.coordinates.length, 0);
  assert.equal(filterMapPlaces(places, { kind: "origin", destination: "all", day: "2027-06-11" }).length, 1);
  const url = new URL(tripRouteDirections(places)!);
  assert.equal(url.searchParams.get("origin"), "0,179");
  assert.equal(url.searchParams.get("destination"), "1,-179");
  assert.equal(tripRouteDirections(mapPlaces(input)), null);
});