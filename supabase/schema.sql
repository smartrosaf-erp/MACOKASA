-- ============================================================
-- MACOKASA Kabaza Management System — production schema
-- Safe to re-run.
--
-- SECURITY MODEL
--   anon           : may insert card scan logs ONLY. No table reads.
--   authenticated  : scoped by role held in public.profiles.role
--   service_role   : full access, server side only, never in the browser
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Roles and profiles
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'macokasa_role') then
    create type public.macokasa_role as enum ('staff', 'owner', 'printing', 'webadmin', 'member');
  end if;
end$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.macokasa_role not null default 'member',
  district text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create a profile automatically for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Role helper. SECURITY DEFINER so policies can read profiles
-- without recursing through profiles' own RLS.
create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role::text from public.profiles where id = auth.uid() and is_active),
    'none'
  );
$$;

create or replace function public.has_role(allowed text[])
returns boolean
language sql
stable
as $$
  select public.current_role_name() = any (allowed);
$$;

-- ------------------------------------------------------------
-- Core records
-- ------------------------------------------------------------

create table if not exists public.macokasa_records (
  id uuid primary key default gen_random_uuid(),
  collection text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.macokasa_records
  add column if not exists created_by uuid references auth.users (id);
alter table public.macokasa_records
  add column if not exists updated_by uuid references auth.users (id);

create index if not exists macokasa_records_collection_idx
  on public.macokasa_records (collection);
create index if not exists macokasa_records_payload_idx
  on public.macokasa_records using gin (payload);

create table if not exists public.card_verifications (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  scanned_at timestamptz not null default now(),
  user_agent text
);

create table if not exists public.reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  recipient text,
  status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Immutable audit trail (P0-5)
-- ------------------------------------------------------------

create table if not exists public.audit_log (
  id bigserial primary key,
  actor uuid,
  actor_role text,
  action text not null,
  collection text,
  record_id uuid,
  before jsonb,
  after jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_log_occurred_idx on public.audit_log (occurred_at desc);
create index if not exists audit_log_collection_idx on public.audit_log (collection);

create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor, actor_role, action, collection, record_id, before, after)
  values (
    auth.uid(),
    public.current_role_name(),
    lower(tg_op),
    coalesce(new.collection, old.collection),
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists macokasa_records_audit on public.macokasa_records;
create trigger macokasa_records_audit
after insert or update or delete on public.macokasa_records
for each row execute function public.write_audit();

-- Stamp authorship + updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if tg_op = 'INSERT' then
    new.created_by = coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists macokasa_records_touch_updated_at on public.macokasa_records;
create trigger macokasa_records_touch_updated_at
before insert or update on public.macokasa_records
for each row execute function public.touch_updated_at();

-- Realtime
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
end$$;

-- ------------------------------------------------------------
-- Row level security (P0-2)
-- ------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.macokasa_records enable row level security;
alter table public.card_verifications enable row level security;
alter table public.reminder_jobs enable row level security;
alter table public.audit_log enable row level security;

-- Remove the permissive review policies from the prototype.
drop policy if exists "Review read records" on public.macokasa_records;
drop policy if exists "Review insert records" on public.macokasa_records;
drop policy if exists "Review update records" on public.macokasa_records;
drop policy if exists "Review delete records" on public.macokasa_records;
drop policy if exists "Review log card scans" on public.card_verifications;
drop policy if exists "Staff read reminders" on public.reminder_jobs;
drop policy if exists "Staff insert reminders" on public.reminder_jobs;

-- profiles: a user sees their own; staff see all.
drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.has_role(array['staff']));

drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists "Staff manage profiles" on public.profiles;
create policy "Staff manage profiles"
on public.profiles for all
to authenticated
using (public.has_role(array['staff']))
with check (public.has_role(array['staff']));

-- macokasa_records: read scoped by role and collection.
drop policy if exists "Role scoped read" on public.macokasa_records;
create policy "Role scoped read"
on public.macokasa_records for select
to authenticated
using (
  public.has_role(array['staff'])
  or (public.has_role(array['printing']) and collection in ('cards', 'operators'))
  or (public.has_role(array['owner']) and collection in ('owners', 'motorcycles', 'operators', 'fundEntries'))
  or (public.has_role(array['webadmin']) and collection in ('stories', 'storyTombstones'))
);

drop policy if exists "Role scoped insert" on public.macokasa_records;
create policy "Role scoped insert"
on public.macokasa_records for insert
to authenticated
with check (
  public.has_role(array['staff'])
  or (public.has_role(array['printing']) and collection = 'cards')
  or (public.has_role(array['owner']) and collection in ('motorcycles', 'fundEntries'))
  or (public.has_role(array['webadmin']) and collection in ('stories', 'storyTombstones'))
);

drop policy if exists "Role scoped update" on public.macokasa_records;
create policy "Role scoped update"
on public.macokasa_records for update
to authenticated
using (
  public.has_role(array['staff'])
  or (public.has_role(array['printing']) and collection = 'cards')
  or (public.has_role(array['owner']) and collection in ('motorcycles', 'fundEntries'))
  or (public.has_role(array['webadmin']) and collection in ('stories', 'storyTombstones'))
)
with check (
  public.has_role(array['staff'])
  or (public.has_role(array['printing']) and collection = 'cards')
  or (public.has_role(array['owner']) and collection in ('motorcycles', 'fundEntries'))
  or (public.has_role(array['webadmin']) and collection in ('stories', 'storyTombstones'))
);

-- Deletion is staff-only, and never for financial records.
drop policy if exists "Staff delete non financial" on public.macokasa_records;
create policy "Staff delete non financial"
on public.macokasa_records for delete
to authenticated
using (
  public.has_role(array['staff'])
  and collection not in ('payments', 'financeEntries', 'donations')
);

-- Public QR scan logging is the only anon write on the system.
drop policy if exists "Anon log card scan" on public.card_verifications;
create policy "Anon log card scan"
on public.card_verifications for insert
to anon, authenticated
with check (true);

drop policy if exists "Staff read card scans" on public.card_verifications;
create policy "Staff read card scans"
on public.card_verifications for select
to authenticated
using (public.has_role(array['staff']));

drop policy if exists "Staff reminders" on public.reminder_jobs;
create policy "Staff reminders"
on public.reminder_jobs for all
to authenticated
using (public.has_role(array['staff']))
with check (public.has_role(array['staff']));

-- Audit log is read-only to staff; nobody may edit or delete it.
drop policy if exists "Staff read audit" on public.audit_log;
create policy "Staff read audit"
on public.audit_log for select
to authenticated
using (public.has_role(array['staff']));

revoke insert, update, delete on public.audit_log from anon, authenticated;

-- ------------------------------------------------------------
-- Member photos — PRIVATE bucket (P0-3)
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-photos',
  'member-photos',
  false,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Drop the prototype's public read.
drop policy if exists "Public read MACOKASA member photos" on storage.objects;
drop policy if exists "Upload MACOKASA member photos" on storage.objects;
drop policy if exists "Update MACOKASA member photos" on storage.objects;

drop policy if exists "Staff read member photos" on storage.objects;
create policy "Staff read member photos"
on storage.objects for select
to authenticated
using (bucket_id = 'member-photos' and public.has_role(array['staff', 'printing']));

drop policy if exists "Staff write member photos" on storage.objects;
create policy "Staff write member photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'member-photos' and public.has_role(array['staff', 'printing']));

drop policy if exists "Staff update member photos" on storage.objects;
create policy "Staff update member photos"
on storage.objects for update
to authenticated
using (bucket_id = 'member-photos' and public.has_role(array['staff', 'printing']))
with check (bucket_id = 'member-photos' and public.has_role(array['staff', 'printing']));

-- ------------------------------------------------------------
-- Reporting view
-- ------------------------------------------------------------

create or replace view public.operator_membership_summary
with (security_invoker = true) as
select
  payload ->> 'district' as district,
  payload ->> 'membershipPlan' as membership_plan,
  count(*) as operators
from public.macokasa_records
where collection = 'operators'
group by 1, 2;

-- ------------------------------------------------------------
-- Bootstrapping the first staff account
-- ------------------------------------------------------------
-- 1. Create the user in Supabase Dashboard > Authentication > Users.
-- 2. Then run, replacing the email:
--
--    update public.profiles
--       set role = 'staff'
--     where id = (select id from auth.users where email = 'admin@macokasa.org');
--
-- Never assign roles from the browser.
