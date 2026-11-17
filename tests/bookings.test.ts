import assert from "node:assert/strict";
import test from "node:test";
import { accommodationSchema, transportSchema, priceLabel, bookingTimeline, type TripBookings } from "../src/features/trips/booking-model.ts";

const base = { destination_id: "", amount: "", currency: "", booking_reference: "", notes: "" };
const transport = { ...base, origin_destination_id: "", type: "plane", origin_label: " Madrid ", destination_label: "Tokio", departs_local: "2027-03-20T14:00", arrives_local: "2027-03-21T09:00", departure_time_zone: "Europe/Madrid", arrival_time_zone: "Asia/Tokyo", company: "", ticket_number: "" };
const hotel = { ...base, name: "Hotel", type: "hotel", address: "", latitude: "", longitude: "", check_in: "2027-03-21", check_out: "2027-03-23", time_zone: "Asia/Tokyo", phone: "", url: "" };

test("bookings: transport requires labels, valid zones, complete schedules and safe IDs", () => {
  const parsed = transportSchema.parse({ ...transport, trip_id: "forged", owner_id: "forged" });
  assert.equal(parsed.origin_label, "Madrid");
  assert.ok(!("trip_id" in parsed));
  for (const patch of [{ origin_label: " " }, { departure_time_zone: "" }, { arrival_time_zone: "invalid" }, { departs_local: "" }, { destination_id: "forged" }]) assert.equal(transportSchema.safeParse({ ...transport, ...patch }).success, false);
  assert.equal(transportSchema.safeParse({ ...transport, departs_local: "", arrives_local: "", departure_time_zone: "", arrival_time_zone: "" }).success, true);
  assert.equal(transportSchema.safeParse({ ...transport, arrives_local: "2027-03-20T13:00", arrival_time_zone: "America/New_York" }).success, true);
});

test("bookings: decimal prices remain exact strings without floating point", () => {
  assert.equal(transportSchema.parse({ ...transport, amount: "99999999999999,999999", currency: "eur" }).amount, "99999999999999.999999");
  assert.equal(priceLabel("99999999999999.999999", "EUR"), "99.999.999.999.999,999999 EUR");
  assert.equal(priceLabel("0.000000", "EUR"), "0 EUR");
  for (const amount of ["NaN", "Infinity", "-1", "1e5", "100000000000000", "0.0000001", "1,2.3"]) assert.equal(transportSchema.safeParse({ ...transport, amount, currency: "EUR" }).success, false);
  assert.equal(transportSchema.safeParse({ ...transport, amount: "1" }).success, false);
  assert.equal(transportSchema.safeParse({ ...transport, currency: "EUR" }).success, false);
});

test("bookings: accommodation requires nights, paired coordinates and safe HTTPS links", () => {
  assert.equal(accommodationSchema.safeParse(hotel).success, true);
  for (const patch of [{ check_out: hotel.check_in }, { check_in: "2027-02-30" }, { latitude: "20" }, { latitude: "91", longitude: "2" }, { url: "javascript:alert(1)" }, { url: "https://user:password@example.com" }]) assert.equal(accommodationSchema.safeParse({ ...hotel, ...patch }).success, false);
  assert.equal(accommodationSchema.safeParse({ ...hotel, url: "https://example.com/booking" }).success, true);
});

test("bookings: predictive place labels and accommodation addresses need no itinerary stop", () => {
  const origin = "Barcelona Sants, Barcelona, Catalunya, España";
  const destination = "Madrid Puerta de Atocha, Madrid, Comunidad de Madrid, España";
  const route = transportSchema.parse({ ...transport, origin_label: origin, destination_label: destination });
  assert.equal(route.origin_label, origin);
  assert.equal(route.destination_label, destination);
  assert.equal(route.destination_id, "");
  const address = "Hotel Palace, Plaza de las Cortes, Madrid, España";
  const stay = accommodationSchema.parse({ ...hotel, address, latitude: "40.4152", longitude: "-3.6958" });
  assert.equal(stay.address, address);
  assert.equal(stay.latitude, "40.4152");
  assert.equal(stay.longitude, "-3.6958");
  assert.equal(stay.destination_id, "");
  assert.equal(accommodationSchema.parse({ ...hotel, address }).address, address);
});

test("bookings: timeline uses local departure day and places undated transports last", () => {
  const flight = { ...transportSchema.parse(transport), id: "flight", origin_destination_id: null, destination_id: null, amount: null, currency: null, departs_at: "2027-03-20T23:30:00Z", arrives_at: null, departure_time_zone: "Asia/Tokyo", arrival_time_zone: null };
  const bookings: TripBookings = {
    transports: [{ ...flight, id: "undated", departs_at: null }, flight],
    accommodations: [{ ...accommodationSchema.parse(hotel), id: "stay", destination_id: null, amount: null, currency: null, latitude: null, longitude: null, check_in: "2027-03-20" }],
  };
  assert.deepEqual(bookingTimeline(bookings).map((entry) => [entry.record.id, entry.day]), [["stay", "2027-03-20"], ["flight", "2027-03-21"], ["undated", null]]);
});