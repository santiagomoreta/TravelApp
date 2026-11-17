"use client";

import dynamic from "next/dynamic";
import { LocateFixed, Navigation } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState, IconButton } from "@/components/ui/states";
import { filterMapPlaces, mapKinds, mapPlaces, placeDirections, tripRouteDirections } from "./map-model";
import type { TripContent } from "./content-model";
import type { Trip } from "./model";

const TripMapCanvas = dynamic(() => import("./map-canvas"), { ssr: false, loading: () => <div className="map-loading-placeholder" role="status">Cargando mapa…</div> });

export function MapPanel({ trip, content }: { trip: Trip; content: TripContent }) {
  const [kind, setKind] = useState("all");
  const [destination, setDestination] = useState("all");
  const [day, setDay] = useState("");
  const [showOrder, setShowOrder] = useState(true);
  const [focus, setFocus] = useState<{ key: string; version: number } | null>(null);
  const places = useMemo(() => mapPlaces({ route: trip.route, start: trip.start, end: trip.end, destinations: content.destinations, activities: content.activities, accommodations: content.bookings.accommodations }), [trip.route, trip.start, trip.end, content.destinations, content.activities, content.bookings.accommodations]);
  const routeUrl = tripRouteDirections(places);
  const selectedDestination = ["all", "unlinked", ...content.destinations.map((item) => item.id)].includes(destination) ? destination : "all";
  const visible = useMemo(() => filterMapPlaces(places, { kind, destination: selectedDestination, day }), [places, kind, selectedDestination, day]);
  const located = visible.filter((place) => place.coordinates !== null);
  function select(key: string) { setFocus((previous) => ({ key, version: (previous?.version || 0) + 1 })); }
  return <section className="trip-content-section map-section" aria-label="Lugares del viaje">
    <div className="content-section-heading"><h3>Mapa del viaje</h3><span className="muted" role="status">{located.length} ubicados · {visible.length - located.length} sin coordenadas</span></div>
    {trip.route && <div className="map-route-summary"><p><strong>{trip.route.origin.name}</strong><span aria-hidden="true"> → </span><span className="sr-only"> hacia </span><strong>{trip.route.destination.name}</strong></p>{routeUrl && <a className="map-directions" href={routeUrl} target="_blank" rel="noopener noreferrer"><Navigation size={15} />Ver ruta en Google Maps<span className="sr-only"> (nueva pestaña)</span></a>}</div>}
    <div className="map-filters">
      <label>Tipo<select name="map_kind" value={kind} onChange={(event) => { setKind(event.target.value); setFocus(null); }}><option value="all">Todos los lugares</option>{Object.entries(mapKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Destino<select name="map_destination" value={selectedDestination} onChange={(event) => { setDestination(event.target.value); setFocus(null); }}><option value="all">Todos los destinos</option><option value="unlinked">Sin vincular</option>{content.destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Día<input type="date" name="map_day" value={day} min={trip.start} max={trip.end} onChange={(event) => { setDay(event.target.value); setFocus(null); }} /></label>
      <label className="map-order-toggle"><input type="checkbox" checked={showOrder} onChange={(event) => setShowOrder(event.target.checked)} />Ruta y orden de paradas (esquemático)</label>
    </div>
    <div className="map-legend" aria-label="Leyenda del mapa">{Object.entries(mapKinds).map(([value, label]) => <span key={value}><i className={`map-key ${value}`} />{label}</span>)}</div>
    <div className="map-workspace">
      {located.length > 0 ? <TripMapCanvas places={visible} showOrder={showOrder} focus={focus} onSelect={select} /> : <div className="map-empty"><EmptyState title="Sin ubicaciones para mostrar" description="No hay lugares con coordenadas en esta selección." /></div>}
      <div className="map-place-list" aria-label="Listado de lugares">
        {visible.length ? <ol>{visible.map((place) => {
          const key = `${place.kind}:${place.id}`;
          const url = placeDirections(place);
          return <li key={key} className={focus?.key === key ? "map-place-selected" : ""}>
            <div className="map-place-heading"><span className={`map-key ${place.kind}`} /><h4>{place.name}</h4><IconButton icon={LocateFixed} label={`Centrar ${place.name}`} disabled={!place.coordinates} aria-pressed={focus?.key === key} onClick={() => select(key)} /></div>
            <p>{mapKinds[place.kind]}{place.kind === "destination" ? ` · Parada ${place.order + 1}` : ""}</p>
            {place.detail && <p>{place.detail}</p>}
            <p className="muted">{place.coordinates ? `${place.coordinates[1]}, ${place.coordinates[0]}` : "Sin coordenadas"}</p>
            {url && <a className="map-directions" href={url} target="_blank" rel="noopener noreferrer"><Navigation size={15} />Cómo llegar<span className="sr-only"> a {place.name} (Google Maps, nueva pestaña)</span></a>}
          </li>;
        })}</ol> : <EmptyState title="Sin coincidencias" description="No hay lugares para esta selección." />}
      </div>
    </div>
  </section>;
}