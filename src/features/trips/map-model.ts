import type { TripRoute } from "./model.ts";

export const mapKinds = { origin: "Origen", arrival: "Destino del viaje", destination: "Parada", activity: "Actividad", accommodation: "Alojamiento" } as const;
export type MapKind = keyof typeof mapKinds;
const kindOrder: MapKind[] = ["origin", "arrival", "destination", "activity", "accommodation"];
type Location = { latitude?: number | null; longitude?: number | null };
export type MapPlace = {
  id: string; kind: MapKind; name: string; detail: string; destinationId: string | null;
  start: string; end: string; order: number; coordinates: [number, number] | null;
};
export type MapInput = {
  route?: TripRoute | null;
  start?: string;
  end?: string;
  destinations: (Location & { id: string; name: string; position: number; arrival_date: string; departure_date: string })[];
  activities: (Location & { id: string; title: string; destination_id: string | null; local_date: string; position: number; location: string | null })[];
  accommodations: (Location & { id: string; name: string; destination_id: string | null; check_in: string; check_out: string; address: string | null })[];
};

export function placeCoordinates(location: Location): [number, number] | null {
  const { latitude, longitude } = location;
  return typeof latitude === "number" && typeof longitude === "number" && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? [longitude, latitude] : null;
}

export function mapPlaces(input: MapInput): MapPlace[] {
  const endpoints: MapPlace[] = input.route ? [
    { id: "trip-origin", kind: "origin", name: input.route.origin.name, detail: "", destinationId: null, start: input.start || "", end: input.end || "", order: -1, coordinates: placeCoordinates(input.route.origin) },
    { id: "trip-arrival", kind: "arrival", name: input.route.destination.name, detail: "", destinationId: null, start: input.start || "", end: input.end || "", order: 0, coordinates: placeCoordinates(input.route.destination) },
  ] : [];
  return [
    ...endpoints,
    ...input.destinations.map((item): MapPlace => ({ id: item.id, kind: "destination", name: item.name, detail: "", destinationId: item.id, start: item.arrival_date, end: item.departure_date, order: item.position, coordinates: placeCoordinates(item) })),
    ...input.activities.map((item): MapPlace => ({ id: item.id, kind: "activity", name: item.title, detail: item.location || "", destinationId: item.destination_id, start: item.local_date, end: item.local_date, order: item.position, coordinates: placeCoordinates(item) })),
    ...input.accommodations.map((item): MapPlace => ({ id: item.id, kind: "accommodation", name: item.name, detail: item.address || "", destinationId: item.destination_id, start: item.check_in, end: item.check_out, order: 0, coordinates: placeCoordinates(item) })),
  ].sort((first, second) => kindOrder.indexOf(first.kind) - kindOrder.indexOf(second.kind) || (first.kind === "destination" ? first.order - second.order : first.start.localeCompare(second.start) || first.order - second.order) || first.id.localeCompare(second.id));
}

export function filterMapPlaces(places: MapPlace[], filters: { kind: string; destination: string; day: string }) {
  return places.filter((place) => (filters.kind === "all" || place.kind === filters.kind)
    && (filters.destination === "all" || (filters.destination === "unlinked" ? place.destinationId === null : place.destinationId === filters.destination))
    && (!filters.day || (place.start <= filters.day && (place.kind === "accommodation" ? filters.day < place.end : filters.day <= place.end))));
}

export function destinationLines(places: MapPlace[]) {
  const lines: number[][][] = [];
  let current: number[][] = [];
  for (const place of places.filter((item) => item.kind === "destination").sort((first, second) => first.order - second.order)) {
    if (!place.coordinates) { if (current.length > 1) lines.push(current); current = []; continue; }
    let longitude = place.coordinates[0];
    const previous = current.at(-1)?.[0];
    if (previous !== undefined) { while (longitude - previous > 180) longitude -= 360; while (longitude - previous < -180) longitude += 360; }
    current.push([longitude, place.coordinates[1]]);
  }
  if (current.length > 1) lines.push(current);
  return { type: "Feature" as const, properties: {}, geometry: { type: "MultiLineString" as const, coordinates: lines } };
}

export function tripRouteLines(places: MapPlace[]) {
  const endpoints = [places.find((place) => place.kind === "origin"), places.find((place) => place.kind === "arrival")];
  if (endpoints.some((place) => !place?.coordinates)) return destinationLines([]);
  return destinationLines(endpoints.map((place, order) => ({ ...place!, kind: "destination", order })));
}

export function tripRouteDirections(places: MapPlace[]) {
  const origin = places.find((place) => place.kind === "origin")?.coordinates;
  const destination = places.find((place) => place.kind === "arrival")?.coordinates;
  if (!origin || !destination) return null;
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", `${origin[1]},${origin[0]}`);
  url.searchParams.set("destination", `${destination[1]},${destination[0]}`);
  return url.href;
}

export function placeDirections(place: MapPlace) {
  if (!place.coordinates) return null;
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", `${place.coordinates[1]},${place.coordinates[0]}`);
  return url.href;
}

export function mapBounds(places: MapPlace[]): [[number, number], [number, number]] | null {
  const coordinates = places.flatMap((place) => place.coordinates ? [place.coordinates] : []);
  if (!coordinates.length) return null;
  const longitudes = coordinates.map((point) => point[0]).sort((first, second) => first - second);
  let largestGap = -1;
  let startIndex = 0;
  for (let index = 0; index < longitudes.length; index += 1) {
    const gap = (longitudes[(index + 1) % longitudes.length] + (index === longitudes.length - 1 ? 360 : 0)) - longitudes[index];
    if (gap > largestGap) { largestGap = gap; startIndex = (index + 1) % longitudes.length; }
  }
  const west = longitudes[startIndex];
  const east = longitudes[(startIndex + longitudes.length - 1) % longitudes.length];
  return [[west, Math.min(...coordinates.map((point) => point[1]))], [east < west ? east + 360 : east, Math.max(...coordinates.map((point) => point[1]))]];
}