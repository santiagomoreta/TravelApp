"use client";

import { ArrowRightLeft, BedDouble, BusFront, Car, CarTaxiFront, ExternalLink, LoaderCircle, Pencil, Plane, Plus, Ship, TrainFront, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { EmptyState, IconButton } from "@/components/ui/states";
import { deleteBooking } from "./booking-actions";
import { accommodationTypes, bookingTimeline, priceLabel, transportTypes, type Accommodation, type Transport, type TripBookings } from "./booking-model";
import { BookingForm, type BookingEditor } from "./booking-form";
import type { Destination } from "./content-model";
import { dateLabel } from "./demo-data";
import type { Trip, TripActionState } from "./model";

const travelIcons = { plane: Plane, train: TrainFront, bus: BusFront, car: Car, boat: Ship, taxi: CarTaxiFront, other: ArrowRightLeft };

export function TripTravelSummary({ trip }: { trip: Trip }) {
  return <section className="trip-travel-summary" aria-label="Transporte de ida y vuelta">
    <h3>Transporte del viaje</h3>
    <dl>{([{ key: "outbound", label: "Ida" }, { key: "inbound", label: "Vuelta" }] as const).map(({ key, label }) => {
      const mode = trip.travel?.[key];
      const Icon = mode ? travelIcons[mode] : ArrowRightLeft;
      return <div key={key}><dt>{label}</dt><dd><Icon size={18} aria-hidden="true" />{mode ? transportTypes[mode] : "Sin definir"}</dd></div>;
    })}</dl>
  </section>;
}

function transportTime(instant: string | null, zone: string | null) {
  if (!instant || !zone) return "Sin horario";
  return `${new Intl.DateTimeFormat("es", { timeZone: zone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(instant))} (${zone})`;
}

function TransportDetails({ record, destinations }: { record: Transport; destinations: Destination[] }) {
  const origin = destinations.find((destination) => destination.id === record.origin_destination_id);
  const arrival = destinations.find((destination) => destination.id === record.destination_id);
  return <>
    <h4>{record.origin_label} a {record.destination_label}</h4>
    <p>{transportTypes[record.type]}{record.company ? ` · ${record.company}` : ""}</p>
    <p>Salida: {transportTime(record.departs_at, record.departure_time_zone)}</p>
    <p>Llegada: {transportTime(record.arrives_at, record.arrival_time_zone)}</p>
    {(origin || arrival) && <p className="muted">Origen: {origin?.name || "Sin vincular"} · Llegada: {arrival?.name || "Sin vincular"}</p>}
    {record.ticket_number && <p>Billete: {record.ticket_number}</p>}
  </>;
}

function AccommodationDetails({ record, destinations }: { record: Accommodation; destinations: Destination[] }) {
  const destination = destinations.find((item) => item.id === record.destination_id);
  return <>
    <h4>{record.name}</h4>
    <p>{accommodationTypes[record.type]} · {destination?.name || "Sin vincular"}</p>
    <p>Entrada: {dateLabel(record.check_in, { day: "numeric", month: "short", year: "numeric" })} · Salida: {dateLabel(record.check_out, { day: "numeric", month: "short", year: "numeric" })}</p>
    {record.time_zone && <p className="muted">{record.time_zone}</p>}
    {record.address && <p className="content-description">{record.address}</p>}
    {record.phone && <p><a href={`tel:${record.phone}`}>{record.phone}</a></p>}
    {record.url && <p><a className="booking-web" href={record.url} target="_blank" rel="noopener noreferrer">Web del alojamiento<ExternalLink size={14} /></a></p>}
  </>;
}

function DeleteBooking({ tripId, editor, onClose, onDeleted }: {
  tripId: string; editor: BookingEditor; onClose: () => void; onDeleted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const [state, action, pending] = useActionState<TripActionState, FormData>(async (previous, form) => {
    try { const result = await deleteBooking(previous, form); if (result.success) onDeleted(); return result; }
    catch { return { error: "No se pudo eliminar. Inténtalo de nuevo." }; }
  }, {});
  const name = editor.kind === "transport" ? `${editor.record?.origin_label} a ${editor.record?.destination_label}` : editor.record?.name;
  return <dialog ref={dialog} className="create-dialog" aria-labelledby="delete-booking-title" onClose={onClose} onCancel={(event) => { if (pending) event.preventDefault(); }}>
    <div className="dialog-heading"><h2 id="delete-booking-title">Eliminar reserva</h2><IconButton icon={X} label="Cerrar" disabled={pending} onClick={() => dialog.current?.close()} /></div>
    <p>¿Eliminar «{name}»?</p>
    <form action={action} aria-busy={pending}>
      <input type="hidden" name="trip_id" value={tripId} />
      <input type="hidden" name="id" value={editor.record?.id || ""} />
      <input type="hidden" name="kind" value={editor.kind} />
      <label className="delete-confirmation"><input type="checkbox" name="confirmation" value="delete" required disabled={pending} />Confirmo la eliminación permanente.</label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button danger" type="submit" disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}{pending ? "Eliminando…" : "Eliminar"}</button>
    </form>
  </dialog>;
}

export function BookingPanel({ trip, destinations, bookings }: { trip: Trip; destinations: Destination[]; bookings: TripBookings }) {
  const [editor, setEditor] = useState<BookingEditor | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<BookingEditor | null>(null);
  const [kind, setKind] = useState("all");
  const [destinationFilter, setDestinationFilter] = useState("all");
  const [announcement, setAnnouncement] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const destination = destinations.some((item) => item.id === destinationFilter) ? destinationFilter : "all";
  const timeline = bookingTimeline(bookings).filter((entry) => (kind === "all" || kind === entry.kind) && (destination === "all" || entry.record.destination_id === destination || (entry.kind === "transport" && entry.record.origin_destination_id === destination)));

  function open(next: BookingEditor) {
    setEditor(next);
    setVersion((value) => value + 1);
    setAnnouncement("");
    dialog.current?.showModal();
  }

  return <section className="trip-content-section" aria-label="Reservas del viaje">
    <TripTravelSummary trip={trip} />
    <div className="content-section-heading">
      <h3>Transportes y alojamientos</h3>
      <div className="booking-commands">
        <button className="button secondary" onClick={() => open({ kind: "transport", record: null })}><Plus size={16} />Añadir transporte</button>
        <button className="button secondary" onClick={() => open({ kind: "accommodation", record: null })}><Plus size={16} />Añadir alojamiento</button>
      </div>
    </div>
    <p className="content-announcement muted" role="status">{announcement}</p>
    <div className="booking-filters">
      <div className="filter-tabs" role="group" aria-label="Tipo de reserva">{[{ value: "all", label: "Todas" }, { value: "transport", label: "Transportes" }, { value: "accommodation", label: "Alojamientos" }].map((item) => <button key={item.value} aria-pressed={kind === item.value} onClick={() => setKind(item.value)}>{item.label}</button>)}</div>
      <label>Destino<select value={destination} onChange={(event) => setDestinationFilter(event.target.value)}><option value="all">Todos los destinos</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    {timeline.length ? <ol className="booking-items">{timeline.map((entry) => {
      const name = entry.kind === "transport" ? `${entry.record.origin_label} a ${entry.record.destination_label}` : entry.record.name;
      const Icon = entry.kind === "transport" ? ArrowRightLeft : BedDouble;
      return <li key={`${entry.kind}-${entry.record.id}`}>
        <Icon size={22} className="booking-kind-icon" aria-hidden="true" />
        <div className="content-item-body">
          <p className="booking-date">{entry.day ? dateLabel(entry.day, { day: "numeric", month: "long", year: "numeric" }) : "Sin fecha"}</p>
          {entry.kind === "transport" ? <TransportDetails record={entry.record} destinations={destinations} /> : <AccommodationDetails record={entry.record} destinations={destinations} />}
          <p className="booking-price">{priceLabel(entry.record.amount, entry.record.currency)}</p>
          {entry.record.booking_reference && <p>Localizador: {entry.record.booking_reference}</p>}
          {entry.record.notes && <details className="activity-notes"><summary>Notas</summary><p>{entry.record.notes}</p></details>}
        </div>
        <div className="content-item-actions">
          <IconButton icon={Pencil} label={`Editar ${name}`} onClick={() => open(entry)} />
          <IconButton icon={Trash2} label={`Eliminar ${name}`} onClick={() => setDeleting(entry)} />
        </div>
      </li>;
    })}</ol> : <EmptyState title={bookings.transports.length || bookings.accommodations.length ? "Sin coincidencias" : "Sin reservas todavía"} description="No hay reservas para esta selección." />}
    <dialog ref={dialog} className="create-dialog" aria-labelledby="booking-editor-title" onClose={() => setEditor(null)} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <div className="dialog-heading"><h2 id="booking-editor-title">{editor?.record ? "Editar" : "Nuevo"} {editor?.kind === "accommodation" ? "alojamiento" : "transporte"}</h2><IconButton icon={X} label="Cerrar" disabled={busy} onClick={() => dialog.current?.close()} /></div>
      {editor && <BookingForm key={version} trip={trip} destinations={destinations} editor={editor} onBusy={setBusy} onSaved={() => { dialog.current?.close(); setAnnouncement("Reserva guardada."); }} />}
    </dialog>
    {deleting && <DeleteBooking key={deleting.record?.id} tripId={trip.id} editor={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); setAnnouncement("Reserva eliminada."); }} />}
  </section>;
}