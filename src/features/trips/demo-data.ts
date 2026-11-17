import { locale } from "@/lib/i18n";

export type Trip = {
  id: string;
  name: string;
  country: string;
  start: string;
  end: string;
  destinations: string[];
  image: string | null;
  budgetCents: number;
  spentCents: number;
  currency: string;
  description: string;
};

export const demoTrips: Trip[] = [
  {
    id: "ecuador-2027",
    name: "Ecuador, sin prisa",
    country: "Ecuador",
    start: "2027-02-08",
    end: "2027-02-22",
    destinations: ["Quito", "Galápagos", "Guayaquil"],
    image: "/images/cotopaxi.jpg",
    budgetCents: 320000,
    spentCents: 124000,
    currency: "EUR",
    description:
      "De las calles de Quito al Pacífico. Dos semanas para recorrer los Andes y descubrir las islas.",
  },
  {
    id: "japon-2027",
    name: "Primavera en Japón",
    country: "Japón",
    start: "2027-04-03",
    end: "2027-04-17",
    destinations: ["Tokio", "Kioto", "Osaka"],
    image:
      "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1000&q=85",
    budgetCents: 450000,
    spentCents: 98000,
    currency: "EUR",
    description:
      "Templos, pequeños cafés y paseos entre cerezos. Un recorrido por tres ciudades con mucho por descubrir.",
  },
  {
    id: "dolomitas-2027",
    name: "Aire de montaña",
    country: "Italia",
    start: "2027-06-12",
    end: "2027-06-19",
    destinations: ["Bolzano", "Cortina d’Ampezzo"],
    image: "/images/dolomites.jpg",
    budgetCents: 140000,
    spentCents: 32000,
    currency: "EUR",
    description:
      "Senderos tranquilos, lagos y refugios en los Dolomitas. Una semana al aire libre.",
  },
  {
    id: "portugal-2026",
    name: "Escapada a Lisboa",
    country: "Portugal",
    start: "2026-09-10",
    end: "2026-09-14",
    destinations: ["Lisboa", "Sintra"],
    image:
      "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1000&q=85",
    budgetCents: 75000,
    spentCents: 68400,
    currency: "EUR",
    description: "Azulejos, tranvías y atardeceres junto al Tajo.",
  },
];

export function dateLabel(
  value: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
}

export function money(cents: number, currency = "EUR") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
