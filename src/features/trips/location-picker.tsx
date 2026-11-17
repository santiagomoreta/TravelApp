"use client";

import dynamic from "next/dynamic";
import { LoaderCircle, MapPin, Search, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { IconButton } from "@/components/ui/states";
import { searchPlaces } from "./location-actions";
import { placeCoordinates, type MapPlace } from "./map-model";
import type { PlaceResult } from "./location-search";
import { TripPlaceInput } from "./trip-place-input";

const TripMapCanvas = dynamic(() => import("./map-canvas"), { ssr: false, loading: () => <div className="location-map-loading" role="status">Cargando mapa…</div> });

export function LocationPicker({ latitude, longitude, initialName = "", onName, predictive = false, onLocation, searchLabel = "Buscar ubicación", searchPlaceholder = "Ciudad o lugar", initialQuery = "" }: {
  latitude?: number | null; longitude?: number | null; initialName?: string; onName: (name: string) => void;
  predictive?: boolean; onLocation?: (name: string) => void; searchLabel?: string; searchPlaceholder?: string; initialQuery?: string;
}) {
  const [position, setPosition] = useState<[number, number] | null>(() => placeCoordinates({ latitude, longitude }));
  const [label, setLabel] = useState(initialName || "Ubicación guardada");
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [focus, setFocus] = useState<{ key: string; version: number } | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const inputId = useId();
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const mapPlaces = useMemo<MapPlace[]>(() => position ? [{ id: "selection", kind: "destination", name: label, detail: "", destinationId: null, start: "", end: "", order: 0, coordinates: position }] : [], [position, label]);

  async function search() {
    if (pending || query.trim().length < 3) return;
    const current = ++request.current;
    setPending(true); setError(""); setSearched(false); setPlaces([]);
    try {
      const result = await searchPlaces(query);
      if (request.current !== current) return;
      setPlaces(result.places); setError(result.error || ""); setSearched(!result.error);
    } catch { if (request.current === current) setError("No se pudo buscar. Reintenta o elige una ubicación en el mapa."); }
    finally { setPending(false); }
  }

  function choose(place: PlaceResult) {
    request.current++;
    setPosition([place.longitude, place.latitude]); setLabel([place.name, place.detail].filter(Boolean).join(", "));
    setFocus((previous) => ({ key: "destination:selection", version: (previous?.version || 0) + 1 }));
    setPlaces([]); setSearched(false); setError(""); setShowMap(true); onName(place.name);
  }

  return <section className="location-picker" aria-label="Ubicación">
    <input type="hidden" name="latitude" value={position?.[1] ?? ""} />
    <input type="hidden" name="longitude" value={position?.[0] ?? ""} />
    {predictive ? <TripPlaceInput key={selectionVersion} label={searchLabel} placeholder={searchPlaceholder} initialQuery={initialQuery} value={position ? { name: label, latitude: position[1], longitude: position[0] } : null} onChange={(place) => {
      request.current++;
      setPosition(place ? [place.longitude, place.latitude] : null);
      setFocus((previous) => place ? { key: "destination:selection", version: (previous?.version || 0) + 1 } : null);
      if (place) setLabel(place.name);
      if (place) onName(place.name);
      onLocation?.(place?.name || "");
    }} /> : <><label htmlFor={inputId}>Buscar ubicación</label><div className="location-search-controls">
      <input id={inputId} type="search" value={query} maxLength={160} placeholder="Nombre del lugar o dirección" autoComplete="off" onChange={(event) => { request.current++; setQuery(event.target.value); setPlaces([]); setSearched(false); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} />
      <button type="button" className="button secondary" aria-label="Buscar ubicación" disabled={pending || query.trim().length < 3} onClick={() => void search()}>{pending ? <LoaderCircle size={16} className="spin" /> : <Search size={16} />}Buscar</button>
    </div>
    {pending && <p role="status">Buscando lugares…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {places.length > 0 && <ul className="location-results" aria-label="Resultados de ubicaciones">{places.map((place) => <li key={place.id}><button type="button" onClick={() => choose(place)}><MapPin size={17} /><span><strong>{place.name}</strong>{place.detail && <small>{place.detail}</small>}</span></button></li>)}</ul>}
    {searched && places.length === 0 && <p role="status">Sin resultados para esta búsqueda.</p>}</>}
    <div className="location-selection">{(!predictive || !position) && <span role="status">{position ? label : "Sin ubicación"}</span>}{position && !predictive && <IconButton icon={Trash2} label="Quitar ubicación" onClick={() => { request.current++; setPosition(null); setPlaces([]); setSearched(false); setSelectionVersion((current) => current + 1); onLocation?.(""); }} />}<IconButton icon={MapPin} label={showMap ? "Ocultar selector de mapa" : "Elegir en el mapa"} aria-expanded={showMap} onClick={() => setShowMap((value) => !value)} /></div>
    {showMap && <TripMapCanvas places={mapPlaces} showOrder={false} focus={focus} onSelect={() => {}} onPick={(coordinates) => { request.current++; setFocus(null); setPosition(coordinates.map((value) => Number(value.toFixed(6))) as [number, number]); setLabel("Ubicación en el mapa"); setPlaces([]); setSearched(false); setSelectionVersion((current) => current + 1); onLocation?.("Ubicación en el mapa"); }} />}
    <small className="location-attribution"><a href="https://github.com/komoot/photon" target="_blank" rel="noopener noreferrer">Photon</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a></small>
  </section>;
}