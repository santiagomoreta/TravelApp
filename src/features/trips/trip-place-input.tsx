"use client";

import { LoaderCircle, LocateFixed, MapPin, X } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { IconButton } from "@/components/ui/states";
import { locateCity, searchPlaces } from "./location-actions";
import type { PlaceResult } from "./location-search";
import type { TripLocation } from "./model";

export function TripPlaceInput({ label, value, onChange, geolocation = false, autoLocate = false, name, initialQuery = "", required = false, autoFocus = false, placeholder = "Ciudad o lugar" }: {
  label: string; value: TripLocation | null; onChange: (place: TripLocation | null) => void;
  geolocation?: boolean; autoLocate?: boolean;
  name?: string; initialQuery?: string; required?: boolean; autoFocus?: boolean; placeholder?: string;
}) {
  const [query, setQuery] = useState(value?.name || initialQuery);
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searched, setSearched] = useState(false);
  const [notice, setNotice] = useState("");
  const inputId = useId();
  const listId = `${inputId}-results`;
  const request = useRef(0);
  const automaticLocation = useEffectEvent(() => { void locate(); });

  useEffect(() => { if (autoLocate) automaticLocation(); }, [autoLocate]);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => {
    if (!open || query.trim().length < 3 || query === value?.name) return;
    const current = request.current;
    const timer = setTimeout(async () => {
      setPending(true);
      try {
        const result = await searchPlaces(query);
        if (request.current !== current) return;
        setPlaces(result.places); setNotice(result.error || ""); setSearched(!result.error); setActive(0);
      } catch { if (request.current === current) setNotice("No se pudo buscar. Vuelve a escribir el lugar para reintentar."); }
      finally { if (request.current === current) setPending(false); }
    }, 1500);
    return () => clearTimeout(timer);
  }, [open, query, value?.name]);

  function choose(place: PlaceResult) {
    request.current++;
    const selected = { name: [place.name, place.detail].filter(Boolean).join(", ").slice(0, 160), latitude: place.latitude, longitude: place.longitude };
    setQuery(selected.name); onChange(selected); setOpen(false); setPlaces([]); setNotice(""); setSearched(false); setPending(false); setLocating(false);
  }

  async function locate() {
    const current = ++request.current;
    setPlaces([]); setOpen(false); setPending(false); setNotice("");
    if (!window.isSecureContext || !navigator.geolocation) {
      setNotice("La ubicación automática requiere HTTPS y un navegador compatible. Escribe el origen."); return;
    }
    setLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }));
      if (request.current !== current) return;
      const result = await locateCity({ latitude: Number(position.coords.latitude.toFixed(3)), longitude: Number(position.coords.longitude.toFixed(3)) });
      if (request.current !== current) return;
      if (result.places[0]) choose(result.places[0]);
      else setNotice(result.error || "No encontramos tu ciudad. Escribe el origen.");
    } catch (error) {
      if (request.current === current) setNotice(error && typeof error === "object" && "code" in error && error.code === 1 ? "Permiso de ubicación denegado. Escribe el origen." : "No se pudo obtener tu ubicación. Escribe el origen.");
    } finally { if (request.current === current) setLocating(false); }
  }

  const expanded = open && places.length > 0;
  return <div className="trip-place-input" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label htmlFor={inputId}>{label}</label>
    <div className="trip-place-controls">
      <input id={inputId} name={name || (geolocation ? "origin_place" : "destination_place")} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId} aria-activedescendant={expanded ? `${listId}-${active}` : undefined} aria-describedby={notice ? `${inputId}-notice` : undefined} autoComplete="off" placeholder={placeholder} required={required} autoFocus={autoFocus} maxLength={160} value={query} onFocus={() => setOpen(true)} onChange={(event) => {
        request.current++; setQuery(event.target.value); onChange(null); setPlaces([]); setOpen(true); setSearched(false); setNotice(""); setPending(false); setLocating(false); setActive(0);
      }} onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          if (places.length) setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + places.length) % places.length);
        } else if (event.key === "Enter") { event.preventDefault(); if (expanded && places[active]) choose(places[active]); }
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); request.current++; setOpen(false); setPending(false); }
      }} />
      {(pending || locating) && <LoaderCircle size={18} className="spin" aria-label={locating ? "Detectando ciudad" : "Buscando lugares"} />}
      {query && <IconButton icon={X} label={`Borrar ${label.toLocaleLowerCase("es")}`} onClick={() => { request.current++; setQuery(""); onChange(null); setPlaces([]); setNotice(""); setPending(false); setLocating(false); setSearched(false); }} />}
      {geolocation && <IconButton icon={LocateFixed} label="Usar mi ubicación" disabled={locating} onClick={() => void locate()} />}
    </div>
    {locating && <p role="status">Detectando ciudad de origen…</p>}
    {notice && <p id={`${inputId}-notice`} role="status" className="muted">{notice}</p>}
    {expanded && <ul id={listId} role="listbox" aria-label={`Sugerencias de ${label.toLocaleLowerCase("es")}`} className="location-results">{places.map((place, index) => <li key={place.id} role="presentation"><button id={`${listId}-${index}`} type="button" role="option" aria-selected={active === index} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(place)}><MapPin size={17} /><span><strong>{place.name}</strong>{place.detail && <small>{place.detail}</small>}</span></button></li>)}</ul>}
    {searched && open && !places.length && !pending && <p role="status">No encontramos ese lugar.</p>}
    {value && <p className="trip-place-selected"><MapPin size={14} />{value.name}</p>}
    {geolocation && <small className="muted">Al aceptar el permiso, tu posición aproximada se enviará a Photon para obtener tu ciudad.</small>}
  </div>;
}