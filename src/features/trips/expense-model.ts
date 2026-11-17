import { z } from "zod";
import { priceLabel, transportSchema } from "./booking-model.ts";
import type { Database } from "../../lib/supabase/database.types";

export const expenseCategories = { transport: "Transporte", accommodation: "Alojamiento", food: "Comida", activities: "Actividades", shopping: "Compras", other: "Otros" } as const;
export const expenseCurrencies = Intl.supportedValuesOf("currency");
const amount = transportSchema.shape.amount;
export const budgetSchema = z.object({ budget: amount });
export const expenseSchema = z.object({
  destination_id: z.union([z.literal(""), z.uuid()]),
  concept: z.string().trim().min(1, "Completa el concepto.").max(160),
  amount: amount.refine(Boolean, "Completa el importe."),
  currency: transportSchema.shape.currency.refine((value) => expenseCurrencies.includes(value), "Selecciona una moneda admitida."),
  expense_date: z.iso.date(),
  category: z.enum(["transport", "accommodation", "food", "activities", "shopping", "other"]),
  notes: z.string().trim().max(4000),
  exchange_rate: z.string().trim().transform((value) => value.replace(",", ".")).refine((value) => !value || (/^(0|[1-9]\d{0,11})(\.\d{1,12})?$/.test(value) && /[1-9]/.test(value)), "Usa una tasa mayor que cero, con hasta 12 enteros y 12 decimales."),
  rate_date: z.union([z.literal(""), z.iso.date()]),
}).refine((value) => Boolean(value.exchange_rate) === Boolean(value.rate_date), { message: "Completa tasa y fecha, o deja ambas vacías.", path: ["exchange_rate"] });

type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
export type Expense = Omit<ExpenseRow, "trip_id" | "created_at" | "updated_at" | "amount" | "exchange_rate" | "converted_amount"> & { amount: string; exchange_rate: string | null; converted_amount: string | null };
export type TripFinance = { budget: string | null; expenses: Expense[] };

function units(value: string) {
  if (!/^-?\d+(\.\d{1,6})?$/.test(value)) throw new Error("Importe decimal no válido.");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const unsigned = BigInt(whole) * BigInt(1000000) + BigInt(fraction.padEnd(6, "0"));
  return value.startsWith("-") ? -unsigned : unsigned;
}

function decimal(value: bigint) {
  const digits = (value < BigInt(0) ? -value : value).toString().padStart(7, "0");
  return `${value < BigInt(0) ? "-" : ""}${digits.slice(0, -6)}.${digits.slice(-6)}`;
}

export function sumAmounts(values: string[]) { return decimal(values.reduce((total, value) => total + units(value), BigInt(0))); }
export function remainingBudget(budget: string, spent: string) { return decimal(units(budget) - units(spent)); }
export function moneyLabel(value: string, currency: string) { return `${value.startsWith("-") ? "-" : ""}${priceLabel(value.replace(/^-/, ""), currency)}`; }

export function expenseTotals(expenses: Expense[], currency: string) {
  const pending = new Map<string, { amounts: string[]; count: number }>();
  const categories = new Map<string, string[]>();
  const destinations = new Map<string, string[]>();
  const accounted: string[] = [];
  for (const expense of expenses) {
    const effective = expense.currency === currency ? expense.amount : expense.base_currency === currency ? expense.converted_amount : null;
    if (effective === null) {
      const group = pending.get(expense.currency) || { amounts: [], count: 0 };
      group.amounts.push(expense.amount);
      group.count += 1;
      pending.set(expense.currency, group);
      continue;
    }
    accounted.push(effective);
    categories.set(expense.category, [...(categories.get(expense.category) || []), effective]);
    const destination = expense.destination_id || "";
    destinations.set(destination, [...(destinations.get(destination) || []), effective]);
  }
  const groups = (values: Map<string, string[]>) => [...values].map(([key, amounts]) => ({ key, amount: sumAmounts(amounts) })).sort((first, second) => first.key.localeCompare(second.key));
  return {
    spent: sumAmounts(accounted),
    pending: [...pending].map(([currency, group]) => ({ currency, amount: sumAmounts(group.amounts), count: group.count })).sort((first, second) => first.currency.localeCompare(second.currency)),
    categories: groups(categories), destinations: groups(destinations),
  };
}