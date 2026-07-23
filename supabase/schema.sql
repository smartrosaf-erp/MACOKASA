-- MACOKASA Kabaza Management System first-release schema.
-- Run this in the Supabase SQL editor for the shared review database.
-- The first release stores operational records as JSONB so modules can evolve quickly.
-- Before storing real private member data, tighten RLS and use authenticated roles.

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
      'donations',
      'financeEntries',
      'stories',
      'storyTombstones',
      'reminderLogs'
    )
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.macokasa_records
drop constraint if exists macokasa_records_collection_check;

alter table public.macokasa_records
add constraint macokasa_records_collection_check
check (
  collection in (
    'operators',
    'owners',
    'motorcycles',
    'payments',
    'cards',
    'cooperatives',
    'fundEntries',
    'donations',
    'financeEntries',
    'stories',
    'storyTombstones',
    'reminderLogs'
  )
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

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'macokasa_records'
  ) then
    alter publication supabase_realtime add table public.macokasa_records;
  end if;
end;
$$;

alter table public.macokasa_records enable row level security;
alter table public.card_verifications enable row level security;
alter table public.reminder_jobs enable row level security;

-- Review policies for testing the shared app.
-- Replace these with authenticated role policies before entering real member data.
drop policy if exists "Review read records" on public.macokasa_records;
create policy "Review read records"
on public.macokasa_records for select
to anon, authenticated
using (true);

drop policy if exists "Review insert records" on public.macokasa_records;
create policy "Review insert records"
on public.macokasa_records for insert
to anon, authenticated
with check (true);

drop policy if exists "Review update records" on public.macokasa_records;
create policy "Review update records"
on public.macokasa_records for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Review delete records" on public.macokasa_records;
create policy "Review delete records"
on public.macokasa_records for delete
to anon, authenticated
using (true);

drop policy if exists "Review log card scans" on public.card_verifications;
create policy "Review log card scans"
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

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'member-photos',
  'member-photos',
  true,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read MACOKASA member photos" on storage.objects;
create policy "Public read MACOKASA member photos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'member-photos');

drop policy if exists "Upload MACOKASA member photos" on storage.objects;
create policy "Upload MACOKASA member photos"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'member-photos');

drop policy if exists "Update MACOKASA member photos" on storage.objects;
create policy "Update MACOKASA member photos"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'member-photos')
with check (bucket_id = 'member-photos');

create or replace view public.operator_membership_summary as
select
  payload ->> 'district' as district,
  payload ->> 'membershipPlan' as membership_plan,
  count(*) as operators
from public.macokasa_records
where collection = 'operators'
group by 1, 2;
