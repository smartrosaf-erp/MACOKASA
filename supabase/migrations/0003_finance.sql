-- ============================================================
-- 0003_finance.sql
-- MACOKASA finance module
--
-- Requirements this implements:
--   7. Fees collected by a clerk sit in that clerk's custody until
--      remitted and reconciled with finance.
--   8. Revenue on membership and renewals splits by a CONFIGURED
--      ratio (initially 80 MACOKASA / 20 Quick-Think).
--      MACOKASA sees two balances:
--        Actual    = 100% of collections
--        Available = its own share only
--      Quick-Think can only request what is available, by electronic
--      invoice. Paying it reduces QTS's actual balance and is booked
--      as a MACOKASA expense WITHOUT reducing MACOKASA's share,
--      because the split already happened.
--   10. A finance module with the logic to actually operate.
--
-- Accounting stance: double entry is overkill here, but a single
-- append-only ledger with a signed amount and an explicit account is
-- not. Every movement of money is a ledger row. Balances are derived,
-- never stored, so they cannot drift.
--
-- Idempotent. Run after 0002_macokasa_membership.sql.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum (
      'cash', 'airtel_money', 'mpamba', 'bank_transfer', 'card', 'paychangu'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum (
      'pending', 'confirmed', 'reversed', 'failed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'custody_status') then
    create type public.custody_status as enum (
      'held', 'remitted', 'reconciled', 'short', 'written_off'
    );
  end if;
end$$;

-- ------------------------------------------------------------
-- Ledger accounts
--
-- Kept deliberately small and explicit rather than a full chart of
-- accounts, so the logic stays auditable by a non-accountant.
-- ------------------------------------------------------------

create table if not exists public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null check (kind in ('revenue', 'share', 'custody', 'bank', 'expense', 'liability')),
  party text not null default 'macokasa' check (party in ('macokasa', 'quickthink', 'clerk', 'external')),
  is_active boolean not null default true,
  unique (tenant_id, code)
);

-- ------------------------------------------------------------
-- Payments
-- ------------------------------------------------------------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  receipt_no text not null,
  member_id uuid references public.members (id) on delete set null,
  membership_id uuid references public.memberships (id) on delete set null,

  purpose text not null default 'membership'
    check (purpose in ('registration', 'renewal', 'card', 'replacement', 'donation', 'other')),
  method public.payment_method not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'MWK',

  -- Every payment is taken by somebody. Point 7: it is their custody
  -- until reconciled, whatever the method.
  collected_by uuid not null references auth.users (id),
  collected_at timestamptz not null default now(),

  status public.payment_status not null default 'pending',
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,

  provider_ref text,
  payer_phone text,
  notes text,

  reversal_of uuid references public.payments (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, receipt_no)
);

create index if not exists payments_member_idx on public.payments (member_id);
create index if not exists payments_collector_idx on public.payments (tenant_id, collected_by, status);
create index if not exists payments_date_idx on public.payments (tenant_id, collected_at desc);

-- ------------------------------------------------------------
-- The ledger: append only, signed amounts, derived balances
-- ------------------------------------------------------------

create table if not exists public.ledger_entries (
  id bigserial primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  entry_group uuid not null default gen_random_uuid(),
  account_id uuid not null references public.ledger_accounts (id),
  party text not null check (party in ('macokasa', 'quickthink', 'clerk', 'external')),
  clerk_id uuid references auth.users (id),
  payment_id uuid references public.payments (id) on delete set null,
  settlement_id uuid,
  amount numeric(14, 2) not null,      -- signed: credit positive, debit negative
  currency text not null default 'MWK',
  description text not null,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists ledger_tenant_party_idx on public.ledger_entries (tenant_id, party, occurred_at);
create index if not exists ledger_account_idx on public.ledger_entries (account_id, occurred_at);
create index if not exists ledger_clerk_idx on public.ledger_entries (tenant_id, clerk_id)
  where clerk_id is not null;
create index if not exists ledger_group_idx on public.ledger_entries (entry_group);

comment on table public.ledger_entries is
  'Append only. Corrections are reversing entries, never updates or deletes.';

-- ------------------------------------------------------------
-- Clerk custody: money in a named person''s hands
-- ------------------------------------------------------------

create table if not exists public.custody_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  clerk_id uuid not null references auth.users (id),
  payment_id uuid not null references public.payments (id) on delete cascade,
  amount numeric(14, 2) not null,
  status public.custody_status not null default 'held',
  remittance_id uuid,
  created_at timestamptz not null default now(),
  unique (payment_id)
);

create index if not exists custody_clerk_idx on public.custody_records (tenant_id, clerk_id, status);

create table if not exists public.remittances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  reference text not null,
  clerk_id uuid not null references auth.users (id),
  declared_amount numeric(14, 2) not null check (declared_amount >= 0),
  expected_amount numeric(14, 2) not null default 0,
  variance numeric(14, 2) generated always as (declared_amount - expected_amount) stored,
  method public.payment_method not null default 'cash',
  deposit_ref text,
  status text not null default 'submitted'
    check (status in ('submitted', 'verified', 'disputed', 'cleared')),
  submitted_at timestamptz not null default now(),
  verified_by uuid references auth.users (id),
  verified_at timestamptz,
  notes text,
  unique (tenant_id, reference)
);

create index if not exists remittances_clerk_idx on public.remittances (tenant_id, clerk_id, status);

-- What a clerk currently owes.
create or replace function public.clerk_custody_balance(p_clerk uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(c.amount), 0)
  from public.custody_records c
  where c.tenant_id = public.current_tenant_id()
    and c.clerk_id = p_clerk
    and c.status = 'held';
$$;

-- ------------------------------------------------------------
-- Revenue split
--
-- The ratio is CONFIGURATION, not code. Stored in tenant_settings
-- under 'revenue_split'. Historical splits are preserved by
-- tenant_settings_history, so past periods reconcile correctly.
-- ------------------------------------------------------------

create or replace function public.split_ratio(p_party text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (public.setting('revenue_split') ->> p_party)::numeric,
    case p_party when 'macokasa' then 0.80 when 'quickthink' then 0.20 else 0 end
  );
$$;

-- Posting a confirmed payment writes the whole set of ledger entries
-- in one atomic group:
--   1. revenue recognised at 100%
--   2. MACOKASA share
--   3. Quick-Think share
--   4. clerk custody liability
create or replace function public.post_payment_to_ledger(p_payment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pay record;
  grp uuid := gen_random_uuid();
  acc_rev uuid;
  acc_mck uuid;
  acc_qts uuid;
  acc_cust uuid;
  mck_share numeric;
  qts_share numeric;
  splittable boolean;
begin
  select * into pay from public.payments where id = p_payment;
  if not found then
    raise exception 'Payment % not found', p_payment;
  end if;

  if pay.status <> 'confirmed' then
    raise exception 'Only confirmed payments may be posted to the ledger';
  end if;

  if exists (select 1 from public.ledger_entries where payment_id = p_payment) then
    return; -- already posted; posting is idempotent
  end if;

  select id into acc_rev from public.ledger_accounts
    where tenant_id = pay.tenant_id and code = 'REV-MEMBERSHIP';
  select id into acc_mck from public.ledger_accounts
    where tenant_id = pay.tenant_id and code = 'SHARE-MACOKASA';
  select id into acc_qts from public.ledger_accounts
    where tenant_id = pay.tenant_id and code = 'SHARE-QTS';
  select id into acc_cust from public.ledger_accounts
    where tenant_id = pay.tenant_id and code = 'CUSTODY-CLERK';

  -- Point 8: the split applies to membership and renewal revenue.
  splittable := pay.purpose in ('registration', 'renewal');

  if splittable then
    qts_share := round(pay.amount * public.split_ratio('quickthink'), 2);
    mck_share := pay.amount - qts_share;   -- remainder, so rounding never leaks
  else
    qts_share := 0;
    mck_share := pay.amount;
  end if;

  insert into public.ledger_entries
    (tenant_id, entry_group, account_id, party, clerk_id, payment_id, amount, description, occurred_at, created_by)
  values
    (pay.tenant_id, grp, acc_rev, 'macokasa', null, pay.id, pay.amount,
     'Revenue: ' || pay.purpose || ' receipt ' || pay.receipt_no, pay.collected_at, auth.uid()),
    (pay.tenant_id, grp, acc_mck, 'macokasa', null, pay.id, mck_share,
     'MACOKASA share of ' || pay.receipt_no, pay.collected_at, auth.uid()),
    (pay.tenant_id, grp, acc_cust, 'clerk', pay.collected_by, pay.id, pay.amount,
     'Custody: ' || pay.receipt_no, pay.collected_at, auth.uid());

  if qts_share > 0 then
    insert into public.ledger_entries
      (tenant_id, entry_group, account_id, party, payment_id, amount, description, occurred_at, created_by)
    values
      (pay.tenant_id, grp, acc_qts, 'quickthink', pay.id, qts_share,
       'Quick-Think share of ' || pay.receipt_no, pay.collected_at, auth.uid());
  end if;

  insert into public.custody_records (tenant_id, clerk_id, payment_id, amount)
  values (pay.tenant_id, pay.collected_by, pay.id, pay.amount)
  on conflict (payment_id) do nothing;
end;
$$;

-- ------------------------------------------------------------
-- Balances
--
-- Point 8: MACOKASA sees Actual (100%) and Available (its share).
-- Paying Quick-Think reduces QTS's balance and is recorded as a
-- MACOKASA expense, but does NOT reduce MACOKASA's available share,
-- because the split already happened at collection.
-- ------------------------------------------------------------

create or replace view public.v_balances
with (security_invoker = true) as
select
  l.tenant_id,
  -- Actual: everything collected and confirmed, 100%
  coalesce(sum(l.amount) filter (where a.code = 'REV-MEMBERSHIP'), 0) as actual_revenue,
  -- Available: MACOKASA's share, less what MACOKASA has already drawn
  coalesce(sum(l.amount) filter (where a.code in ('SHARE-MACOKASA', 'MACOKASA-DRAW')), 0) as macokasa_available,
  -- Quick-Think: share accrued less settlements paid out
  coalesce(sum(l.amount) filter (where a.code in ('SHARE-QTS', 'QTS-SETTLEMENT')), 0) as quickthink_balance,
  -- Money still in clerks' hands
  coalesce(sum(l.amount) filter (where a.code in ('CUSTODY-CLERK', 'CUSTODY-REMIT')), 0) as clerk_custody
from public.ledger_entries l
join public.ledger_accounts a on a.id = l.account_id
group by l.tenant_id;

create or replace view public.v_clerk_custody
with (security_invoker = true) as
select
  c.tenant_id,
  c.clerk_id,
  p.full_name as clerk_name,
  count(*) filter (where c.status = 'held') as held_count,
  coalesce(sum(c.amount) filter (where c.status = 'held'), 0) as held_amount,
  coalesce(sum(c.amount) filter (where c.status = 'remitted'), 0) as remitted_amount,
  coalesce(sum(c.amount) filter (where c.status = 'reconciled'), 0) as reconciled_amount,
  max(c.created_at) filter (where c.status = 'held') as oldest_held_at
from public.custody_records c
left join public.profiles p on p.id = c.clerk_id
group by c.tenant_id, c.clerk_id, p.full_name;

-- ------------------------------------------------------------
-- Quick-Think settlement
--
-- Point 8: QTS initiates by electronic invoice. Only the available
-- balance may be requested. MACOKASA approves and pays.
-- ------------------------------------------------------------

create table if not exists public.qts_settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  invoice_no text not null,
  period_start date,
  period_end date,
  amount_requested numeric(14, 2) not null check (amount_requested > 0),
  amount_available_at_request numeric(14, 2) not null,
  amount_paid numeric(14, 2),
  currency text not null default 'MWK',
  status text not null default 'requested'
    check (status in ('draft', 'requested', 'approved', 'paid', 'rejected', 'cancelled')),
  requested_by uuid references auth.users (id),
  requested_at timestamptz not null default now(),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  paid_by uuid references auth.users (id),
  paid_at timestamptz,
  payment_method public.payment_method,
  payment_ref text,
  rejection_reason text,
  notes text,
  unique (tenant_id, invoice_no)
);

create index if not exists qts_settlements_status_idx on public.qts_settlements (tenant_id, status);

-- Quick-Think may only request what is actually available to them.
create or replace function public.guard_settlement_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  available numeric;
begin
  select coalesce(quickthink_balance, 0) into available
  from public.v_balances where tenant_id = new.tenant_id;

  if new.status = 'requested' and new.amount_requested > coalesce(available, 0) then
    raise exception
      'Requested % exceeds the available Quick-Think balance of %.',
      new.amount_requested, coalesce(available, 0)
      using errcode = 'check_violation';
  end if;

  new.amount_available_at_request := coalesce(available, 0);
  return new;
end;
$$;

drop trigger if exists qts_settlement_guard on public.qts_settlements;
create trigger qts_settlement_guard
before insert or update of status, amount_requested on public.qts_settlements
for each row
when (new.status in ('requested', 'approved'))
execute function public.guard_settlement_request();

-- Paying a settlement: reduce QTS balance, book a MACOKASA expense.
-- Deliberately does NOT touch SHARE-MACOKASA: the 80% was never QTS's
-- money, so paying QTS cannot reduce MACOKASA's available share.
create or replace function public.pay_qts_settlement(
  p_settlement uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_ref text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  grp uuid := gen_random_uuid();
  acc_settle uuid;
  acc_expense uuid;
begin
  select * into s from public.qts_settlements where id = p_settlement;
  if not found then
    raise exception 'Settlement % not found', p_settlement;
  end if;
  if s.status <> 'approved' then
    raise exception 'Settlement must be approved before payment';
  end if;
  if p_amount <= 0 or p_amount > s.amount_requested then
    raise exception 'Payment must be positive and no more than the requested amount';
  end if;

  select id into acc_settle from public.ledger_accounts
    where tenant_id = s.tenant_id and code = 'QTS-SETTLEMENT';
  select id into acc_expense from public.ledger_accounts
    where tenant_id = s.tenant_id and code = 'EXP-PLATFORM-FEE';

  insert into public.ledger_entries
    (tenant_id, entry_group, account_id, party, settlement_id, amount, description, created_by)
  values
    -- Negative: draws down the Quick-Think balance
    (s.tenant_id, grp, acc_settle, 'quickthink', s.id, -p_amount,
     'Settlement paid, invoice ' || s.invoice_no, auth.uid()),
    -- Memo expense for MACOKASA reporting. Does not affect available.
    (s.tenant_id, grp, acc_expense, 'macokasa', s.id, -p_amount,
     'Platform fee expense, invoice ' || s.invoice_no, auth.uid());

  update public.qts_settlements
     set status = 'paid',
         amount_paid = p_amount,
         paid_at = now(),
         paid_by = auth.uid(),
         payment_method = p_method,
         payment_ref = p_ref
   where id = p_settlement;
end;
$$;

-- ------------------------------------------------------------
-- Expenses
-- ------------------------------------------------------------

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  reference text not null,
  category text not null,
  description text not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'MWK',
  incurred_on date not null default current_date,
  method public.payment_method,
  payee text,
  settlement_id uuid references public.qts_settlements (id),
  status text not null default 'recorded'
    check (status in ('recorded', 'approved', 'paid', 'rejected')),
  recorded_by uuid references auth.users (id),
  approved_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (tenant_id, reference)
);

create index if not exists expenses_tenant_date_idx on public.expenses (tenant_id, incurred_on desc);

-- ------------------------------------------------------------
-- Seed ledger accounts for MACOKASA
-- ------------------------------------------------------------

insert into public.ledger_accounts (tenant_id, code, name, kind, party)
select t.id, a.code, a.name, a.kind, a.party
from public.tenants t
cross join (values
  ('REV-MEMBERSHIP',   'Membership revenue (gross)',      'revenue',   'macokasa'),
  ('SHARE-MACOKASA',   'MACOKASA share',                  'share',     'macokasa'),
  ('SHARE-QTS',        'Quick-Think share',               'share',     'quickthink'),
  ('QTS-SETTLEMENT',   'Quick-Think settlements paid',    'share',     'quickthink'),
  ('MACOKASA-DRAW',    'MACOKASA withdrawals',            'bank',      'macokasa'),
  ('CUSTODY-CLERK',    'Clerk cash custody',              'custody',   'clerk'),
  ('CUSTODY-REMIT',    'Clerk remittances',               'custody',   'clerk'),
  ('EXP-PLATFORM-FEE', 'Platform fee expense',            'expense',   'macokasa'),
  ('EXP-GENERAL',      'General expenses',                'expense',   'macokasa')
) as a(code, name, kind, party)
where t.slug = 'macokasa'
on conflict (tenant_id, code) do nothing;

-- ------------------------------------------------------------
-- Triggers and RLS
-- ------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['payments', 'qts_settlements', 'expenses', 'remittances']
  loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I
       for each row execute function public.write_audit()', t, t);
  end loop;
end$$;

alter table public.ledger_accounts enable row level security;
alter table public.payments enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.custody_records enable row level security;
alter table public.remittances enable row level security;
alter table public.qts_settlements enable row level security;
alter table public.expenses enable row level security;

drop policy if exists "Read ledger accounts" on public.ledger_accounts;
create policy "Read ledger accounts"
on public.ledger_accounts for select to authenticated
using (tenant_id = public.current_tenant_id());

-- Clerks see the payments they took. Finance and above see everything.
drop policy if exists "Read payments" on public.payments;
create policy "Read payments"
on public.payments for select to authenticated
using (
  tenant_id = public.current_tenant_id()
  and (
    public.has_role(array['platform_admin','tenant_admin','operations','finance'])
    or collected_by = auth.uid()
  )
);

drop policy if exists "Record payments" on public.payments;
create policy "Record payments"
on public.payments for insert to authenticated
with check (
  tenant_id = public.current_tenant_id()
  and public.tenant_can_write()
  and public.has_role(array['platform_admin','tenant_admin','operations','finance','clerk'])
  and collected_by = auth.uid()
);

-- Only finance may confirm or reverse. A clerk cannot self-confirm.
drop policy if exists "Finance update payments" on public.payments;
create policy "Finance update payments"
on public.payments for update to authenticated
using (
  tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','operations','finance'])
)
with check (tenant_id = public.current_tenant_id() and public.tenant_can_write());

-- The ledger is evidence: readable by finance, never editable by anyone.
drop policy if exists "Finance read ledger" on public.ledger_entries;
create policy "Finance read ledger"
on public.ledger_entries for select to authenticated
using (
  tenant_id = public.current_tenant_id()
  and (
    public.has_role(array['platform_admin','tenant_admin','finance','operations'])
    or clerk_id = auth.uid()
  )
);

revoke insert, update, delete on public.ledger_entries from anon, authenticated;

drop policy if exists "Read custody" on public.custody_records;
create policy "Read custody"
on public.custody_records for select to authenticated
using (
  tenant_id = public.current_tenant_id()
  and (public.has_role(array['platform_admin','tenant_admin','finance','operations'])
       or clerk_id = auth.uid())
);

drop policy if exists "Finance update custody" on public.custody_records;
create policy "Finance update custody"
on public.custody_records for update to authenticated
using (tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','finance']))
with check (tenant_id = public.current_tenant_id() and public.tenant_can_write());

drop policy if exists "Read remittances" on public.remittances;
create policy "Read remittances"
on public.remittances for select to authenticated
using (
  tenant_id = public.current_tenant_id()
  and (public.has_role(array['platform_admin','tenant_admin','finance','operations'])
       or clerk_id = auth.uid())
);

drop policy if exists "Clerk submit remittance" on public.remittances;
create policy "Clerk submit remittance"
on public.remittances for insert to authenticated
with check (
  tenant_id = public.current_tenant_id()
  and public.tenant_can_write()
  and clerk_id = auth.uid()
);

-- The clerk who submits must not be the person who verifies.
drop policy if exists "Finance verify remittance" on public.remittances;
create policy "Finance verify remittance"
on public.remittances for update to authenticated
using (
  tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','finance'])
  and clerk_id <> auth.uid()
)
with check (tenant_id = public.current_tenant_id() and public.tenant_can_write());

-- Quick-Think raises the invoice; MACOKASA approves and pays.
drop policy if exists "Read settlements" on public.qts_settlements;
create policy "Read settlements"
on public.qts_settlements for select to authenticated
using (
  tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','finance','operations'])
);

drop policy if exists "QTS request settlement" on public.qts_settlements;
create policy "QTS request settlement"
on public.qts_settlements for insert to authenticated
with check (
  tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin'])
);

drop policy if exists "Settlement workflow" on public.qts_settlements;
create policy "Settlement workflow"
on public.qts_settlements for update to authenticated
using (
  tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','finance'])
)
with check (tenant_id = public.current_tenant_id() and public.tenant_can_write());

drop policy if exists "Read expenses" on public.expenses;
create policy "Read expenses"
on public.expenses for select to authenticated
using (tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','finance','operations']));

drop policy if exists "Finance write expenses" on public.expenses;
create policy "Finance write expenses"
on public.expenses for all to authenticated
using (tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','finance']))
with check (tenant_id = public.current_tenant_id() and public.tenant_can_write());
