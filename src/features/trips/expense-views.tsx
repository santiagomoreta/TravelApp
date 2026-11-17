"use client";

import { LoaderCircle, Pencil, Plus, ReceiptText, Search, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { EmptyState, IconButton } from "@/components/ui/states";
import { deleteExpense } from "./expense-actions";
import { FinanceForm, type FinanceEditor } from "./expense-form";
import { expenseCategories, expenseTotals, moneyLabel, remainingBudget, type Expense, type TripFinance } from "./expense-model";
import type { Destination } from "./content-model";
import { dateLabel } from "./demo-data";
import type { Trip, TripActionState } from "./model";

export function FinanceSummary({ finance, currency }: { finance: TripFinance; currency: string }) {
  const totals = expenseTotals(finance.expenses, currency);
  const remaining = finance.budget === null ? null : remainingBudget(finance.budget, totals.spent);
  return <div className="finance-overview">
    <dl className="finance-summary">
      <div><dt>Presupuesto</dt><dd>{finance.budget === null ? "Sin presupuesto" : moneyLabel(finance.budget, currency)}</dd></div>
      <div><dt>{totals.pending.length ? "Contabilizado parcial" : "Gastado"}</dt><dd>{moneyLabel(totals.spent, currency)}</dd></div>
      <div><dt>{totals.pending.length ? "Disponible parcial" : "Disponible"}</dt><dd className={remaining?.startsWith("-") ? "finance-negative" : ""}>{remaining === null ? "Sin presupuesto" : moneyLabel(remaining, currency)}</dd></div>
    </dl>
    {totals.pending.length > 0 && <div className="finance-pending" role="status"><h4>Sin convertir a {currency}</h4><ul>{totals.pending.map((group) => <li key={group.currency}>{moneyLabel(group.amount, group.currency)} · {group.count} {group.count === 1 ? "gasto" : "gastos"}</li>)}</ul></div>}
  </div>;
}

function DeleteExpense({ tripId, expense, onClose, onDeleted }: { tripId: string; expense: Expense; onClose: () => void; onDeleted: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const [state, action, pending] = useActionState<TripActionState, FormData>(async (previous, form) => {
    try { const result = await deleteExpense(previous, form); if (result.success) onDeleted(); return result; }
    catch { return { error: "No se pudo eliminar. Inténtalo de nuevo." }; }
  }, {});
  return <dialog ref={dialog} className="create-dialog" aria-labelledby="delete-expense-title" onClose={onClose} onCancel={(event) => { if (pending) event.preventDefault(); }}>
    <div className="dialog-heading"><h2 id="delete-expense-title">Eliminar gasto</h2><IconButton icon={X} label="Cerrar" disabled={pending} onClick={() => dialog.current?.close()} /></div>
    <p>¿Eliminar «{expense.concept}»?</p>
    <form action={action} aria-busy={pending}>
      <input type="hidden" name="trip_id" value={tripId} /><input type="hidden" name="id" value={expense.id} />
      <label className="delete-confirmation"><input type="checkbox" name="confirmation" value="delete" required disabled={pending} />Confirmo la eliminación permanente.</label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="button danger" type="submit" disabled={pending}>{pending ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}{pending ? "Eliminando…" : "Eliminar"}</button>
    </form>
  </dialog>;
}

export function FinancePanel({ trip, destinations, finance }: { trip: Trip; destinations: Destination[]; finance: TripFinance }) {
  const [editor, setEditor] = useState<FinanceEditor | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [category, setCategory] = useState("all");
  const [destinationFilter, setDestinationFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const totals = expenseTotals(finance.expenses, trip.currency);
  const currencies = [...new Set(finance.expenses.map((expense) => expense.currency))].sort();
  const destination = ["all", "unlinked", ...destinations.map((item) => item.id)].includes(destinationFilter) ? destinationFilter : "all";
  const currency = currencies.includes(currencyFilter) ? currencyFilter : "all";
  const visible = finance.expenses.filter((expense) => (category === "all" || expense.category === category)
    && (destination === "all" || (destination === "unlinked" ? expense.destination_id === null : expense.destination_id === destination))
    && (currency === "all" || expense.currency === currency)
    && expense.concept.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")));

  function open(next: FinanceEditor) { setEditor(next); setVersion((value) => value + 1); setAnnouncement(""); dialog.current?.showModal(); }

  return <section className="trip-content-section" aria-label="Presupuesto y gastos del viaje">
    <div className="content-section-heading"><h3>Presupuesto y gastos</h3><div className="booking-commands">
      <button className="button secondary" onClick={() => open({ kind: "budget" })}><Pencil size={16} />Presupuesto</button>
      <button className="button primary" onClick={() => open({ kind: "expense", record: null })}><Plus size={16} />Añadir gasto</button>
    </div></div>
    <p className="content-announcement muted" role="status">{announcement}</p>
    <FinanceSummary finance={finance} currency={trip.currency} />
    {totals.categories.length > 0 && <section className="finance-distribution" aria-label="Distribución contabilizada"><h4>Distribución contabilizada</h4>
      <div><h5>Por categoría</h5><dl>{totals.categories.map((group) => <div key={group.key}><dt>{expenseCategories[group.key as keyof typeof expenseCategories]}</dt><dd>{moneyLabel(group.amount, trip.currency)}</dd></div>)}</dl></div>
      <div><h5>Por destino</h5><dl>{totals.destinations.map((group) => <div key={group.key}><dt>{destinations.find((item) => item.id === group.key)?.name || "Sin vincular"}</dt><dd>{moneyLabel(group.amount, trip.currency)}</dd></div>)}</dl></div>
    </section>}
    <h4 className="finance-list-heading">Gastos <span className="count-badge">{visible.length}</span></h4>
    <div className="expense-filters">
      <label className="search-box"><Search size={16} /><input aria-label="Buscar gasto" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar gasto" maxLength={160} /></label>
      <label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Todas las categorías</option>{Object.entries(expenseCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Destino<select value={destination} onChange={(event) => setDestinationFilter(event.target.value)}><option value="all">Todos los destinos</option><option value="unlinked">Sin vincular</option>{destinations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Moneda<select value={currency} onChange={(event) => setCurrencyFilter(event.target.value)}><option value="all">Todas las monedas</option>{currencies.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    {visible.length ? <ol className="booking-items expense-items">{visible.map((expense) => <li key={expense.id}>
      <ReceiptText size={22} className="booking-kind-icon" aria-hidden="true" />
      <div className="content-item-body">
        <p className="booking-date">{dateLabel(expense.expense_date, { day: "numeric", month: "long", year: "numeric" })}</p>
        <h4>{expense.concept}</h4><p>{expenseCategories[expense.category]} · {destinations.find((item) => item.id === expense.destination_id)?.name || "Sin vincular"}</p>
        <p className="booking-price">{moneyLabel(expense.amount, expense.currency)}</p>
        {expense.currency !== trip.currency && (expense.base_currency === trip.currency && expense.converted_amount !== null ? <p>{moneyLabel(expense.converted_amount, trip.currency)} · Tasa {expense.exchange_rate} · {expense.rate_date && dateLabel(expense.rate_date, { day: "numeric", month: "short", year: "numeric" })}</p> : <p className="muted">Pendiente de conversión a {trip.currency}</p>)}
        {expense.notes && <details className="activity-notes"><summary>Notas</summary><p>{expense.notes}</p></details>}
      </div>
      <div className="content-item-actions"><IconButton icon={Pencil} label={`Editar ${expense.concept}`} onClick={() => open({ kind: "expense", record: expense })} /><IconButton icon={Trash2} label={`Eliminar ${expense.concept}`} onClick={() => setDeleting(expense)} /></div>
    </li>)}</ol> : <EmptyState title={finance.expenses.length ? "Sin coincidencias" : "Sin gastos todavía"} description="No hay gastos para esta selección." />}
    <dialog ref={dialog} className="create-dialog" aria-labelledby="finance-editor-title" onClose={() => setEditor(null)} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <div className="dialog-heading"><h2 id="finance-editor-title">{editor?.kind === "budget" ? "Presupuesto" : editor?.record ? "Editar gasto" : "Nuevo gasto"}</h2><IconButton icon={X} label="Cerrar" disabled={busy} onClick={() => dialog.current?.close()} /></div>
      {editor && <FinanceForm key={version} trip={trip} destinations={destinations} budget={finance.budget} editor={editor} onBusy={setBusy} onSaved={() => { dialog.current?.close(); setAnnouncement(editor.kind === "budget" ? "Presupuesto guardado." : "Gasto guardado."); }} />}
    </dialog>
    {deleting && <DeleteExpense key={deleting.id} tripId={trip.id} expense={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); setAnnouncement("Gasto eliminado."); }} />}
  </section>;
}