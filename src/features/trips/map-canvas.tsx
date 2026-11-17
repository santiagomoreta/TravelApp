"use client";

import { Map as LibreMap, Marker, NavigationControl, AttributionControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPin, RefreshCw, Scan } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { IconButton } from "@/components/ui/states";
import { destinationLines, mapBounds, mapKinds, tripRouteLines, type MapPlace } from "./map-model";

const fitPadding = { top: 64, right: 76, bottom: 40, left: 40 };

export default function TripMapCanvas({ places, showOrder, focus, onSelect, onPick }: {
  places: MapPlace[]; showOrder: boolean; focus: { key: string; version: number } | null; onSelect: (key: string) => void;
  onPick?: (coordinates: [number, number]) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<LibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const fitted = useRef("");
  const [ready, setReady] = useState(false);
  const [issue, setIssue] = useState("");
  const [version, setVersion] = useState(0);
  const selectPlace = useEffectEvent((key: string) => onSelect(key));
  const pickPlace = useEffectEvent((coordinates: [number, number]) => onPick?.(coordinates));
  const editable = Boolean(onPick);
  const resizeMap = useEffectEvent((map: LibreMap | null) => {
    map?.resize();
    const bounds = mapBounds(places);
    if (map && bounds && !editable) map.fitBounds(bounds, { padding: fitPadding, maxZoom: 14, duration: 0 });
  });

  useEffect(() => {
    let active = true;
    let map: LibreMap | null = null;
    try {
      setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);
      map = new LibreMap({
        container: container.current!, center: [0, 25], zoom: 1, maxZoom: 19,
        canvasContextAttributes: { preserveDrawingBuffer: true },
        attributionControl: false, dragRotate: false, pitchWithRotate: false, scrollZoom: false,
        locale: { "NavigationControl.ZoomIn": "Acercar", "NavigationControl.ZoomOut": "Alejar", "NavigationControl.ResetBearing": "Orientar al norte" },
        style: {
          version: 8,
          sources: {
            osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' },
            "trip-order": { type: "geojson", data: destinationLines([]) },
            "trip-route": { type: "geojson", data: destinationLines([]) },
          },
          layers: [
            { id: "osm", type: "raster", source: "osm" },
            { id: "trip-route", type: "line", source: "trip-route", paint: { "line-color": "#b6375a", "line-width": 4, "line-dasharray": [3, 2] } },
            { id: "trip-order", type: "line", source: "trip-order", paint: { "line-color": "#235e4a", "line-width": 3, "line-dasharray": [2, 2] } },
          ],
        },
      });
      instance.current = map;
      map.getCanvas().setAttribute("aria-label", "Mapa de lugares del viaje");
      map.touchZoomRotate.disableRotation();
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new AttributionControl({ compact: false }), "bottom-right");
      map.on("load", () => { if (active) setReady(true); });
      map.on("click", (event) => pickPlace([event.lngLat.wrap().lng, event.lngLat.lat]));
      map.on("error", () => { if (active) setIssue("No se ha podido cargar el mapa completo. Los lugares siguen disponibles en el listado."); });
    } catch { queueMicrotask(() => { if (active) setIssue("El mapa no está disponible en este navegador. Los lugares siguen disponibles en el listado."); }); }
    const observer = new ResizeObserver(() => resizeMap(map));
    if (container.current) observer.observe(container.current);
    return () => { active = false; observer.disconnect(); map?.remove(); instance.current = null; fitted.current = ""; };
  }, [version]);

  useEffect(() => {
    const map = instance.current;
    if (!map || !ready) return;
    const source = map.getSource("trip-order") as GeoJSONSource;
    void source.setData(destinationLines(showOrder ? places : [])).catch(() => setIssue("No se pudo actualizar el orden de destinos."));
    const route = map.getSource("trip-route") as GeoJSONSource;
    void route.setData(tripRouteLines(showOrder ? places : [])).catch(() => setIssue("No se pudo actualizar la ruta del viaje."));
  }, [places, showOrder, ready]);

  useEffect(() => {
    const map = instance.current;
    if (!map || !ready) return;
    markers.current = places.flatMap((place) => {
      if (!place.coordinates) return [];
      const element = document.createElement("button");
      const key = `${place.kind}:${place.id}`;
      element.type = "button";
      element.className = `map-point ${place.kind}`;
      element.dataset.key = key;
      element.title = `${mapKinds[place.kind]}: ${place.name}`;
      element.setAttribute("aria-label", element.title);
      element.textContent = place.kind === "origin" ? "O" : place.kind === "arrival" ? "D" : place.kind === "destination" ? String(place.order + 1) : place.kind === "activity" ? "A" : "H";
      element.addEventListener("click", (event) => { event.stopPropagation(); selectPlace(key); });
      const marker = new Marker({ element, draggable: editable }).setLngLat(place.coordinates).addTo(map);
      if (editable) marker.on("dragend", () => { const point = marker.getLngLat().wrap(); pickPlace([point.lng, point.lat]); });
      return [marker];
    });
    const signature = JSON.stringify(places.map((place) => [place.id, place.coordinates]));
    const bounds = mapBounds(places);
    if (bounds && fitted.current !== signature && (!editable || !fitted.current)) { map.fitBounds(bounds, { padding: fitPadding, maxZoom: 14, duration: 0 }); fitted.current = signature; }
    return () => { markers.current.forEach((marker) => marker.remove()); markers.current = []; };
  }, [places, ready, editable]);

  useEffect(() => {
    markers.current.forEach((marker) => marker.getElement().setAttribute("aria-pressed", String(marker.getElement().dataset.key === focus?.key)));
    const place = places.find((item) => `${item.kind}:${item.id}` === focus?.key);
    if (ready && place?.coordinates) instance.current?.flyTo({ center: place.coordinates, zoom: 15, duration: 350, essential: false });
  }, [focus, places, ready]);

  function fit() { const bounds = mapBounds(places); if (bounds) instance.current?.fitBounds(bounds, { padding: fitPadding, maxZoom: 14, duration: 300 }); }
  return <div className="trip-map" aria-label="Mapa interactivo del viaje">
    <div className="trip-map-canvas" ref={container} data-map-ready={ready} />
    <div className="trip-map-tools"><IconButton icon={Scan} label="Ajustar mapa a los lugares" disabled={!ready || !places.length} onClick={fit} />{editable && <IconButton icon={MapPin} label="Usar centro del mapa" disabled={!ready} onClick={() => { const point = instance.current?.getCenter().wrap(); if (point) onPick?.([point.lng, point.lat]); }} />}</div>
    {!ready && !issue && <p className="map-loading" role="status">Cargando mapa…</p>}
    {issue && <div className="map-issue" role="alert"><p>{issue}</p><IconButton icon={RefreshCw} label="Reintentar mapa" onClick={() => { setReady(false); setIssue(""); setVersion((value) => value + 1); }} /></div>}
  </div>;
}