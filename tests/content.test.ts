import assert from "node:assert/strict";
import test from "node:test";
import { activitySchema, destinationSchema, itineraryDays, localDateTimeValue, rangeFits, type Activity } from "../src/features/trips/content-model.ts";

const destination = {
  name: "  Andorra  ", description: "", region: "", country_code: "ad",
  arrival_date: "2026-12-05", departure_date: "2026-12-08", time_zone: "Europe/Andorra",
  latitude: "42.5", longitude: "1.5",
};
const activity = {
  destination_id: "11111111-1111-4111-8111-111111111111", title: "Paseo", description: "",
  local_date: "2026-12-05", starts_local: "", ends_local: "", time_zone: "",
  category: "sightseeing", location: "", notes: "",
};

test("destinations validate dates, paired coordinates, timezone and protected fields", () => {
  const parsed = destinationSchema.parse({ ...destination, trip_id: "forged", position: 99 });
  assert.equal(parsed.name, "Andorra");
  assert.equal(parsed.country_code, "AD");
  assert.equal("position" in parsed, false);
  assert.equal("trip_id" in parsed, false);
  for (const change of [
    { departure_date: "2026-12-04" }, { arrival_date: "2026-02-30" },
    { longitude: "" }, { latitude: "91" }, { longitude: "181" },
    { latitude: "NaN" }, { latitude: "1.1234567" }, { time_zone: "Unknown/Zone" },
  ]) assert.equal(destinationSchema.safeParse({ ...destination, ...change }).success, false);
  assert.equal(rangeFits("2026-12-05", "2026-12-08", "2026-12-05", "2026-12-08"), true);
  assert.equal(rangeFits("2026-12-04", "2026-12-08", "2026-12-05", "2026-12-08"), false);
});

test("activities support all-day and zoned schedules but reject mismatched local dates", () => {
  assert.equal(activitySchema.safeParse(activity).success, true);
  const scheduled = { ...activity, starts_local: "2026-12-05T10:00", ends_local: "2026-12-05T11:00", time_zone: "Europe/Andorra" };
  assert.equal(activitySchema.safeParse(scheduled).success, true);
  for (const change of [
    { starts_local: "2026-12-06T10:00" }, { time_zone: "" },
    { ends_local: "2026-12-05T09:00" }, { starts_local: "" },
    { starts_local: "2026-12-05T10:00Z" }, { category: "admin" }, { title: " " },
  ]) assert.equal(activitySchema.safeParse({ ...scheduled, ...change }).success, false);
  assert.equal(activitySchema.parse({ ...activity, estimated_amount: 999 }).title, "Paseo");
});

test("activity edit values use destination timezone across DST and calendar boundaries", () => {
  assert.equal(localDateTimeValue("2027-03-28T01:30:00Z", "Europe/Madrid"), "2027-03-28T03:30");
  assert.equal(localDateTimeValue("2026-12-05T23:30:00Z", "Asia/Tokyo"), "2026-12-06T08:30");
  assert.equal(localDateTimeValue(null, "Europe/Madrid"), "");
});

test("activities can belong directly to a trip without a destination and retain schedule validation", () => {
  for (const destinationId of [undefined, null, ""]) {
    const parsed = activitySchema.parse({ ...activity, destination_id: destinationId, starts_local: "2026-12-05T10:00", ends_local: "2026-12-05T11:30", time_zone: "Europe/Madrid" });
    assert.equal(parsed.destination_id, null);
    assert.equal(parsed.starts_local, "2026-12-05T10:00");
    assert.equal(parsed.ends_local, "2026-12-05T11:30");
  }
  assert.equal(activitySchema.safeParse({ ...activity, destination_id: "not-a-destination" }).success, false);
  assert.equal(activitySchema.safeParse({ ...activity, destination_id: null, starts_local: "2026-12-06T10:00", time_zone: "Europe/Madrid" }).success, false);
});

test("itinerary date ranges include both endpoints and group activities chronologically without mutating input", () => {
  const base: Activity = { id: "first", destination_id: null, title: "Paseo", description: "", local_date: "2026-12-05", starts_at: null, ends_at: null, time_zone: null, category: "activity", location: "", latitude: null, longitude: null, notes: "", position: 0 };
  const activities = [
    { ...base, id: "last", local_date: "2026-12-08" },
    { ...base, id: "late", local_date: "2026-12-06", starts_at: "2026-12-06T14:00:00Z" },
    { ...base, id: "before", local_date: "2026-12-04" },
    { ...base, id: "early", local_date: "2026-12-06", starts_at: "2026-12-06T08:00:00Z" },
    base,
    { ...base, id: "after", local_date: "2026-12-09" },
  ];
  const original = activities.map((item) => item.id);
  assert.deepEqual(itineraryDays(activities, "2026-12-05", "2026-12-08").map((day) => [day.date, day.activities.map((item) => item.id)]), [
    ["2026-12-05", ["first"]], ["2026-12-06", ["early", "late"]], ["2026-12-08", ["last"]],
  ]);
  assert.deepEqual(activities.map((item) => item.id), original);
  assert.deepEqual(itineraryDays(activities, "2026-12-06", "2026-12-06").flatMap((day) => day.activities.map((item) => item.id)), ["early", "late"]);
  assert.deepEqual(itineraryDays(activities, "2026-12-07", "2026-12-07"), []);
  const linked = [{ ...base, destination_id: activity.destination_id }, { ...base, id: "unlinked", local_date: "2026-12-08" }];
  assert.deepEqual(itineraryDays(linked, "2026-12-05", "2026-12-08", "unlinked").flatMap((day) => day.activities.map((item) => item.id)), ["unlinked"]);
  assert.deepEqual(itineraryDays(linked, "2026-12-05", "2026-12-08", activity.destination_id).flatMap((day) => day.activities.map((item) => item.id)), ["first"]);
  assert.deepEqual(itineraryDays(linked, "2026-12-08", "2026-12-05"), []);
});