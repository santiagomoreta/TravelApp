import assert from "node:assert/strict";
import test from "node:test";
import { budgetSchema, expenseSchema, expenseTotals, sumAmounts, remainingBudget, moneyLabel, type Expense } from "../src/features/trips/expense-model.ts";
import { tripSchema } from "../src/features/trips/model.ts";

const values = { destination_id: "", concept: " Café ", amount: "0,10", currency: "eur", expense_date: "2027-03-20", category: "food", notes: "", exchange_rate: "", rate_date: "" };
const expense: Expense = { id: "expense", destination_id: null, concept: "Café", amount: "0.1", currency: "EUR", expense_date: "2027-03-20", category: "food", notes: null, exchange_rate: null, rate_date: null, base_currency: null, converted_amount: null };

test("expenses: decimal inputs, supported currencies, dates and protected fields", () => {
  const parsed = expenseSchema.parse({ ...values, trip_id: "forged", base_currency: "USD", converted_amount: "999" });
  assert.equal(parsed.amount, "0.10");
  assert.equal(parsed.currency, "EUR");
  assert.equal(parsed.concept, "Café");
  assert.ok(!("trip_id" in parsed) && !("base_currency" in parsed) && !("converted_amount" in parsed));
  for (const patch of [{ concept: " " }, { amount: "" }, { amount: "NaN" }, { amount: "1e5" }, { amount: "0.0000001" }, { amount: "-1" }, { amount: "100000000000000" }, { currency: "ZZZ" }, { destination_id: "forged" }, { expense_date: "2027-02-30" }, { category: "forged" }]) assert.equal(expenseSchema.safeParse({ ...values, ...patch }).success, false);
  assert.equal(budgetSchema.parse({ budget: "99999999999999,999999" }).budget, "99999999999999.999999");
  assert.equal(budgetSchema.parse({ budget: "" }).budget, "");
  assert.equal(budgetSchema.safeParse({ budget: "-0.1" }).success, false);
  assert.equal(tripSchema.shape.currency.safeParse("ZZZ").success, false);
  assert.equal(tripSchema.shape.currency.parse("eur"), "EUR");
});

test("expenses: rates are positive exact decimals and require snapshot date", () => {
  assert.equal(expenseSchema.parse({ ...values, exchange_rate: "0,000000000001", rate_date: "2027-03-20" }).exchange_rate, "0.000000000001");
  for (const patch of [{ exchange_rate: "0", rate_date: "2027-03-20" }, { exchange_rate: "1" }, { rate_date: "2027-03-20" }, { exchange_rate: "1e2", rate_date: "2027-03-20" }, { exchange_rate: "0.0000000000001", rate_date: "2027-03-20" }, { exchange_rate: "1000000000000", rate_date: "2027-03-20" }]) assert.equal(expenseSchema.safeParse({ ...values, ...patch }).success, false);
});

test("expenses: exact sums exceed row limit and remaining budget supports negative fractions", () => {
  assert.equal(sumAmounts(["99999999999999.999999", "99999999999999.999999", "0.000002"]), "200000000000000.000000");
  assert.equal(sumAmounts(["0.1", "0.2"]), "0.300000");
  assert.equal(sumAmounts([]), "0.000000");
  assert.equal(moneyLabel(remainingBudget("0", "0.000001"), "EUR"), "-0,000001 EUR");
  assert.equal(remainingBudget("0.3", "0.3"), "0.000000");
  assert.throws(() => sumAmounts(["1e5"]));
});

test("expenses: totals separate pending currencies and only accept snapshots in current base", () => {
  const rows = [expense,
    { ...expense, id: "converted", currency: "USD", amount: "5", exchange_rate: "0.9", rate_date: "2027-03-20", base_currency: "EUR", converted_amount: "4.5", destination_id: "madrid", category: "transport" as const },
    { ...expense, id: "pending", currency: "USD", amount: "2" },
    { ...expense, id: "stale", currency: "USD", amount: "3", base_currency: "GBP", converted_amount: "2.5" },
    { ...expense, id: "jpy", currency: "JPY", amount: "100" },
  ];
  const totals = expenseTotals(rows, "EUR");
  assert.equal(totals.spent, "4.600000");
  assert.deepEqual(totals.pending, [{ currency: "JPY", amount: "100.000000", count: 1 }, { currency: "USD", amount: "5.000000", count: 2 }]);
  assert.deepEqual(totals.categories, [{ key: "food", amount: "0.100000" }, { key: "transport", amount: "4.500000" }]);
  assert.deepEqual(totals.destinations, [{ key: "", amount: "0.100000" }, { key: "madrid", amount: "4.500000" }]);
  assert.equal(expenseTotals(rows, "USD").spent, "10.000000");
  assert.equal(expenseTotals([], "EUR").spent, "0.000000");
});