"use client";

import Image from "next/image";
import { Archive, ArchiveRestore, ImagePlus, LoaderCircle, Mountain, Pencil, Save, Trash2, Upload, X } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconButton } from "@/components/ui/states";
import { changeTrip, saveTrip } from "./actions";
import { tripCovers, tripSchema, tripStatuses, tripTravelFromForm, type Trip, type TripActionState, type TripInput, type TripTravel } from "./model";
import { transportTypes } from "./booking-model";
import { TripPlaceInput } from "./trip-place-input";

export function TripForm({ trip, onSaved }: { trip: Trip | null; onSaved: (id: string) => void }) {
  const photoId = useId();
  const photoInput = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const ownCover = trip?.image && !tripCovers.some((cover) => cover.value === trip.image) ? trip.image : null;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const [origin, setOrigin] = useState(trip?.route?.origin || null);
  const [destination, setDestination] = useState(trip?.route?.destination || null);
  const route = origin && destination ? { origin, destination } : null;
  const [outbound, setOutbound] = useState<TripTravel["outbound"] | "">(trip?.travel?.outbound || "");
  const [inbound, setInbound] = useState<TripTravel["inbound"] | "">(trip?.travel?.inbound || "");
  const [sameTransport, setSameTransport] = useState(!trip?.travel || trip.travel.outbound === trip.travel.inbound);
  const travelRequired = !trip || Boolean(trip.travel || outbound || inbound);
  const [values, setValues] = useState<TripInput>({
    name: trip?.name || "", description: trip?.description || "",
    start: trip?.start || "", end: trip?.end || "", currency: trip?.currency || "EUR",
    status: trip?.status || "planning", image: ownCover ? "custom" : (trip?.image || "") as TripInput["image"],
  });
  const [state, action, pending] = useActionState<TripActionState, FormData>(async (previous, form) => {
    const parsed = tripSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    if ((!trip || form.get("origin_place") || form.get("destination_place") || trip.route) && !route) return { error: "Selecciona el origen y el destino entre las sugerencias." };
    try {
      if (!tripTravelFromForm(form) && !trip) return { error: "Selecciona cómo viajarás en la ida y en la vuelta." };
    } catch { return { error: "Selecciona un transporte válido para la ida y la vuelta." }; }
    if (photoError) return { error: photoError };
    if (parsed.data.image === "custom") {
      if (photo) form.set("cover_file", photo);
      else {
        form.delete("cover_file");
        if (!ownCover) return { error: "Selecciona una foto JPEG o PNG para la portada." };
      }
    } else form.delete("cover_file");
    try {
      const result = await saveTrip(previous, form);
      if (result.success && result.id) onSaved(result.id);
      return result;
    } catch {
      return { error: "No se pudo guardar. Conservamos tus datos para que puedas reintentarlo." };
    }
  }, {});

  function field<Key extends keyof TripInput>(name: Key, value: TripInput[Key]) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function chooseCover(value: TripInput["image"]) {
    field("image", value);
    setPhoto(null);
    setPreview(null);
    setPhotoError("");
    if (photoInput.current) photoInput.current.value = "";
  }

  return (
    <form action={action} aria-busy={pending} className="trip-form" onReset={(event) => event.preventDefault()}>
      {trip && <input type="hidden" name="id" value={trip.id} />}
      <input type="hidden" name="route" value={route ? JSON.stringify(route) : ""} />
      <fieldset disabled={pending} className="trip-fields">
        <label>Nombre del viaje
          <input name="name" value={values.name} onChange={(event) => field("name", event.target.value)} maxLength={160} required autoFocus />
        </label>
        <div className="trip-route-fields">
          <TripPlaceInput label="Origen" value={origin} onChange={setOrigin} geolocation autoLocate={!trip} />
          <TripPlaceInput label="Destino del viaje" value={destination} onChange={setDestination} />
          <small className="location-attribution"><a href="https://github.com/komoot/photon" target="_blank" rel="noopener noreferrer">Photon</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a></small>
        </div>
        <fieldset className="trip-travel-fields">
          <legend>¿Cómo vas a viajar?</legend>
          <label>Transporte de ida
            <select name="outbound_transport" value={outbound} onChange={(event) => setOutbound(event.target.value as typeof outbound)} required={travelRequired}>
              <option value="">Selecciona un transporte</option>
              {Object.entries(transportTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="trip-travel-same">
            <input type="checkbox" checked={sameTransport} onChange={(event) => {
              setSameTransport(event.target.checked);
              if (!event.target.checked && !inbound) setInbound(outbound);
            }} />
            Mismo transporte para la vuelta
          </label>
          {sameTransport ? <input type="hidden" name="return_transport" value={outbound} /> : <label>Transporte de vuelta
            <select name="return_transport" value={inbound} onChange={(event) => setInbound(event.target.value as typeof inbound)} required={travelRequired}>
              <option value="">Selecciona un transporte</option>
              {Object.entries(transportTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>}
        </fieldset>
        <label>Descripción
          <textarea name="description" value={values.description} onChange={(event) => field("description", event.target.value)} maxLength={10000} rows={3} />
        </label>
        <div className="form-dates">
          <label>Salida
            <input name="start" type="date" value={values.start} onChange={(event) => field("start", event.target.value)} min="0001-01-01" max="9999-12-31" required />
          </label>
          <label>Vuelta
            <input name="end" type="date" value={values.end} onChange={(event) => field("end", event.target.value)} min={values.start || "0001-01-01"} max="9999-12-31" required />
          </label>
        </div>
        <div className="form-dates">
          <label>Estado
            <select name="status" value={values.status} onChange={(event) => field("status", event.target.value as TripInput["status"])}>
              {Object.entries(tripStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Moneda
            <input name="currency" value={values.currency} onChange={(event) => field("currency", event.target.value.toUpperCase())} pattern="[A-Za-z]{3}" maxLength={3} required />
          </label>
        </div>
        <fieldset className="cover-options">
          <legend>Portada</legend>
          <div className="cover-grid">
            {tripCovers.map((cover) => (
              <label key={cover.value} className="cover-choice">
                <input type="radio" name="image" value={cover.value} checked={values.image === cover.value} onChange={() => chooseCover(cover.value)} />
                <span className="cover-thumbnail">
                  {cover.value ? <Image src={cover.value} alt="" fill sizes="120px" /> : <Mountain size={24} />}
                </span>
                <span>{cover.label}</span>
              </label>
            ))}
            <label className="cover-choice">
              <input type="radio" name="image" value="custom" checked={values.image === "custom"} onChange={() => chooseCover("custom")} />
              <span className="cover-thumbnail">
                {preview || ownCover ? <Image src={preview || ownCover!} alt="Vista previa de tu foto" fill sizes="120px" unoptimized /> : <ImagePlus size={24} />}
              </span>
              <span>Foto propia</span>
            </label>
          </div>
          <div className="cover-upload-controls">
            <label className="button secondary cover-upload-button" htmlFor={photoId}>
              <Upload size={17} />{preview || ownCover ? "Cambiar foto" : "Elegir foto"}
              <input ref={photoInput} id={photoId} name="cover_file" type="file" accept="image/jpeg,image/png" aria-label="Subir foto de portada" aria-describedby={`${photoId}-details`} onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (!file.size || file.size > 4 * 1024 * 1024 || (file.type && !["image/jpeg", "image/png"].includes(file.type))) {
                  setPhotoError("Elige una imagen JPEG o PNG de hasta 4 MiB.");
                  event.target.value = "";
                  return;
                }
                setPhoto(file);
                setPreview(URL.createObjectURL(file));
                setPhotoError("");
                field("image", "custom");
              }} />
            </label>
            {values.image === "custom" && (photo || ownCover) && <IconButton icon={X} label="Quitar foto de portada" onClick={() => chooseCover("")} disabled={pending} />}
          </div>
          <small id={`${photoId}-details`} className="cover-file-details" aria-live="polite">{photo?.name || "JPEG o PNG · hasta 4 MiB"}</small>
          {photoError && <p role="alert" className="form-error">{photoError}</p>}
        </fieldset>
      </fieldset>
      {state.error && <p role="alert" className="form-error">{state.error}</p>}
      <button type="submit" className="button primary" disabled={pending}>
        {pending ? <LoaderCircle size={17} className="spin" /> : <Save size={17} />}
        {pending ? "Guardando…" : trip ? "Guardar cambios" : "Crear viaje"}
      </button>
    </form>
  );
}

export function TripControls({ trip, onEdit }: { trip: Trip; onEdit: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [operation, setOperation] = useState<"archive" | "restore" | "delete">("archive");
  const [notice, setNotice] = useState("");
  const [state, action, pending] = useActionState<TripActionState, FormData>(async (previous, fields) => {
    try {
      const result = await changeTrip(previous, fields);
      if (result.success) {
        dialog.current?.close();
        if (fields.get("operation") === "delete") router.replace("/viajes");
        else setNotice(fields.get("operation") === "restore" ? "Viaje restaurado." : "Viaje archivado.");
      }
      return result;
    } catch {
      return { error: "No se pudo completar la operación. Inténtalo de nuevo." };
    }
  }, {});

  function confirm(next: typeof operation) {
    setOperation(next);
    setNotice("");
    form.current?.reset();
    dialog.current?.showModal();
  }
  const label = operation === "delete" ? "Eliminar" : operation === "restore" ? "Restaurar" : "Archivar";
  return (
    <>
      <div className="trip-controls" aria-label="Acciones del viaje">
        <button className="button secondary" onClick={onEdit} disabled={pending}><Pencil size={16} />Editar</button>
        <button className="button secondary" onClick={() => confirm(trip.archivedAt ? "restore" : "archive")} disabled={pending}>
          {trip.archivedAt ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          {trip.archivedAt ? "Restaurar" : "Archivar"}
        </button>
        <IconButton icon={Trash2} label="Eliminar viaje" onClick={() => confirm("delete")} disabled={pending} />
      </div>
      {notice && <p role="status" className="muted">{notice}</p>}
      <dialog ref={dialog} className="create-dialog" aria-labelledby="trip-confirm-title" onCancel={(event) => { if (pending) event.preventDefault(); }}>
        <div className="dialog-heading">
          <h2 id="trip-confirm-title">{label} viaje</h2>
          <IconButton icon={X} label="Cerrar" onClick={() => dialog.current?.close()} disabled={pending} />
        </div>
        <p>¿{label} «{trip.name}»?</p>
        <form ref={form} action={action} aria-busy={pending}>
          <input type="hidden" name="id" value={trip.id} />
          <input type="hidden" name="operation" value={operation} />
          {operation === "delete" && (
            <label className="delete-confirmation">
              <input type="checkbox" name="confirmation" value="delete" required disabled={pending} />
              Confirmo la eliminación permanente del viaje y de todos sus destinos, actividades, reservas, gastos y documentos asociados.
            </label>
          )}
          {state.error && <p role="alert" className="form-error">{state.error}</p>}
          <button type="submit" className={`button ${operation === "delete" ? "danger" : "primary"}`} disabled={pending}>
            {pending ? <LoaderCircle size={16} className="spin" /> : operation === "delete" ? <Trash2 size={16} /> : <Archive size={16} />}
            {pending ? "Procesando…" : label}
          </button>
        </form>
      </dialog>
    </>
  );
}