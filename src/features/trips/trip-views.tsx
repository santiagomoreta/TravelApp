"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  MapPin,
  Map as MapIcon,
  Mountain,
  Plane,
  Plus,
  Search,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/states";
import { dateLabel, daysBetween } from "./demo-data";
import { filterTrips, tripStatuses, type Trip, type TripFilter } from "./model";
import { TripControls } from "./trip-form";
import type { TripContent } from "./content-model";
import { TripContentPanel } from "./content-views";
import { BookingPanel, TripTravelSummary } from "./booking-views";
import { FinancePanel, FinanceSummary } from "./expense-views";
import { DocumentPanel } from "./document-views";
import { MapPanel } from "./map-panel";

function TripPhoto({
  trip,
  priority = false,
}: {
  trip: Trip;
  priority?: boolean;
}) {
  if (!trip.image)
    return (
      <div
        className="photo-placeholder"
        role="img"
        aria-label="Viaje sin imagen de portada"
      >
        <Mountain size={64} strokeWidth={1} />
      </div>
    );
  return (
    <Image
      src={trip.image}
      unoptimized={trip.image.startsWith("/api/trip-covers/")}
      alt={`Portada de ${trip.name}`}
      fill
      sizes={
        priority
          ? "(max-width: 760px) 100vw, 80vw"
          : "(max-width: 480px) 100vw, (max-width: 1000px) 45vw, 30vw"
      }
      className="trip-photo"
      loading={priority ? "eager" : "lazy"}
    />
  );
}

function TripCard({ trip, today }: { trip: Trip; today: string }) {
  const past = trip.end < today;
  return (
    <Link href={`/viajes/${trip.id}`} className="trip-card">
      <div className="card-photo">
        <TripPhoto trip={trip} />
        <span className={`status ${past ? "neutral" : ""}`}>
          {past ? <Check size={12} /> : <span className="tiny-dot" />}
          {trip.archivedAt
            ? "Archivado"
            : trip.status === "cancelled" || trip.status === "completed"
              ? tripStatuses[trip.status]
              : past
            ? "Completado"
            : trip.start <= today
              ? "En curso"
              : tripStatuses[trip.status]}
        </span>
        <span className="photo-country">
          <MapPin size={13} />
          {trip.destinations[0] || trip.route?.destination.name || "Sin destinos"}
        </span>
      </div>
      <div className="trip-card-body">
        <div className="card-title">
          <h3>{trip.name}</h3>
          <ArrowRight size={17} />
        </div>
        <p>
          <CalendarDays size={14} />
          {dateLabel(trip.start)} –{" "}
          {dateLabel(trip.end, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
        <div className="card-bottom">
          <span>
            {trip.destinations.length}{" "}
            {trip.destinations.length === 1 ? "parada" : "paradas"}{" "}
            <span className="separator">·</span>{" "}
            {daysBetween(trip.start, trip.end) + 1} días
          </span>
          <span>{trip.currency}</span>
        </div>
      </div>
    </Link>
  );
}

export function TripsView({ all = false }: { all?: boolean }) {
  const { trips, today, openCreate } = useWorkspace();
  const [filter, setFilter] = useState<TripFilter>("upcoming");
  const [query, setQuery] = useState("");
  const active = filterTrips(trips, today, "all");
  const future = filterTrips(trips, today, "upcoming");
  const past = filterTrips(trips, today, "past");
  const archived = filterTrips(trips, today, "archived");
  const next = future[0];
  const visible = filterTrips(trips, today, filter, query);
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">TU PASAPORTE A LO QUE VIENE</div>
          <h1>{all ? "Mis viajes" : "El mundo te espera."}</h1>
          <p>
            {all
              ? "Cada aventura, en su lugar."
              : "Un lugar para tus planes. Espacio para lo inesperado."}
          </p>
        </div>
        <button className="button primary" onClick={openCreate}>
          <Plus size={17} />
          Nuevo viaje
        </button>
      </div>
      {!all && next && (
        <section className="featured-trip" aria-labelledby="featured-title">
          <TripPhoto trip={next} priority />
          <div className="featured-shade" />
          <div className="featured-top">
            <span className="featured-label">
              <span className="tiny-dot" />
              {next.start <= today ? "AHORA MISMO" : "TU PRÓXIMA AVENTURA"}
            </span>
            <span className="countdown">
              <Clock3 size={15} />
              {next.start <= today
                ? "¡Estás de viaje!"
                : `En ${daysBetween(today, next.start)} días`}
            </span>
          </div>
          <div className="featured-content">
            <span className="featured-country">
              <MapPin size={15} />
              {(next.destinations[0] || next.name).toLocaleUpperCase("es")}
            </span>
            <h2 id="featured-title">{next.name}</h2>
            <p>{next.destinations.join(" → ")}</p>
            <div className="featured-bottom">
              <div>
                <span>
                  <CalendarDays size={16} />
                  {dateLabel(next.start)} –{" "}
                  {dateLabel(next.end, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="featured-duration">
                  {daysBetween(next.start, next.end) + 1} días para descubrir
                </span>
              </div>
              <Link href={`/viajes/${next.id}`} className="button white">
                Explorar viaje
                <ArrowRight size={17} />
              </Link>
            </div>
          </div>
        </section>
      )}
      {!all && (
        <section className="stats-strip" aria-label="Resumen de tus viajes">
          <div>
            <span className="stat-icon mint">
              <Plane size={21} />
            </span>
            <div>
              <span>Por descubrir</span>
              <strong>
                {future.length}
                <small> viajes en el horizonte</small>
              </strong>
            </div>
          </div>
          <div>
            <span className="stat-icon peach">
              <MapPin size={21} />
            </span>
            <div>
              <span>Próximas paradas</span>
              <strong>
                {new Set(future.flatMap((trip) => trip.destinations)).size}
                <small> destinos por explorar</small>
              </strong>
            </div>
          </div>
          <div>
            <span className="stat-icon lavender">
              <Archive size={21} />
            </span>
            <div>
              <span>Viajes anteriores</span>
              <strong>
                {past.length}
                <small> historias para recordar</small>
              </strong>
            </div>
          </div>
        </section>
      )}
      <section className="trips-section" aria-labelledby="trips-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LA COLECCIÓN</span>
            <h2 id="trips-title">
              {all ? "Todos tus viajes" : "Tus viajes"}
              <span className="count-badge">{active.length}</span>
            </h2>
          </div>
          <label className="search-box">
            <Search size={17} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar un viaje…"
              aria-label="Buscar un viaje"
            />
          </label>
        </div>
        <div className="filter-tabs" role="group" aria-label="Filtrar viajes">
          {[
            { id: "upcoming", label: "Próximos", count: future.length },
            { id: "past", label: "Pasados", count: past.length },
            { id: "all", label: "Todos", count: active.length },
            { id: "archived", label: "Archivados", count: archived.length },
          ].map((item) => (
            <button
              key={item.id}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id as TripFilter)}
            >
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </div>
        {visible.length ? (
          <div className="trip-grid">
            {visible.map((trip) => (
              <TripCard key={trip.id} trip={trip} today={today} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Ningún viaje por aquí"
            description={
              query
                ? "Prueba con otro nombre o destino."
                : filter === "archived" ? "No tienes viajes archivados." : "Tu siguiente aventura todavía está por escribir."
            }
          >
            {!query && filter !== "archived" && (
              <button className="button secondary" onClick={openCreate}>
                <Plus size={16} />
                Nuevo viaje
              </button>
            )}
          </EmptyState>
        )}
      </section>
      {!all && (
        <div className="bottom-note">
          <Mountain size={20} />
          <span>
            No hace falta ir lejos para encontrar algo extraordinario.
          </span>
          <span className="note-line" />
        </div>
      )}
    </div>
  );
}

export function TripDetail({ id, content }: { id: string; content: TripContent }) {
  const { trips, today, openEdit } = useWorkspace();
  const trip = trips.find((item) => item.id === id);
  const [tab, setTab] = useState("Resumen");
  if (!trip)
    return (
      <div className="page-content">
        <Link className="back-link" href="/viajes">
          <ArrowLeft size={16} />
          Mis viajes
        </Link>
        <EmptyState
          title="No encontramos este viaje"
          description="El viaje no está disponible en esta cuenta o se ha eliminado."
        >
          <Link href="/viajes" className="button primary">
            Ver mis viajes
            <ArrowRight size={16} />
          </Link>
        </EmptyState>
      </div>
    );
  const totalDays = daysBetween(trip.start, trip.end) + 1;
  return (
    <div className="page-content detail-page">
      <Link className="back-link" href="/viajes">
        <ArrowLeft size={16} />
        Todos mis viajes
      </Link>
      <TripControls trip={trip} onEdit={() => openEdit(trip)} />
      <section className="detail-cover">
        <TripPhoto trip={trip} priority />
        <div className="featured-shade" />
        <div className="detail-cover-content">
          <span className="featured-label">
            {trip.archivedAt ? "ARCHIVADO" : trip.end < today ? "UN VIAJE PARA RECORDAR" : "UN VIAJE POR VIVIR"}
          </span>
          <h1>{trip.name}</h1>
          <p>
            <MapPin size={16} />
            {trip.destinations[0] || trip.route?.destination.name || "Sin destinos"}
            <span>·</span>
            {dateLabel(trip.start)} –{" "}
            {dateLabel(trip.end, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            <span>·</span>
            {totalDays} días
          </p>
        </div>
      </section>
      <div
        className="detail-tabs"
        role="tablist"
        aria-label="Secciones del viaje"
      >
        {[
          { label: "Resumen", icon: Mountain },
          { label: "Itinerario", icon: CalendarDays },
          { label: "Reservas", icon: Plane },
          { label: "Presupuesto", icon: Wallet },
          { label: "Documentos", icon: FileText },
          { label: "Mapa", icon: MapIcon },
        ].map(({ label, icon: Icon }, index, items) => (
          <button
            key={label}
            id={`tab-${label}`}
            role="tab"
            tabIndex={tab === label ? 0 : -1}
            aria-selected={tab === label}
            aria-controls="trip-panel"
            onClick={() => setTab(label)}
            onKeyDown={(event) => {
              if (
                ["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                const target =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : (index +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          items.length) %
                        items.length;
                setTab(items[target].label);
                document.getElementById(`tab-${items[target].label}`)?.focus();
              }
            }}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <div
        id="trip-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
      >
        {tab === "Resumen" && (
          <div className="detail-columns">
            <section>
              <span className="eyebrow">EL PLAN</span>
              <h2>Un viaje, muchas historias.</h2>
              <p className="trip-description">
                {trip.description ||
                  "El primer paso ya está dado. Tu aventura empieza aquí."}
              </p>
                  <TripTravelSummary trip={trip} />
              <TripContentPanel trip={trip} content={content} mode="destinations" />
            </section>
            <aside className="budget-panel">
              <span className="eyebrow">DATOS DEL VIAJE</span>
              <h3>{totalDays} {totalDays === 1 ? "día" : "días"}</h3>
              <div className="budget-row">
                <span>Estado</span>
                <strong>{trip.archivedAt ? "Archivado" : tripStatuses[trip.status]}</strong>
              </div>
              <div className="budget-row">
                <span>Moneda</span>
                <strong>{trip.currency}</strong>
              </div>
              <FinanceSummary finance={content.finance} currency={trip.currency} />
            </aside>
          </div>
        )}
        {tab === "Itinerario" && (
          <TripContentPanel trip={trip} content={content} mode="itinerary" />
        )}
        {tab === "Reservas" && (
          <BookingPanel trip={trip} destinations={content.destinations} bookings={content.bookings} />
        )}
        {tab === "Presupuesto" && (
          <FinancePanel trip={trip} destinations={content.destinations} finance={content.finance} />
        )}
        {tab === "Documentos" && (
          <DocumentPanel tripId={trip.id} documents={content.documents} />
        )}
        {tab === "Mapa" && <MapPanel trip={trip} content={content} />}
      </div>
    </div>
  );
}
