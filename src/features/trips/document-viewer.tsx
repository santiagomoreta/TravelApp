"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, LoaderCircle, RotateCw, Scan, UnlockKeyhole, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { IconButton } from "@/components/ui/states";
import { previewDocument } from "./document-actions";
import type { TripDocument } from "./document-model";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export default function DocumentViewer({ tripId, record, download, onClose }: {
  tripId: string; record: TripDocument; download: ReactNode; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const passwordId = useId();
  const [source, setSource] = useState<{ url?: string; error?: string }>({});
  const [request, setRequest] = useState(0);
  const [width, setWidth] = useState(600);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState<number | null>(null);
  const [renderError, setRenderError] = useState("");
  const [imageReady, setImageReady] = useState(false);
  const [imageAspect, setImageAspect] = useState(1);
  const [password, setPassword] = useState<{ submit: (value: string) => void; incorrect: boolean } | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const isPdf = record.mime_type === "application/pdf";
  const error = source.error || renderError;
  const pageWidth = Math.max(1, Math.floor(Math.min(width, 1100) * zoom));

  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLButtonElement>('[aria-label="Cerrar visor"]')?.focus();
  }, []);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, Math.floor(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    const form = new FormData();
    form.set("trip_id", tripId);
    form.set("id", record.id);
    void previewDocument({}, form).then((result) => {
      if (active) setSource(result.url ? { url: result.url } : { error: result.error || "No se pudo abrir el documento." });
    }).catch(() => {
      if (active) setSource({ error: "No se pudo conectar para abrir el documento." });
    });
    return () => { active = false; };
  }, [tripId, record.id, request]);

  function retry() {
    setSource({}); setRenderError(""); setImageReady(false); setPages(null); setPage(1);
    setPassword(null); setPasswordValue(""); setRequest((current) => current + 1);
  }

  function changePage(next: number) {
    setPage(Math.max(1, Math.min(pages || 1, next)));
    viewport.current?.scrollTo({ top: 0, left: 0 });
  }

  return <dialog ref={dialog} className="document-viewer" aria-labelledby={titleId} onClose={onClose}>
    <header className="document-viewer-heading">
      <h2 id={titleId}>{record.name}</h2>
      <div className="document-viewer-actions">{download}<IconButton icon={X} label="Cerrar visor" autoFocus onClick={() => dialog.current?.close()} /></div>
    </header>
    <div className="document-viewer-toolbar" aria-label="Controles del documento">
      {isPdf && <div className="document-viewer-controls">
        <IconButton icon={ChevronLeft} label="Página anterior" disabled={!pages || page <= 1} onClick={() => changePage(page - 1)} />
        <label className="document-page-number"><span className="sr-only">Página</span><input type="number" min={1} max={pages || 1} value={page} disabled={!pages} onChange={(event) => changePage(Number(event.target.value) || 1)} /></label>
        <span className="document-page-total" aria-live="polite">/ {pages ?? "..."}</span>
        <IconButton icon={ChevronRight} label="Página siguiente" disabled={!pages || page >= pages} onClick={() => changePage(page + 1)} />
      </div>}
      <div className="document-viewer-controls">
        <IconButton icon={ZoomOut} label="Alejar" disabled={!source.url || Boolean(error) || zoom <= 0.5} onClick={() => setZoom((current) => Math.max(0.5, current - 0.25))} />
        <output aria-label="Zoom">{Math.round(zoom * 100)}%</output>
        <IconButton icon={ZoomIn} label="Acercar" disabled={!source.url || Boolean(error) || zoom >= 3} onClick={() => setZoom((current) => Math.min(3, current + 0.25))} />
        <IconButton icon={Scan} label="Ajustar al ancho" disabled={!source.url || Boolean(error)} onClick={() => setZoom(1)} />
      </div>
    </div>
    <div ref={viewport} className="document-viewer-viewport" tabIndex={0} aria-label="Contenido del documento">
      {!source.url && !error && <p className="document-viewer-status" role="status"><LoaderCircle size={22} className="spin" />Abriendo documento…</p>}
      {error && <div className="document-viewer-status"><p className="form-error" role="alert">{error}</p><button className="button secondary" onClick={retry}><RotateCw size={17} />Reintentar</button></div>}
      {source.url && !error && (isPdf ? <>
        {password && <form className="document-password" onSubmit={(event) => { event.preventDefault(); password.submit(passwordValue); setPasswordValue(""); setPassword(null); }}>
          <label htmlFor={passwordId}>Contraseña del PDF</label><input id={passwordId} type="password" value={passwordValue} onChange={(event) => setPasswordValue(event.target.value)} autoComplete="off" required />
          {password.incorrect && <p className="form-error" role="alert">Contraseña incorrecta.</p>}
          <button className="button primary" type="submit"><UnlockKeyhole size={17} />Abrir documento</button>
        </form>}
        <Document key={source.url} file={source.url} suspense={false} loading={password ? null : <p className="document-viewer-status" role="status">Cargando PDF…</p>} onLoadSuccess={({ numPages }) => setPages(numPages)} onLoadError={() => setRenderError("No se pudo mostrar el PDF. Puede estar dañado o haber caducado el acceso.")} onSourceError={() => setRenderError("No se pudo acceder al PDF.")} onPassword={(submit, reason) => setPassword({ submit, incorrect: reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD })}>
          <Page pageNumber={page} width={pageWidth} renderAnnotationLayer={false} loading={<p role="status">Cargando página…</p>} onRenderError={() => setRenderError("No se pudo mostrar esta página del PDF.")} onLoadError={() => setRenderError("No se pudo cargar esta página del PDF.")} />
        </Document>
      </> : <>
        {!imageReady && <p role="status">Cargando imagen…</p>}
        <div className="document-image-frame" style={{ width: pageWidth, aspectRatio: imageAspect }}>
          <Image key={source.url} src={source.url} alt={record.name} fill sizes={`${pageWidth}px`} unoptimized className="document-preview-image" onLoad={(event) => { setImageReady(true); setImageAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight || 1); }} onError={() => setRenderError("No se pudo mostrar la imagen. Reintenta para renovar el acceso.")} />
        </div>
      </>)}
    </div>
  </dialog>;
}