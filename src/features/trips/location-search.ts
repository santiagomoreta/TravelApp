import { z } from "zod";

export type PlaceResult = { id: string; name: string; detail: string; latitude: number; longitude: number };
export type PlaceSearchResult = { places: PlaceResult[]; error?: string };

const querySchema = z.string().trim().min(3).max(160).regex(/^[^\x00-\x1f\x7f]+$/);
const positionSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const text = z.string().max(250).optional();
const featureSchema = z.object({
  geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) }),
  properties: z.object({ name: text, street: text, housenumber: text, city: text, postcode: text, state: text, country: text }),
});

export function parsePlaceResults(value: unknown): PlaceResult[] {
  const parsed = z.object({ features: z.array(z.unknown()).max(50) }).safeParse(value);
  if (!parsed.success) throw new Error("Invalid search response");
  return parsed.data.features.flatMap((feature, index) => {
    const result = featureSchema.safeParse(feature);
    if (!result.success) return [];
    const { properties, geometry } = result.data;
    const name = properties.name || properties.street || properties.city || properties.country;
    if (!name?.trim()) return [];
    const detail = [...new Set([
      [properties.street, properties.housenumber].filter(Boolean).join(" "),
      [properties.postcode, properties.city].filter(Boolean).join(" "), properties.state, properties.country,
    ].filter((part): part is string => Boolean(part?.trim()) && part !== name))].join(", ");
    const [longitude, latitude] = geometry.coordinates.map((coordinate) => Number(coordinate.toFixed(6)));
    return [{ id: `${longitude}:${latitude}:${index}`, name, detail, latitude, longitude }];
  }).slice(0, 5);
}

export function createPlaceSearch({ endpoint, fetcher = fetch, now = Date.now }: {
  endpoint: () => string; fetcher?: typeof fetch; now?: () => number;
}) {
  const cache = new Map<string, { expires: number; places: PlaceResult[] }>();
  let busy = false;
  let lastRequest = -Infinity;
  return async (query: unknown, mode: "search" | "city" = "search"): Promise<PlaceSearchResult> => {
    const parsed = querySchema.safeParse(query);
    const position = mode === "city" ? positionSchema.safeParse(query) : null;
    if (mode === "city" ? !position?.success : !parsed.success) return { places: [], error: mode === "city" ? "No se pudo obtener tu ciudad. Escribe el origen." : "Escribe entre 3 y 160 caracteres para buscar un lugar." };
    try {
      const url = new URL(endpoint());
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Invalid provider");
      const normalized = parsed.success ? parsed.data.replace(/\s+/g, " ") : "";
      const key = `${url.href}:${normalized.toLocaleLowerCase("es")}`;
      const saved = mode === "search" ? cache.get(key) : undefined;
      if (saved && saved.expires > now()) return { places: saved.places };
      if (busy || now() - lastRequest < 1200) return { places: [], error: "Espera un momento antes de volver a buscar." };
      busy = true;
      lastRequest = now();
      try {
        if (position?.success) {
          if (!/\/api\/?$/.test(url.pathname)) throw new Error("Reverse endpoint unavailable");
          url.pathname = url.pathname.replace(/\/api\/?$/, "/reverse");
          url.searchParams.set("lat", position.data.latitude.toFixed(3));
          url.searchParams.set("lon", position.data.longitude.toFixed(3));
          url.searchParams.set("layer", "city");
          url.searchParams.set("radius", "50");
          url.searchParams.set("limit", "1");
        } else {
          url.searchParams.set("q", normalized);
          url.searchParams.set("limit", "5");
        }
        const response = await fetcher(url, { signal: AbortSignal.timeout(6000), cache: "no-store", redirect: "error", headers: { Accept: "application/json", "User-Agent": "TravelPlanner/0.1 (place search)" } });
        if (!response.ok) throw new Error("Search unavailable");
        const places = parsePlaceResults(await response.json());
        if (mode === "search") {
          if (cache.size >= 100) cache.delete(cache.keys().next().value!);
          cache.set(key, { places, expires: now() + 15 * 60 * 1000 });
        }
        return { places };
      } finally { busy = false; }
    } catch { return { places: [], error: "No se pudo consultar el buscador. Puedes reintentar o elegir un punto en el mapa." }; }
  };
}