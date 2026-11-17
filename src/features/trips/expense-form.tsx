"use client";

import { LoaderCircle, Save, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { IconButton } from "@/components/ui/states";
import { saveFinance } from "./expense-actions";
import { budgetSchema, expenseCategories, expenseCurrencies, expenseSchema, type Expense } from "./expense-model";
import type { Destination } from "./content-model";
import type { Trip, TripActionState } from "./model";

export type FinanceEditor = { kind: "budget" } | { kind: "expense"; record: Expense | null };

export function FinanceForm({ trip, destinations, budget, editor, onSaved, onBusy }: {
  trip: Trip; destinations: Destination[]; budget: string | null; editor: FinanceEditor; onSaved: () => void; onBusy: (busy: boolean) => void;
}) {
  const record = editor.kind === "expense" ? editor.record : null;
  const [budgetValue, setBudgetValue] = useState(budget || "");
  const [currency, setCurrency] = useState(record?.currency || trip.currency);
  const [rate, setRate] = useState(record?.base_currency === trip.currency ? record.exchange_rate || "" : "");
  const [rateDate, setRateDate] = useState(record?.base_currency === trip.currency ? record.rate_date || "" : "");
  const [state, action, pending] = useActionState<TripActionState, FormData>(async (previous, form) => {
    const parsed = (editor.kind === "budget" ? budgetSchema : expenseSchema).safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    onBusy(true);
    try { const result = await saveFinance(previous, form); if (result.success) onSaved(); return result; }
    catch { return { error: "No se pudo guardar. Tus campos se conservan para reintentar." }; }
    finally { onBusy(false); }
  }, {});

  return <form action={action} onReset={(event) => event.preventDefault()} aria-busy={pending}>
    <input type="hidden" name="trip_id" value={trip.id} />
    <input type="hidden" name="expected_currency" value={trip.currency} />
    <input type="hidden" name="kind" value={editor.kind} />
    {record && <input type="hidden" name="id" value={record.id} />}
    <fieldset className="trip-fields" disabled={pending}>
      {editor.kind === "budget" ? <div className="finance-budget-input">
        <label>Presupuesto en {trip.currency} (opcional)<input name="budget" inputMode="decimal" maxLength={21} value={budgetValue} onChange={(event) => setBudgetValue(event.target.value)} autoFocus /></label>
        <IconButton icon={Trash2} label="Quitar presupuesto" disabled={pending || !budgetValue} onClick={() => setBudgetValue("")} />
      </div> : <>
        <label>Concepto<input name="concept" defaultValue={record?.concept || ""} maxLength={160} required autoFocus /></label>
        <div className="form-dates">
          <label>Importe original<input name="amount" inputMode="decimal" defaultValue={record?.amount || ""} maxLength={21} required /></label>
          <label>Moneda original<select name="currency" value={currency} onChange={(event) => { setCurrency(event.target.value); setRate(""); setRateDate(""); }}>{expenseCurrencies.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>
        <label>Fecha del gasto<input type="date" name="expense_date" defaultValue={record?.expense_date || trip.start} required /></label>
        <label>Categoría<select name="category" defaultValue={record?.category || "other"}>{Object.entries(expenseCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Destino vinculado<select name="destination_id" defaultValue={record?.destination_id || ""}><option value="">Sin vincular</option>{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}</select></label>
        {record?.base_currency && record.base_currency !== trip.currency && <p className="form-error" role="status">Conversión anterior en {record.base_currency} pendiente de revisión.</p>}
        {currency !== trip.currency ? <fieldset className="finance-conversion">
          <legend>Conversión a {trip.currency}</legend>
          <label>Tasa: {trip.currency} por 1 {currency} (opcional)<input name="exchange_rate" inputMode="decimal" maxLength={25} value={rate} onChange={(event) => setRate(event.target.value)} /></label>
          <label>Fecha del cambio<input type="date" name="rate_date" value={rateDate} onChange={(event) => setRateDate(event.target.value)} required={Boolean(rate.trim())} /></label>
        </fieldset> : <><input type="hidden" name="exchange_rate" value="" /><input type="hidden" name="rate_date" value="" /></>}
        <label>Notas<textarea name="notes" defaultValue={record?.notes || ""} maxLength={4000} rows={3} /></label>
      </>}
    </fieldset>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <button className="button primary" type="submit" disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}{pending ? "Guardando…" : editor.kind === "budget" ? "Guardar presupuesto" : record ? "Guardar cambios" : "Crear gasto"}</button>
  </form>;
}