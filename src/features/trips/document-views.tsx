"use client";

import dynamic from "next/dynamic";
import { Download, Eye, FileText, LoaderCircle, Pencil, Plus, Save, Search, Trash2, Upload, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { EmptyState, IconButton } from "@/components/ui/states";
import { deleteDocument, downloadDocument, updateDocument, uploadDocument, type DocumentActionState } from "./document-actions";
import { documentCategories, documentFileSchema, documentSchema, documentSizeLabel, type TripDocument } from "./document-model";
import type { TripContent } from "./content-model";
import { dateLabel } from "./demo-data";

const DocumentViewer = dynamic(() => import("./document-viewer"), { ssr: false, loading: () => <p role="status">Cargando visor…</p> });

function DownloadDocument({ tripId, document }: { tripId: string; document: TripDocument }) {
  const [state, action, pending] = useActionState<DocumentActionState, FormData>(async (previous, form) => {
    try { const result = await downloadDocument(previous, form); if (result.url) { window.location.assign(result.url); return {}; } return { error: result.error }; }
    catch { return { error: "No se pudo descargar el documento. Inténtalo de nuevo." }; }
  }, {});
  return <form action={action} aria-busy={pending} className="document-download">
    <input type="hidden" name="trip_id" value={tripId} /><input type="hidden" name="id" value={document.id} />
    <IconButton type="submit" icon={pending ? LoaderCircle : Download} label={`Descargar ${document.name}`} disabled={pending} />
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
  </form>;
}

function DocumentForm({ tripId, record, onSaved, onBusy }: { tripId: string; record: TripDocument | null; onSaved: () => void; onBusy: (busy: boolean) => void }) {
  const [state, action, pending] = useActionState<DocumentActionState, FormData>(async (previous, form) => {
    const parsed = documentSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    if (!record) {
      const file = form.get("file");
      if (!(file instanceof File)) return { error: "Selecciona un archivo." };
      const checked = documentFileSchema.safeParse({ size: file.size, type: file.type });
      if (!checked.success) return { error: checked.error.issues[0].message };
    }
    onBusy(true);
    try { const result = await (record ? updateDocument : uploadDocument)(previous, form); if (result.success) onSaved(); return result; }
    catch { return { error: "No se pudo guardar. Tus campos y archivo se conservan para reintentar." }; }
    finally { onBusy(false); }
  }, {});
  return <form action={action} onReset={(event) => event.preventDefault()} aria-busy={pending}>
    <input type="hidden" name="trip_id" value={tripId} />{record && <input type="hidden" name="id" value={record.id} />}
    <fieldset className="trip-fields" disabled={pending}>
      <label>Nombre del documento<input name="name" defaultValue={record?.name || ""} maxLength={160} required autoFocus /></label>
      <label>Categoría<select name="category" defaultValue={record?.category || "other"}>{Object.entries(documentCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {!record && <label>Archivo (PDF, JPEG o PNG · máx. 4 MiB)<input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required /></label>}
    </fieldset>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <button className="button primary" type="submit" disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : record ? <Save size={16} /> : <Upload size={16} />}{pending ? "Guardando…" : record ? "Guardar cambios" : "Subir documento"}</button>
  </form>;
}

function DeleteDocument({ tripId, record, onClose, onDeleted }: { tripId: string; record: TripDocument; onClose: () => void; onDeleted: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const [state, action, pending] = useActionState<DocumentActionState, FormData>(async (previous, form) => {
    try { const result = await deleteDocument(previous, form); if (result.success) onDeleted(); return result; }
    catch { return { error: "La limpieza no ha terminado. Puedes reintentarlo." }; }
  }, {});
  return <dialog ref={dialog} className="create-dialog" aria-labelledby="delete-document-title" onClose={onClose} onCancel={(event) => { if (pending) event.preventDefault(); }}>
    <div className="dialog-heading"><h2 id="delete-document-title">Eliminar documento</h2><IconButton icon={X} label="Cerrar" disabled={pending} onClick={() => dialog.current?.close()} /></div>
    <p>¿Eliminar «{record.name}» y su archivo?</p>
    <form action={action} aria-busy={pending} onReset={(event) => event.preventDefault()}>
      <input type="hidden" name="trip_id" value={tripId} /><input type="hidden" name="id" value={record.id} />
      <label className="delete-confirmation"><input type="checkbox" name="confirmation" value="delete" required disabled={pending} />Confirmo la eliminación permanente.</label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button danger" type="submit" disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}{pending ? "Eliminando…" : "Eliminar"}</button>
    </form>
  </dialog>;
}

export function DocumentPanel({ tripId, documents }: { tripId: string; documents: TripContent["documents"] }) {
  const [editor, setEditor] = useState<{ record: TripDocument | null } | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<TripDocument | null>(null);
  const [viewing, setViewing] = useState<TripDocument | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [announcement, setAnnouncement] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const visible = documents.items.filter((item) => (category === "all" || item.category === category) && item.name.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")));
  function open(record: TripDocument | null) { setEditor({ record }); setVersion((value) => value + 1); setAnnouncement(""); dialog.current?.showModal(); }
  return <section className="trip-content-section" aria-label="Documentos del viaje">
    <div className="content-section-heading"><h3>Documentos <span className="count-badge">{documents.available ? visible.length : "—"}</span></h3><button className="button primary" onClick={() => open(null)}><Plus size={16} />Añadir documento</button></div>
    <p className="content-announcement muted" role="status">{announcement}</p>
    {!documents.available && <p className="form-error" role="status">Documentos pendientes de activación en Supabase.</p>}
    {documents.available && <>
      <div className="document-filters">
        <label className="search-box"><Search size={16} /><input type="search" aria-label="Buscar documento" placeholder="Buscar documento" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={160} /></label>
        <label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Todas las categorías</option>{Object.entries(documentCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {visible.length ? <ol className="booking-items document-items">{visible.map((item) => <li key={item.id}>
        <FileText size={22} className="booking-kind-icon" aria-hidden="true" />
        <div className="content-item-body"><h4>{item.name}</h4><p>{documentCategories[item.category]} · {documentSizeLabel(item.size_bytes)} · {item.mime_type === "application/pdf" ? "PDF" : item.mime_type === "image/jpeg" ? "JPEG" : "PNG"}</p><p className="muted">{dateLabel(item.created_at.slice(0, 10), { day: "numeric", month: "long", year: "numeric" })}</p>{item.storage_status !== "ready" && <p className="form-error" role="status">{item.storage_status === "deleting" ? "Limpieza pendiente" : "Subida incompleta · limpieza pendiente"}</p>}</div>
        <div className="content-item-actions">{item.storage_status === "ready" && <><IconButton icon={Eye} label={`Ver ${item.name}`} onClick={() => setViewing(item)} /><DownloadDocument tripId={tripId} document={item} /><IconButton icon={Pencil} label={`Editar ${item.name}`} onClick={() => open(item)} /></>}<IconButton icon={Trash2} label={`Eliminar ${item.name}`} onClick={() => setDeleting(item)} /></div>
      </li>)}</ol> : <EmptyState title={documents.items.length ? "Sin coincidencias" : "Sin documentos todavía"} description={documents.items.length ? "No hay documentos para esta selección." : "No hay archivos asociados a este viaje."} />}
    </>}
    <dialog ref={dialog} className="create-dialog" aria-labelledby="document-editor-title" onClose={() => setEditor(null)} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <div className="dialog-heading"><h2 id="document-editor-title">{editor?.record ? "Editar documento" : "Nuevo documento"}</h2><IconButton icon={X} label="Cerrar" disabled={busy} onClick={() => dialog.current?.close()} /></div>
      {editor && <DocumentForm key={version} tripId={tripId} record={editor.record} onBusy={setBusy} onSaved={() => { dialog.current?.close(); setAnnouncement("Documento guardado."); }} />}
    </dialog>
    {deleting && <DeleteDocument key={deleting.id} tripId={tripId} record={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); setAnnouncement("Documento eliminado."); }} />}
    {viewing && <DocumentViewer key={viewing.id} tripId={tripId} record={viewing} download={<DownloadDocument tripId={tripId} document={viewing} />} onClose={() => setViewing(null)} />}
  </section>;
}