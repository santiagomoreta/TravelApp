"use server";

import { getUser } from "@/features/auth/session";
import { createPlaceSearch, type PlaceSearchResult } from "./location-search";

const search = createPlaceSearch({ endpoint: () => process.env.GEOCODING_URL || "https://photon.komoot.io/api/" });

export async function searchPlaces(query: unknown): Promise<PlaceSearchResult> {
  if (!await getUser()) return { places: [], error: "Inicia sesión para buscar lugares." };
  return search(query);
}

export async function locateCity(position: unknown): Promise<PlaceSearchResult> {
  if (!await getUser()) return { places: [], error: "Inicia sesión para usar tu ubicación." };
  return search(position, "city");
}