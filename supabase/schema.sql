-- MACOKASA Kabaza Management System prototype schema.
-- Run this in the Supabase SQL editor for a free-plan prototype.
-- This schema stores prototype records as JSONB so the first release can move quickly.
-- Before production, split sensitive data into normalized tables and tighten RLS.

create extension if not exists pgcrypto;

create table if not exists public.macokasa_records (
  id uuid primary key default gen_random_uuid(),
  collection text not null check (
    collection in (
      'operators',
      'owners',
      'motorcycles',
      'payments',
      'cards',
      'cooperatives',
      'fundEntries',
      'donations'
    )
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists macokasa_records_collection_idx
  on public.macokasa_records (collection);

create index if not exists macokasa_records_payload_gin_idx
  on public.macokasa_records using gin (payload);

create table if not exists public.card_verifications (
  id uuid primary key default gen_random_uuid(),
  qr_token text not null,
  result text not null,
  scanned_by text,
  scanner_context text,
  created_at timestamptz not null default now()
);

create table if not exists public.reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  operator_membership_number text not null,
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  reminder_day integer not null,
  message text not null,
  status text not null default 'queued',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists macokasa_records_touch_updated_at on public.macokasa_records;
create trigger macokasa_records_touch_updated_at
before update on public.macokasa_records
for each row execute function public.touch_updated_at();

alter table public.macokasa_records enable row level security;
alter table public.card_verifications enable row level security;
alter table public.reminder_jobs enable row level security;

-- Prototype policies for testing the free static app.
-- Replace these with authenticated role policies before entering real member data.
drop policy if exists "Prototype read records" on public.macokasa_records;
create policy "Prototype read records"
on public.macokasa_records for select
to anon, authenticated
using (true);

drop policy if exists "Prototype insert records" on public.macokasa_records;
create policy "Prototype insert records"
on public.macokasa_records for insert
to anon, authenticated
with check (true);

drop policy if exists "Prototype update records" on public.macokasa_records;
create policy "Prototype update records"
on public.macokasa_records for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Prototype log card scans" on public.card_verifications;
create policy "Prototype log card scans"
on public.card_verifications for insert
to anon, authenticated
with check (true);

drop policy if exists "Staff read reminders" on public.reminder_jobs;
create policy "Staff read reminders"
on public.reminder_jobs for select
to anon, authenticated
using (true);

drop policy if exists "Staff insert reminders" on public.reminder_jobs;
create policy "Staff insert reminders"
on public.reminder_jobs for insert
to anon, authenticated
with check (true);

create or replace view public.operator_membership_summary as
select
  payload ->> 'district' as district,
  payload ->> 'membershipPlan' as membership_plan,
  count(*) as operators
from public.macokasa_records
where collection = 'operators'
group by 1, 2;
