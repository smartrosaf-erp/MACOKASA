-- ============================================================
-- 0001_platform_core.sql
-- Quick-Think Solution — multi-tenant platform core
--
-- ONE database, MANY tenants. SmartROSAF is tenant #1,
-- MACOKASA is tenant #2. Every business row carries tenant_id and
-- PostgreSQL RLS enforces isolation at database level, so even an
-- application bug cannot leak one tenant's data to another.
--
-- This file contains ONLY the platform core (plan Section 5):
-- tenants, users, roles, modules, plans, billing, notifications,
-- audit. Vertical module sets live in their own migrations.
--
-- Idempotent. Run on staging first.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Tenants
-- ------------------------------------------------------------

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  legal_name text,
  country_code text not null default 'MW',
  currency text not null default 'MWK',
  timezone text not null default 'Africa/Blantyre',
  locale text not null default 'en-MW',
  status text not null default 'active'
    check (status in ('active', 'grace', 'read_only', 'suspended')),
  branding jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.tenants.status is
  'Billing engine access state: active -> grace -> read_only -> suspended.';
comment on column public.tenants.branding is
  'Logo, colours, display names. White-label by configuration, never a code fork.';

create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  domain text not null unique,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_modules (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  primary key (tenant_id, module_key)
);

-- ------------------------------------------------------------
-- Identity and access
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_role') then
    create type public.platform_role as enum (
      'platform_admin',   -- Quick-Think staff, cross-tenant
      'tenant_admin',     -- client's own administrator
      'operations',       -- operations manager: approvals, reprints
      'finance',          -- finance officer: reconciliation, payouts
      'clerk',            -- data clerk: registration, collections
      'printing',         -- card production
      'viewer'            -- read only
    );
  end if;
end$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid references public.tenants (id) on delete set null,
  full_name text,
  phone text,
  role public.platform_role not null default 'viewer',
  district text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_tenant_idx on public.profiles (tenant_id);

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

-- Security definer so policies can read profiles without recursing
-- through profiles' own RLS.
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid() and is_active;
$$;

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

-- Convenience: anyone who can administer the tenant.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.has_role(array['platform_admin', 'tenant_admin']);
$$;

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

-- Writes blocked unless the tenant is in good standing.
create or replace function public.tenant_can_write()
returns boolean
language sql
stable
as $$
  select public.tenant_status() in ('active', 'grace');
$$;

-- ------------------------------------------------------------
-- Configuration store
--
-- Fees, revenue splits, package benefits and card rules are DATA,
-- never code. Admins change them as economic conditions shift.
-- ------------------------------------------------------------

create table if not exists public.tenant_settings (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null,
  value jsonb not null,
  description text,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

comment on table public.tenant_settings is
  'Runtime configuration. Nothing here may be hardcoded in the application.';

-- Every change to configuration is history, not an overwrite.
create table if not exists public.tenant_settings_history (
  id bigserial primary key,
  tenant_id uuid not null,
  key text not null,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create or replace function public.record_setting_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tenant_settings_history (tenant_id, key, old_value, new_value, changed_by)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    coalesce(new.key, old.key),
    case when tg_op in ('UPDATE', 'DELETE') then old.value else null end,
    case when tg_op in ('INSERT', 'UPDATE') then new.value else null end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists tenant_settings_history_trg on public.tenant_settings;
create trigger tenant_settings_history_trg
after insert or update or delete on public.tenant_settings
for each row execute function public.record_setting_change();

create or replace function public.setting(p_key text, p_default jsonb default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.tenant_settings
      where tenant_id = public.current_tenant_id() and key = p_key),
    p_default
  );
$$;

-- ------------------------------------------------------------
-- Notifications (queued, never sent from the browser)
-- ------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  channel text not null check (channel in ('sms', 'email', 'whatsapp', 'in_app')),
  recipient text not null,
  recipient_user uuid references auth.users (id),
  subject text,
  body text not null,
  template_key text,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  provider text,
  provider_ref text,
  error text,
  attempts int not null default 0,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_dispatch_idx
  on public.notifications (tenant_id, status, scheduled_for);

comment on table public.notifications is
  'Outbound queue. A provider adapter drains this server-side. No provider is contracted yet, so rows accumulate as in_app until one is wired.';

-- ------------------------------------------------------------
-- Audit log — append only
-- ------------------------------------------------------------

create table if not exists public.audit_log (
  id bigserial primary key,
  tenant_id uuid,
  actor uuid,
  actor_role text,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  ip inet,
  occurred_at timestamptz not null default now()
);

create index if not exists audit_log_tenant_idx on public.audit_log (tenant_id, occurred_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);

create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec_tenant uuid;
  rec_id text;
begin
  begin
    rec_tenant := coalesce(new.tenant_id, old.tenant_id);
  exception when undefined_column then
    rec_tenant := public.current_tenant_id();
  end;

  rec_id := coalesce(new.id::text, old.id::text);

  insert into public.audit_log (
    tenant_id, actor, actor_role, action, entity, entity_id, before, after
  )
  values (
    rec_tenant,
    auth.uid(),
    public.current_role_name(),
    lower(tg_op),
    tg_table_name,
    rec_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

-- Shared updated_at + authorship stamp
create or replace function public.touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  begin
    if tg_op = 'INSERT' then
      new.created_by = coalesce(new.created_by, auth.uid());
    end if;
    new.updated_by = auth.uid();
  exception when undefined_column then
    null;
  end;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.tenant_modules enable row level security;
alter table public.profiles enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.tenant_settings_history enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "Read own tenant" on public.tenants;
create policy "Read own tenant"
on public.tenants for select to authenticated
using (id = public.current_tenant_id() or public.has_role(array['platform_admin']));

drop policy if exists "Admin update own tenant" on public.tenants;
create policy "Admin update own tenant"
on public.tenants for update to authenticated
using (id = public.current_tenant_id() and public.is_admin())
with check (id = public.current_tenant_id());

drop policy if exists "Read own tenant domains" on public.tenant_domains;
create policy "Read own tenant domains"
on public.tenant_domains for select to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists "Read own tenant modules" on public.tenant_modules;
create policy "Read own tenant modules"
on public.tenant_modules for select to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists "Read own profile or tenant admin" on public.profiles;
create policy "Read own profile or tenant admin"
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or (tenant_id = public.current_tenant_id()
      and public.has_role(array['platform_admin', 'tenant_admin', 'operations', 'finance']))
);

drop policy if exists "Admin manage profiles" on public.profiles;
create policy "Admin manage profiles"
on public.profiles for all to authenticated
using (tenant_id = public.current_tenant_id() and public.is_admin())
with check (tenant_id = public.current_tenant_id() and public.is_admin());

drop policy if exists "Read tenant settings" on public.tenant_settings;
create policy "Read tenant settings"
on public.tenant_settings for select to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists "Admin write tenant settings" on public.tenant_settings;
create policy "Admin write tenant settings"
on public.tenant_settings for all to authenticated
using (tenant_id = public.current_tenant_id() and public.is_admin() and public.tenant_can_write())
with check (tenant_id = public.current_tenant_id() and public.is_admin() and public.tenant_can_write());

drop policy if exists "Admin read settings history" on public.tenant_settings_history;
create policy "Admin read settings history"
on public.tenant_settings_history for select to authenticated
using (tenant_id = public.current_tenant_id() and public.is_admin());

drop policy if exists "Read own notifications" on public.notifications;
create policy "Read own notifications"
on public.notifications for select to authenticated
using (
  tenant_id = public.current_tenant_id()
  and (recipient_user = auth.uid()
       or public.has_role(array['platform_admin', 'tenant_admin', 'operations', 'clerk']))
);

drop policy if exists "Staff queue notifications" on public.notifications;
create policy "Staff queue notifications"
on public.notifications for insert to authenticated
with check (
  tenant_id = public.current_tenant_id()
  and public.tenant_can_write()
  and public.has_role(array['platform_admin', 'tenant_admin', 'operations', 'clerk', 'printing'])
);

drop policy if exists "Read tenant audit" on public.audit_log;
create policy "Read tenant audit"
on public.audit_log for select to authenticated
using (
  tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin', 'tenant_admin', 'operations', 'finance'])
);

-- The audit log is evidence. Nobody may rewrite it.
revoke insert, update, delete on public.audit_log from anon, authenticated;
revoke update, delete on public.tenant_settings_history from anon, authenticated;

-- ------------------------------------------------------------
-- Seed tenants
-- ------------------------------------------------------------

insert into public.tenants (slug, name, legal_name, settings)
values
  ('smartrosaf', 'SmartROSAF', 'Road Safety Alert Foundation',
   jsonb_build_object('vertical', 'erp')),
  ('macokasa', 'MACOKASA', 'Malawi Coalition for Kabaza Stakeholders Association',
   jsonb_build_object('vertical', 'membership'))
on conflict (slug) do nothing;

insert into public.tenant_modules (tenant_id, module_key)
select t.id, m.key
from public.tenants t
cross join (values
  ('members'), ('registration'), ('cards'), ('finance'),
  ('fleet'), ('packages'), ('reports'), ('settings')
) as m(key)
where t.slug = 'macokasa'
on conflict do nothing;
