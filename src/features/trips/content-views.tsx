"use client";

import { ArrowDown, ArrowUp, CalendarDays, LoaderCircle, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { EmptyState, IconButton } from "@/components/ui/states";
import { changeContent } from "./content-actions";
import { ContentForm, type ContentEditor } from "./content-form";
import { activityCategories, itineraryDays, type Activity, type Destination, type TripContent } from "./content-model";
import { dateLabel } from "./demo-data";
import type { Trip, TripActionState } from "./model";

type DeleteTarget = { kind: "destination" | "activity"; id: string; name: string };

function DestinationOrder({ tripId, destination, first, last, onMoved }: {
  tripId: string; destination: Destination; first: boolean; last: boolean; onMoved: () => void;
}) {
  const [state, action, pending] = useActionState<TripActionState, FormData>(async (previous, form) => {
    try {
      const result = await changeContent(previous, form);
      if (result.success) onMoved();
      return result;
    } catch { return { error: "No se pudo reordenar. Inténtalo de nuevo." }; }
  }, {});
  return (
    <div>
      <form className="content-move" action={action} aria-busy={pending}>
        <input type="hidden" name="trip_id" value={tripId} />
        <input type="hidden" name="id" value={destination.id} />
        <input type="hidden" name="kind" value="destination" />
        <button className="icon-button" type="submit" name="operation" value="up" title={`Subir ${destination.name}`} aria-label={`Subir ${destination.name}`} disabled={first || pending}><ArrowUp size={18} /></button>
        <button className="icon-button" type="submit" name="operation" value="down" title={`Bajar ${destination.name}`} aria-label={`Bajar ${destination.name}`} disabled={last || pending}><ArrowDown size={18} /></button>
      </form>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
    </div>
  );
}

function DeleteContent({ tripId, target, onClose, onDeleted }: {
  tripId: string; target: DeleteTarget; onClose: () => void; onDeleted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const [state, action, pending] = useActionState<TripActionState, FormData>(async (previous, form) => {
    try {
      const result = await changeContent(previous, form);
      if (result.success) onDeleted();
      return result;
    } catch { return { error: "No se pudo eliminar. Inténtalo de nuevo." }; }
  }, {});
  return (
    <dialog ref={dialog} className="create-dialog" aria-labelledby="delete-content-title" onClose={onClose} onCancel={(event) => { if (pending) event.preventDefault(); }}>
      <div className="dialog-heading">
        <h2 id="delete-content-title">Eliminar {target.kind === "destination" ? "destino" : "actividad"}</h2>
        <IconButton icon={X} label="Cerrar" disabled={pending} onClick={() => dialog.current?.close()} />
      </div>
      <p>¿Eliminar «{target.name}»?</p>
      {target.kind === "destination" && <p className="muted">También se eliminarán sus actividades. Las reservas y gastos conservarán sus datos, pero se desvincularán del destino.</p>}
      <form action={action} aria-busy={pending}>
        <input type="hidden" name="trip_id" value={tripId} />
        <input type="hidden" name="id" value={target.id} />
        <input type="hidden" name="kind" value={target.kind} />
        <input type="hidden" name="operation" value="delete" />
        <label className="delete-confirmation"><input type="checkbox" name="confirmation" value="delete" required disabled={pending} />Confirmo la eliminación permanente.</label>
        {state.error && <p className="form-error" role="alert">{state.error}</p>}
        <button className="button danger" type="submit" disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}{pending ? "Eliminando…" : "Eliminar"}</button>
      </form>
    </dialog>
  );
}

function activitySchedule(activity: Activity) {
  if (!activity.starts_at || !activity.time_zone) return "Sin hora";
  const formatter = new Intl.DateTimeFormat("es", { timeZone: activity.time_zone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `${formatter.format(new Date(activity.starts_at))}${activity.ends_at ? ` – ${formatter.format(new Date(activity.ends_at))}` : ""}`;
}

export function TripContentPanel({ trip, content, mode }: { trip: Trip; content: TripContent; mode: "destinations" | "itinerary" }) {
  const [editor, setEditor] = useState<ContentEditor | null>(null);
  const [version, setVersion] = useState(0);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [from, setFrom] = useState(trip.start);
  const [to, setTo] = useState(trip.end);
  const [destinationFilter, setDestinationFilter] = useState("all");
  const dialog = useRef<HTMLDialogElement>(null);
  const destinations = content.destinations;
  const selectedFrom = from < trip.start ? trip.start : from > trip.end ? trip.end : from;
  const selectedTo = to < selectedFrom ? selectedFrom : to > trip.end ? trip.end : to;
  const days = itineraryDays(content.activities, selectedFrom, selectedTo, destinationFilter);

  function open(next: ContentEditor) {
    setEditor(next);
    setVersion((current) => current + 1);
    setAnnouncement("");
    dialog.current?.showModal();
  }
  return (
    <section className="trip-content-section" aria-label={mode === "destinations" ? "Destinos" : "Itinerario del viaje"}>
      <div className="content-section-heading">
        <h3>{mode === "destinations" ? "Destinos del viaje" : "Tu itinerario"}</h3>
        <div className="content-item-actions">
          <button className="button secondary" onClick={() => open({ kind: "destination", record: null })}>
            <Plus size={16} />Añadir destino
          </button>
          {mode === "itinerary" && <button className="button primary" onClick={() => open({ kind: "activity", record: null, day: selectedFrom, destinationId: destinationFilter === "all" ? undefined : destinationFilter })}>
            <Plus size={16} />Añadir actividad
          </button>}
        </div>
      </div>
      <p className="content-announcement muted" role="status">{announcement}</p>
      {mode === "destinations" ? (
        destinations.length ? <ol className="destination-items">
          {destinations.map((destination, index) => (
            <li key={destination.id}>
              <span className="destination-number">{String(index + 1).padStart(2, "0")}</span>
              <div className="content-item-body">
                <h4>{destination.name}</h4>
                <p>{dateLabel(destination.arrival_date)} – {dateLabel(destination.departure_date, { day: "numeric", month: "short", year: "numeric" })}</p>
                {(destination.region || destination.country_code) && <p className="muted">{[destination.region, destination.country_code && new Intl.DisplayNames(["es"], { type: "region" }).of(destination.country_code)].filter(Boolean).join(" · ")}</p>}
                {destination.time_zone && <p className="muted">{destination.time_zone}</p>}
                {destination.description && <p className="content-description">{destination.description}</p>}
              </div>
              <div className="content-item-actions">
                <DestinationOrder tripId={trip.id} destination={destination} first={index === 0} last={index === destinations.length - 1} onMoved={() => setAnnouncement("Orden de destinos actualizado.")} />
                <IconButton icon={Pencil} label={`Editar ${destination.name}`} onClick={() => open({ kind: "destination", record: destination })} />
                <IconButton icon={Trash2} label={`Eliminar ${destination.name}`} onClick={() => setDeleting({ kind: "destination", id: destination.id, name: destination.name })} />
              </div>
            </li>
          ))}
        </ol> : <EmptyState title="Sin paradas todavía" description="Este viaje aún no tiene paradas." />
      ) : (
        <>
          <div className="agenda-toolbar">
            <div className="agenda-range-controls">
              <label>Desde<input type="date" value={selectedFrom} min={trip.start} max={trip.end} onChange={(event) => {
                const next = event.target.value || trip.start;
                setFrom(next);
                if (next > selectedTo) setTo(next);
              }} /></label>
              <label>Hasta<input type="date" value={selectedTo} min={selectedFrom} max={trip.end} onChange={(event) => setTo(event.target.value || trip.end)} /></label>
            </div>
            <label>Destino<select value={destinationFilter} onChange={(event) => setDestinationFilter(event.target.value)}>
              <option value="all">Todos los destinos</option>
              <option value="unlinked">Sin parada vinculada</option>
              {destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}
            </select></label>
          </div>
          {days.length ? days.map(({ date, activities }) => <section key={date} className="agenda-day" aria-label={dateLabel(date, { day: "numeric", month: "long", year: "numeric" })}>
            <h4 className="agenda-date"><CalendarDays size={17} />{dateLabel(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h4>
            <ol className="activity-items">
            {activities.map((activity) => (
              <li key={activity.id}>
                <div className="content-item-body">
                  <p className="activity-schedule">{activitySchedule(activity)}{activity.starts_at && <span>{activity.time_zone}</span>}</p>
                  <h4>{activity.title}</h4>
                  <p className="muted">{activityCategories[activity.category]}{activity.destination_id ? ` · ${destinations.find((destination) => destination.id === activity.destination_id)?.name || "Parada"}` : ""}</p>
                  {activity.location && <p className="activity-location"><MapPin size={14} />{activity.location}</p>}
                  {activity.description && <p className="content-description">{activity.description}</p>}
                  {activity.notes && <details className="activity-notes"><summary>Notas</summary><p>{activity.notes}</p></details>}
                </div>
                <div className="content-item-actions">
                  <IconButton icon={Pencil} label={`Editar ${activity.title}`} onClick={() => open({ kind: "activity", record: activity, day: activity.local_date })} />
                  <IconButton icon={Trash2} label={`Eliminar ${activity.title}`} onClick={() => setDeleting({ kind: "activity", id: activity.id, name: activity.title })} />
                </div>
              </li>
            ))}
            </ol>
          </section>) : <EmptyState title="Un itinerario por escribir" description="No hay actividades para estas fechas y destino." />}
        </>
      )}
      <dialog ref={dialog} className="create-dialog" aria-labelledby={`content-editor-${mode}`} onClose={() => setEditor(null)}>
        <div className="dialog-heading">
          <h2 id={`content-editor-${mode}`}>{editor?.record ? "Editar" : editor?.kind === "activity" ? "Nueva" : "Nuevo"} {editor?.kind === "activity" ? "actividad" : "destino"}</h2>
          <IconButton icon={X} label="Cerrar" onClick={() => dialog.current?.close()} />
        </div>
        {editor && <ContentForm key={`${version}-${editor.kind}`} trip={trip} destinations={destinations} editor={editor} onSaved={(savedDay) => {
          if (savedDay) {
            if (savedDay < selectedFrom) setFrom(savedDay);
            if (savedDay > selectedTo) setTo(savedDay);
            setDestinationFilter("all");
          }
          dialog.current?.close();
          setAnnouncement("Cambios guardados.");
        }} />}
      </dialog>
      {deleting && <DeleteContent key={deleting.id} tripId={trip.id} target={deleting} onClose={() => setDeleting(null)} onDeleted={() => {
        setDeleting(null);
        setDestinationFilter("all");
        setAnnouncement("Contenido eliminado.");
      }} />}
    </section>
  );
}