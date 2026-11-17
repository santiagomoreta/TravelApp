"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useActionState, useState, type InputHTMLAttributes } from "react";
import { saveContent } from "./content-actions";
import { activityCategories, activitySchema, destinationSchema, localDateTimeValue, rangeFits, type Activity, type Destination } from "./content-model";
import type { Trip, TripActionState } from "./model";
import { LocationPicker } from "./location-picker";

export type ContentEditor = { kind: "destination"; record: Destination | null } | { kind: "activity"; record: Activity | null; day: string; destinationId?: string };

function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label>{label}<input {...props} /></label>;
}

export function ContentForm({ trip, destinations, editor, onSaved }: {
  trip: Trip; destinations: Destination[]; editor: ContentEditor; onSaved: (day?: string) => void;
}) {
  const destination = editor.kind === "destination" ? editor.record : null;
  const activity = editor.kind === "activity" ? editor.record : null;
  const [name, setName] = useState(destination?.name || activity?.title || "");
  const [destinationId, setDestinationId] = useState(activity ? activity.destination_id || "" : editor.kind === "activity" && destinations.some((item) => item.id === editor.destinationId) ? editor.destinationId! : "");
  const selected = destinations.find((item) => item.id === destinationId);
  const initialDay = editor.kind === "activity" ? editor.day : trip.start;
  const [day, setDay] = useState(activity?.local_date || (selected && !rangeFits(initialDay, initialDay, selected.arrival_date, selected.departure_date) ? selected.arrival_date : initialDay));
  const [zone, setZone] = useState(activity?.time_zone || destination?.time_zone || selected?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [startTime, setStartTime] = useState(localDateTimeValue(activity?.starts_at || null, activity?.time_zone || null).slice(11));
  const initialEnd = localDateTimeValue(activity?.ends_at || null, activity?.time_zone || null);
  const [endTime, setEndTime] = useState(initialEnd.slice(11));
  const [endDay, setEndDay] = useState(initialEnd.slice(0, 10) || day);
  const [location, setLocation] = useState(activity?.location || "");

  function changeDay(nextDay: string) {
    setDay(nextDay);
    setEndDay((previous) => previous === day || previous < nextDay ? nextDay : previous);
  }

  const [state, action, pending] = useActionState<TripActionState, FormData>(async (previous, form) => {
    if (String(form.get("destination_place") || "").trim() && (!form.get("latitude") || !form.get("longitude"))) {
      return { error: "Selecciona una ubicación de las sugerencias o borra la búsqueda para guardar sin ubicación." };
    }
    const schema = editor.kind === "destination" ? destinationSchema : activitySchema;
    const parsed = schema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    try {
      const result = await saveContent(previous, form);
      if (result.success) onSaved(editor.kind === "activity" ? String(form.get("local_date")) : undefined);
      return result;
    } catch { return { error: "No se pudo guardar. Tus campos se conservan para reintentar." }; }
  }, {});

  return (
    <form action={action} onReset={(event) => event.preventDefault()} aria-busy={pending}>
      <input type="hidden" name="trip_id" value={trip.id} />
      <input type="hidden" name="kind" value={editor.kind} />
      {editor.record && <input type="hidden" name="id" value={editor.record.id} />}
      <fieldset className="trip-fields" disabled={pending}>
        {editor.kind === "destination" ? (
          <>
            <Field label="Nombre del destino" name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required autoFocus />
            <div className="form-dates">
              <Field label="Llegada" name="arrival_date" type="date" defaultValue={destination?.arrival_date || trip.start} min={trip.start} max={trip.end} required />
              <Field label="Salida del destino" name="departure_date" type="date" defaultValue={destination?.departure_date || trip.end} min={trip.start} max={trip.end} required />
            </div>
            <input type="hidden" name="country_code" value={destination?.country_code || ""} />
            <input type="hidden" name="region" value={destination?.region || ""} />
          </>
        ) : (
          <>
            <Field label="Nombre de la actividad" name="title" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required autoFocus />
            <div className="form-dates">
              <Field label="Fecha" name="local_date" type="date" value={day} onChange={(event) => changeDay(event.target.value)} min={selected?.arrival_date || trip.start} max={selected?.departure_date || trip.end} required />
              <label>Categoría
                <select name="category" defaultValue={activity?.category || "activity"}>
                  {Object.entries(activityCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
            <div className="form-dates">
              <Field label="Hora de inicio" name="start_time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required={Boolean(endTime)} />
              <Field label="Hora de fin" name="end_time" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} min={endDay === day ? startTime : undefined} />
            </div>
            {endTime && <Field label="Fecha de fin" name="end_date" type="date" value={endDay} onChange={(event) => setEndDay(event.target.value)} min={day} max={selected?.departure_date || trip.end} required />}
            <input type="hidden" name="starts_local" value={startTime ? `${day}T${startTime}` : ""} />
            <input type="hidden" name="ends_local" value={endTime ? `${endDay}T${endTime}` : ""} />
            <input type="hidden" name="location" value={location} />
            {destinations.length ? <details open={Boolean(activity?.destination_id || (editor.kind === "activity" && destinations.some((item) => item.id === editor.destinationId))) || undefined}>
              <summary>Parada del itinerario (opcional)</summary>
              <label>Parada vinculada<select name="destination_id" value={destinationId} onChange={(event) => {
                const next = destinations.find((item) => item.id === event.target.value);
                setDestinationId(event.target.value);
                if (next) {
                  if (!rangeFits(day, day, next.arrival_date, next.departure_date)) changeDay(next.arrival_date);
                  setEndDay((previous) => previous < next.arrival_date ? next.arrival_date : previous > next.departure_date ? next.departure_date : previous);
                  setZone(next.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone);
                }
              }}>
                <option value="">Sin parada vinculada</option>
                {destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select></label>
            </details> : <input type="hidden" name="destination_id" value="" />}
          </>
        )}
        <LocationPicker predictive latitude={(destination || activity)?.latitude} longitude={(destination || activity)?.longitude} initialName={destination?.name || activity?.location || ""} onLocation={setLocation} onName={(value) => {
          if (editor.kind === "destination") setName((previous) => previous.trim() ? previous : value.slice(0, 160));
        }} />
        <Field label="Zona horaria" name="time_zone" value={zone} onChange={(event) => setZone(event.target.value)} maxLength={100} list="content-time-zones" placeholder="Europe/Madrid" />
        <datalist id="content-time-zones">
          {["Europe/Madrid", "Europe/Andorra", "Europe/London", "America/Guayaquil", "America/New_York", "Asia/Tokyo", "UTC"].map((value) => <option key={value} value={value} />)}
        </datalist>
        <label>Descripción
          <textarea name="description" defaultValue={editor.record?.description || ""} maxLength={10000} rows={3} />
        </label>
        {editor.kind === "activity" && <label>Notas<textarea name="notes" defaultValue={activity?.notes || ""} maxLength={4000} rows={3} /></label>}
      </fieldset>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button primary" type="submit" disabled={pending}>
        {pending ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}
        {pending ? "Guardando…" : editor.record ? "Guardar cambios" : editor.kind === "destination" ? "Crear destino" : "Crear actividad"}
      </button>
    </form>
  );
}