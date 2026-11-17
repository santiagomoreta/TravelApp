"use client";

import { CalendarDays, ChevronDown, LoaderCircle, Save, Settings2, Ticket } from "lucide-react";
import { useActionState, useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { saveBooking } from "./booking-actions";
import { accommodationSchema, accommodationTypes, transportSchema, transportTypes, type Accommodation, type Transport } from "./booking-model";
import { localDateTimeValue, type Destination } from "./content-model";
import type { Trip, TripActionState, TripLocation } from "./model";
import { LocationPicker } from "./location-picker";
import { TripPlaceInput } from "./trip-place-input";

export type BookingEditor = { kind: "transport"; record: Transport | null } | { kind: "accommodation"; record: Accommodation | null };

function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label>{label}<input {...props} /></label>;
}

export function BookingForm({ trip, destinations, editor, onSaved, onBusy }: {
  trip: Trip; destinations: Destination[]; editor: BookingEditor; onSaved: () => void; onBusy: (busy: boolean) => void;
}) {
  const transport = editor.kind === "transport" ? editor.record : null;
  const stay = editor.kind === "accommodation" ? editor.record : null;
  const formRef = useRef<HTMLFormElement>(null);
  const invalidField = useRef("");
  const [name, setName] = useState(stay?.name || "");
  const [address, setAddress] = useState(stay?.address || "");
  const [originPlace, setOriginPlace] = useState<TripLocation | null>(null);
  const [destinationPlace, setDestinationPlace] = useState<TripLocation | null>(null);
  const [destinationId, setDestinationId] = useState(editor.record?.destination_id || "");
  const [originId, setOriginId] = useState(transport?.origin_destination_id || "");
  const selected = destinations.find((destination) => destination.id === destinationId);
  const [zone, setZone] = useState(stay?.time_zone || transport?.arrival_time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [departureZone, setDepartureZone] = useState(transport?.departure_time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [amount, setAmount] = useState(editor.record?.amount || "");
  const [currency, setCurrency] = useState(editor.record?.currency || trip.currency);
  const [state, action, pending] = useActionState<TripActionState, FormData>(async (previous, form) => {
    invalidField.current = "";
    const locationQuery = String(form.get("destination_place") || "").trim();
    if (editor.kind === "accommodation" && locationQuery && (!form.get("latitude") || !form.get("longitude")) && locationQuery !== String(form.get("address") || "").trim()) {
      invalidField.current = "destination_place";
      return { error: "Selecciona un hotel o dirección de las sugerencias o borra la búsqueda para guardar sin ubicación." };
    }
    const parsed = (editor.kind === "transport" ? transportSchema : accommodationSchema).safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      invalidField.current = String(parsed.error.issues[0].path[0]);
      return { error: parsed.error.issues[0].message };
    }
    onBusy(true);
    try {
      const result = await saveBooking(previous, form);
      if (result.success) onSaved();
      return result;
    } catch { return { error: "No se pudo guardar. Tus campos se conservan para reintentar." }; }
    finally { onBusy(false); }
  }, {});

  useEffect(() => {
    if (pending || !state.error) return;
    const input = formRef.current?.elements.namedItem(invalidField.current);
    if (input instanceof HTMLElement) {
      const section = input.closest("details");
      if (section) section.open = true;
      input.focus();
    }
  }, [pending, state.error]);

  const destinationField = <label>Parada de llegada en el itinerario<select name="destination_id" value={destinationId} onChange={(event) => {
    setDestinationId(event.target.value);
    const next = destinations.find((destination) => destination.id === event.target.value);
    if (next?.time_zone) setZone(next.time_zone);
  }}><option value="">Ninguna</option>{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}</select></label>;
  const reservationFields = <>
    {editor.kind === "transport" && <>
      <Field label="Compañía" name="company" defaultValue={transport?.company || ""} maxLength={160} />
      <Field label="Número de billete" name="ticket_number" defaultValue={transport?.ticket_number || ""} maxLength={160} />
    </>}
    <Field label="Localizador" name="booking_reference" defaultValue={editor.record?.booking_reference || ""} maxLength={160} />
    <div className="form-dates">
      <Field label="Precio (opcional)" name="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} maxLength={21} />
      <Field label="Moneda" name="currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} pattern="[A-Za-z]{3}" required={Boolean(amount.trim())} disabled={!amount.trim()} />
    </div>
    <label>Notas<textarea name="notes" defaultValue={editor.record?.notes || ""} maxLength={4000} rows={3} /></label>
  </>;

  return (
    <form ref={formRef} action={action} onReset={(event) => event.preventDefault()} aria-busy={pending}>
      <input type="hidden" name="trip_id" value={trip.id} />
      <input type="hidden" name="kind" value={editor.kind} />
      {editor.record && <input type="hidden" name="id" value={editor.record.id} />}
      <fieldset className="trip-fields" disabled={pending}>
        {editor.kind === "accommodation" && <Field label="Nombre del alojamiento" name="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required autoFocus />}
        <label>{editor.kind === "transport" ? "Medio de transporte" : "Tipo"}<select name="type" defaultValue={editor.record?.type || (editor.kind === "transport" ? "plane" : "hotel")}>
          {Object.entries(editor.kind === "transport" ? transportTypes : accommodationTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {editor.kind === "transport" && <>
          <div className="form-dates booking-route-fields">
            <TripPlaceInput label="Origen" name="origin_label" initialQuery={transport?.origin_label || ""} value={originPlace} onChange={setOriginPlace} required autoFocus />
            <TripPlaceInput label="Destino" name="destination_label" initialQuery={transport?.destination_label || ""} value={destinationPlace} onChange={setDestinationPlace} required />
          </div>
        </>}
        {editor.kind === "transport" ? <>
          <details className="booking-options" open={Boolean(transport?.departs_at || transport?.arrives_at)}>
            <summary><CalendarDays size={18} /><span>Fechas y horarios</span><small>Opcional</small><ChevronDown size={16} className="booking-disclosure" /></summary>
            <div className="booking-option-fields">
              <div className="form-dates">
                <div className="booking-schedule-field">
                  <Field label="Salida (opcional)" name="departs_local" type="datetime-local" defaultValue={localDateTimeValue(transport?.departs_at || null, transport?.departure_time_zone || null)} min={`${trip.start}T00:00`} max={`${trip.end}T23:59`} aria-description={`Hora de ${departureZone.split("/").at(-1)?.replaceAll("_", " ")}`} />
                  <small>Hora de {departureZone.split("/").at(-1)?.replaceAll("_", " ")}</small>
                </div>
                <div className="booking-schedule-field">
                  <Field label="Llegada (opcional)" name="arrives_local" type="datetime-local" defaultValue={localDateTimeValue(transport?.arrives_at || null, transport?.arrival_time_zone || null)} min={`${trip.start}T00:00`} max={`${trip.end}T23:59`} aria-description={`Hora de ${zone.split("/").at(-1)?.replaceAll("_", " ")}`} />
                  <small>Hora de {zone.split("/").at(-1)?.replaceAll("_", " ")}</small>
                </div>
              </div>
            </div>
          </details>
          <details className="booking-options">
            <summary><Ticket size={18} /><span>Reserva y precio</span><small>Opcional</small><ChevronDown size={16} className="booking-disclosure" /></summary>
            <div className="booking-option-fields">{reservationFields}</div>
          </details>
          <details className="booking-options">
            <summary><Settings2 size={18} /><span>Más opciones</span><small>Opcional</small><ChevronDown size={16} className="booking-disclosure" /></summary>
            <div className="booking-option-fields">
              <Field label="Zona horaria de salida" name="departure_time_zone" value={departureZone} onChange={(event) => setDepartureZone(event.target.value)} list="booking-time-zones" maxLength={100} />
              <Field label="Zona horaria de llegada" name="arrival_time_zone" value={zone} onChange={(event) => setZone(event.target.value)} list="booking-time-zones" maxLength={100} />
              {destinations.length > 0 ? <>
                <label>Parada de salida en el itinerario<select name="origin_destination_id" value={originId} onChange={(event) => {
                  setOriginId(event.target.value);
                  const origin = destinations.find((destination) => destination.id === event.target.value);
                  if (origin?.time_zone) setDepartureZone(origin.time_zone);
                }}><option value="">Ninguna</option>{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}</select></label>
                {destinationField}
              </> : <>
                <input type="hidden" name="origin_destination_id" value={originId} />
                <input type="hidden" name="destination_id" value={destinationId} />
              </>}
            </div>
          </details>
        </> : <>
          <input type="hidden" name="destination_id" value={destinationId} />
          <div className="form-dates">
            <Field label="Entrada" name="check_in" type="date" defaultValue={stay?.check_in || trip.start} min={selected?.arrival_date || trip.start} max={selected?.departure_date || trip.end} required />
            <Field label="Salida del alojamiento" name="check_out" type="date" defaultValue={stay?.check_out || trip.end} min={selected?.arrival_date || trip.start} max={selected?.departure_date || trip.end} required />
          </div>
          <Field label="Zona horaria" name="time_zone" value={zone} onChange={(event) => setZone(event.target.value)} list="booking-time-zones" maxLength={100} />
          <input type="hidden" name="address" value={address} />
          <LocationPicker predictive searchLabel="Buscar hotel o dirección" searchPlaceholder="Nombre del hotel o dirección" initialQuery={stay?.address || ""} latitude={stay?.latitude} longitude={stay?.longitude} initialName={stay?.address || stay?.name || ""} onLocation={setAddress} onName={(value) => setName((previous) => previous.trim() ? previous : value.slice(0, 160))} />
          <Field label="Teléfono" name="phone" type="tel" defaultValue={stay?.phone || ""} maxLength={50} />
          <Field label="Web" name="url" type="url" defaultValue={stay?.url || ""} maxLength={2048} placeholder="https://" />
        </>}
        <datalist id="booking-time-zones">{["Europe/Madrid", "Europe/Andorra", "Europe/London", "America/Guayaquil", "America/New_York", "Asia/Tokyo", "UTC"].map((value) => <option key={value} value={value} />)}</datalist>
        {editor.kind === "accommodation" && reservationFields}
      </fieldset>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button primary" type="submit" disabled={pending}>
        {pending ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}
        {pending ? "Guardando…" : editor.record ? "Guardar cambios" : editor.kind === "transport" ? "Crear transporte" : "Crear alojamiento"}
      </button>
    </form>
  );
}