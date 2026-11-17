begin;

create function public.save_trip_finance(p_trip_id uuid, p_expense_id uuid, p_kind text, p_values jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  trip_currency text;
  saved_id uuid;
  amount_text text := nullif(p_values ->> case when p_kind = 'budget' then 'budget' else 'amount' end, '');
  rate_text text := nullif(p_values ->> 'exchange_rate', '');
  rate numeric;
  conversion_date date;
  original_currency text := p_values ->> 'currency';
begin
  select currency into trip_currency from public.trips
    where id = p_trip_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Trip unavailable' using errcode = '42501'; end if;
  if (p_values ->> 'expected_currency') is distinct from trip_currency then
    raise exception 'Trip currency changed; reload before saving' using errcode = '23514';
  end if;
  if amount_text is not null and amount_text !~ '^(0|[1-9][0-9]{0,13})([.][0-9]{1,6})?$' then
    raise exception 'Invalid exact decimal amount' using errcode = '23514';
  end if;
  if p_kind = 'budget' and p_expense_id is null then
    update public.trips set budget = amount_text::numeric where id = p_trip_id;
    return p_trip_id;
  elsif p_kind <> 'expense' or p_kind is null then
    raise exception 'Invalid finance operation' using errcode = '23514';
  end if;
  if amount_text is null then raise exception 'Amount required' using errcode = '23514'; end if;
  if rate_text is not null and rate_text !~ '^(0|[1-9][0-9]{0,11})([.][0-9]{1,12})?$' then
    raise exception 'Invalid exact exchange rate' using errcode = '23514';
  end if;
  rate := rate_text::numeric;
  conversion_date := nullif(p_values ->> 'rate_date', '')::date;
  if (rate is null) <> (conversion_date is null) or rate <= 0
    or (rate is not null and original_currency = trip_currency) then
    raise exception 'Invalid conversion snapshot' using errcode = '23514';
  end if;
  if p_expense_id is null then
    insert into public.expenses(trip_id, destination_id, concept, amount, currency,
      expense_date, category, notes, exchange_rate, rate_date, base_currency)
    values (p_trip_id, nullif(p_values ->> 'destination_id', '')::uuid,
      p_values ->> 'concept', amount_text::numeric, original_currency,
      (p_values ->> 'expense_date')::date, p_values ->> 'category',
      nullif(p_values ->> 'notes', ''), rate, conversion_date,
      case when rate is not null then trip_currency else null end)
    returning id into saved_id;
  else
    update public.expenses set destination_id = nullif(p_values ->> 'destination_id', '')::uuid,
      concept = p_values ->> 'concept', amount = amount_text::numeric, currency = original_currency,
      expense_date = (p_values ->> 'expense_date')::date, category = p_values ->> 'category',
      notes = nullif(p_values ->> 'notes', ''), exchange_rate = rate, rate_date = conversion_date,
      base_currency = case when rate is not null then trip_currency else null end
    where id = p_expense_id and trip_id = p_trip_id returning id into saved_id;
    if not found then raise exception 'Expense unavailable' using errcode = '42501'; end if;
  end if;
  return saved_id;
end;
$$;

revoke all on function public.save_trip_finance(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_trip_finance(uuid, uuid, text, jsonb) to authenticated;

create function travel_private.check_budget_currency()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.currency is distinct from old.currency and old.budget is not null then
    raise exception 'Existing budget requires review before changing currency' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function travel_private.check_budget_currency() from public, anon, authenticated;
create trigger trips_budget_currency before update of currency on public.trips
for each row execute function travel_private.check_budget_currency();

commit;