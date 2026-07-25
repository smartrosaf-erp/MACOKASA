-- ============================================================
-- 0001_platform_tenancy.sql
--
-- Aligns MACOKASA with the Quick-Think multi-tenant platform
-- (Business & Implementation Plan, Section 4).
--
--   One codebase, one database, many tenants.
--   Every business row carries tenant_id.
--   PostgreSQL RLS enforces isolation at database level, so even
--   an application bug cannot leak one tenant's data to another.
--
-- SAFETY
--   Idempotent. Run on the STAGING project first (Section 18).
--   Take a pg_dump backup before running on production.
--   Existing rows are backfilled to the MACOKASA tenant, so no data
--   is orphaned and no visible change occurs for current users.
--
-- SCOPE NOTE
--   This migration covers TENANT subscriptions only in so far as
--   linking a tenant record. MACOKASA's own member subscriptions
--   (operators paying annual fees) are domain data inside
--   macokasa_records and are deliberately NOT modelled here.
--   See docs/PLATFORM-ALIGNMENT.md, "Two different subscription
--   concepts".
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Tenants
-- ------------------------------------------------------------

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  legal_name text,
  country_code text not null default 'MW',
  currency text not null default 'MWK',
  timezone text not null default 'Africa/Blantyre',
  status text not null default 'active'
    check (status in ('active', 'grace', 'read_only', 'suspended')),
  branding jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenants is
  'Client organisations on the Quick-Think platform. SmartROSAF is tenant #1.';
comment on column public.tenants.status is
  'Access state driven by the billing engine: active -> grace -> read_only -> suspended.';
comment on column public.tenants.branding is
  'Per-tenant logo, colours, display names. White-label is a premium tier; never a code fork.';

-- Domain to tenant resolution (erp.rosaf.org -> ROSAF tenant).
create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  domain text not null unique,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists tenant_domains_tenant_idx on public.tenant_domains (tenant_id);

-- Module toggles per tenant. The interface is built only from the
-- modules a subscription includes.
create table if not exists public.tenant_modules (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  primary key (tenant_id, module_key)
);

-- ------------------------------------------------------------
-- 2. Seed the MACOKASA tenant
-- ------------------------------------------------------------

insert into public.tenants (slug, name, legal_name, settings)
values (
  'macokasa',
  'MACOKASA',
  'Malawi Coalition for Kabaza Stakeholders Association',
  jsonb_build_object('vertical', 'membership', 'seededBy', '0001_platform_tenancy')
)
on conflict (slug) do nothing;

insert into public.tenant_modules (tenant_id, module_key)
select t.id, m.key
from public.tenants t
cross join (values
  ('operators'), ('membership'), ('cards'), ('payments'),
  ('owners'), ('safety'), ('cooperatives'), ('analytics'), ('content')
) as m(key)
where t.slug = 'macokasa'
on conflict do nothing;

-- ------------------------------------------------------------
-- 3. Add tenant_id to every business table and backfill
-- ------------------------------------------------------------

alter table public.profiles
  add column if not exists tenant_id uuid references public.tenants (id);
alter table public.macokasa_records
  add column if not exists tenant_id uuid references public.tenants (id);
alter table public.card_verifications
  add column if not exists tenant_id uuid references public.tenants (id);
alter table public.reminder_jobs
  add column if not exists tenant_id uuid references public.tenants (id);
alter table public.audit_log
  add column if not exists tenant_id uuid;

-- Backfill: everything that exists today belongs to MACOKASA.
do $$
declare
  macokasa_id uuid;
begin
  select id into macokasa_id from public.tenants where slug = 'macokasa';

  update public.profiles set tenant_id = macokasa_id where tenant_id is null;
  update public.macokasa_records set tenant_id = macokasa_id where tenant_id is null;
  update public.card_verifications set tenant_id = macokasa_id where tenant_id is null;
  update public.reminder_jobs set tenant_id = macokasa_id where tenant_id is null;
  update public.audit_log set tenant_id = macokasa_id where tenant_id is null;
end$$;

-- Now that nothing is null, enforce it.
alter table public.macokasa_records alter column tenant_id set not null;
alter table public.card_verifications alter column tenant_id set not null;
alter table public.reminder_jobs alter column tenant_id set not null;

-- Default new rows to the caller's tenant so application code cannot
-- forget. Discipline enforced by the database, not developer memory.
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

alter table public.macokasa_records
  alter column tenant_id set default public.current_tenant_id();
alter table public.card_verifications
  alter column tenant_id set default public.current_tenant_id();
alter table public.reminder_jobs
  alter column tenant_id set default public.current_tenant_id();

-- Composite indexes: tenant first, it is in every query.
create index if not exists macokasa_records_tenant_collection_idx
  on public.macokasa_records (tenant_id, collection);
create index if not exists card_verifications_tenant_idx
  on public.card_verifications (tenant_id, scanned_at desc);
create index if not exists reminder_jobs_tenant_idx
  on public.reminder_jobs (tenant_id, created_at desc);
create index if not exists audit_log_tenant_idx
  on public.audit_log (tenant_id, occurred_at desc);
create index if not exists profiles_tenant_idx
  on public.profiles (tenant_id);

-- ------------------------------------------------------------
-- 4. Memberships: a user belongs to a tenant with a role
-- ------------------------------------------------------------

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  role public.macokasa_role not null default 'member',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id)
);

create index if not exists memberships_tenant_idx on public.memberships (tenant_id);

-- Mirror existing profiles into memberships.
insert into public.memberships (user_id, tenant_id, role, is_active)
select p.id, p.tenant_id, p.role, p.is_active
from public.profiles p
where p.tenant_id is not null
on conflict (user_id, tenant_id) do nothing;

-- ------------------------------------------------------------
-- 5. Tenant-scoped RLS
--
-- Every policy now checks BOTH tenant and role. Role alone is no
-- longer sufficient: a staff user of tenant A must not read tenant B.
-- ------------------------------------------------------------

create or replace function public.tenant_status()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select t.status from public.tenants t where t.id = public.current_tenant_id()),
    'suspended'
  );
$$;

-- Writes are blocked unless the tenant is in good standing.
-- read_only and suspended are set by the billing engine.
create or replace function public.tenant_can_write()
returns boolean
language sql
stable
as $$
  select public.tenant_status() in ('active', 'grace');
$$;

alter table public.tenants enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.tenant_modules enable row level security;
alter table public.memberships enable row level security;

drop policy if exists "Read own tenant" on public.tenants;
create policy "Read own tenant"
on public.tenants for select
to authenticated
using (id = public.current_tenant_id());

drop policy if exists "Read own tenant domains" on public.tenant_domains;
create policy "Read own tenant domains"
on public.tenant_domains for select
to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists "Read own tenant modules" on public.tenant_modules;
create policy "Read own tenant modules"
on public.tenant_modules for select
to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists "Read own memberships" on public.memberships;
create policy "Read own memberships"
on public.memberships for select
to authenticated
using (
  user_id = auth.uid()
  or (tenant_id = public.current_tenant_id() and public.has_role(array['staff']))
);

-- Replace the role-only record policies with tenant + role policies.
drop policy if exists "Role scoped read" on public.macokasa_records;
create policy "Tenant and role scoped read"
on public.macokasa_records for select
to authenticated
using (
  tenant_id = public.current_tenant_id()
  and (
    public.has_role(array['staff'])
    or (public.has_role(array['printing']) and collection in ('cards', 'operators'))
    or (public.has_role(array['owner']) and collection in ('owners', 'motorcycles', 'operators', 'fundEntries'))
    or (public.has_role(array['webadmin']) and collection in ('stories', 'storyTombstones'))
  )
);

drop policy if exists "Role scoped insert" on public.macokasa_records;
create policy "Tenant and role scoped insert"
on public.macokasa_records for insert
to authenticated
with check (
  tenant_id = public.current_tenant_id()
  and public.tenant_can_write()
  and (
    public.has_role(array['staff'])
    or (public.has_role(array['printing']) and collection = 'cards')
    or (public.has_role(array['owner']) and collection in ('motorcycles', 'fundEntries'))
    or (public.has_role(array['webadmin']) and collection in ('stories', 'storyTombstones'))
  )
);

drop policy if exists "Role scoped update" on public.macokasa_records;
create policy "Tenant and role scoped update"
on public.macokasa_records for update
to authenticated
using (
  tenant_id = public.current_tenant_id()
  and (
    public.has_role(array['staff'])
    or (public.has_role(array['printing']) and collection = 'cards')
    or (public.has_role(array['owner']) and collection in ('motorcycles', 'fundEntries'))
    or (public.has_role(array['webadmin']) and collection in ('stories', 'storyTombstones'))
  )
)
with check (
  tenant_id = public.current_tenant_id()
  and public.tenant_can_write()
);

drop policy if exists "Staff delete non financial" on public.macokasa_records;
create policy "Tenant staff delete non financial"
on public.macokasa_records for delete
to authenticated
using (
  tenant_id = public.current_tenant_id()
  and public.tenant_can_write()
  and public.has_role(array['staff'])
  and collection not in ('payments', 'financeEntries', 'donations')
);

drop policy if exists "Staff read card scans" on public.card_verifications;
create policy "Tenant staff read card scans"
on public.card_verifications for select
to authenticated
using (tenant_id = public.current_tenant_id() and public.has_role(array['staff']));

drop policy if exists "Staff reminders" on public.reminder_jobs;
create policy "Tenant staff reminders"
on public.reminder_jobs for all
to authenticated
using (tenant_id = public.current_tenant_id() and public.has_role(array['staff']))
with check (tenant_id = public.current_tenant_id() and public.has_role(array['staff']));

drop policy if exists "Staff read audit" on public.audit_log;
create policy "Tenant staff read audit"
on public.audit_log for select
to authenticated
using (tenant_id = public.current_tenant_id() and public.has_role(array['staff']));

-- Profiles are tenant scoped too.
drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile or tenant staff"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or (tenant_id = public.current_tenant_id() and public.has_role(array['staff']))
);

drop policy if exists "Staff manage profiles" on public.profiles;
create policy "Tenant staff manage profiles"
on public.profiles for all
to authenticated
using (tenant_id = public.current_tenant_id() and public.has_role(array['staff']))
with check (tenant_id = public.current_tenant_id() and public.has_role(array['staff']));

-- ------------------------------------------------------------
-- 6. Audit trigger records the tenant
-- ------------------------------------------------------------

create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (
    tenant_id, actor, actor_role, action, collection, record_id, before, after
  )
  values (
    coalesce(new.tenant_id, old.tenant_id),
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

-- ------------------------------------------------------------
-- 7. Storage is tenant partitioned
--
-- Object paths become <tenant_id>/<member_id>/id-photo.jpg so one
-- tenant can never read another's member photographs.
-- ------------------------------------------------------------

drop policy if exists "Staff read member photos" on storage.objects;
create policy "Tenant staff read member photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'member-photos'
  and public.has_role(array['staff', 'printing'])
  and (storage.foldername(name))[1] = public.current_tenant_id()::text
);

drop policy if exists "Staff write member photos" on storage.objects;
create policy "Tenant staff write member photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'member-photos'
  and public.tenant_can_write()
  and public.has_role(array['staff', 'printing'])
  and (storage.foldername(name))[1] = public.current_tenant_id()::text
);

drop policy if exists "Staff update member photos" on storage.objects;
create policy "Tenant staff update member photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'member-photos'
  and public.has_role(array['staff', 'printing'])
  and (storage.foldername(name))[1] = public.current_tenant_id()::text
)
with check (
  bucket_id = 'member-photos'
  and public.tenant_can_write()
  and (storage.foldername(name))[1] = public.current_tenant_id()::text
);

-- ------------------------------------------------------------
-- 8. Reporting view respects tenancy
-- ------------------------------------------------------------

create or replace view public.operator_membership_summary
with (security_invoker = true) as
select
  tenant_id,
  payload ->> 'district' as district,
  payload ->> 'membershipPlan' as membership_plan,
  count(*) as operators
from public.macokasa_records
where collection = 'operators'
group by 1, 2, 3;

-- ------------------------------------------------------------
-- Verification (run manually after migrating)
-- ------------------------------------------------------------
--
--   select count(*) from public.macokasa_records where tenant_id is null;
--     -- must be 0
--
--   select slug, name, status from public.tenants;
--     -- must list macokasa
--
--   set local role authenticated;
--   -- as a user of tenant A, selecting tenant B's rows must return 0
--
