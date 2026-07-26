-- ============================================================
-- 0001a_adopt_existing_profiles.sql
--
-- Run this ONLY if 0000_preflight_inspect.sql reported that
-- public.profiles already exists (because SmartROSAF created it).
--
-- It brings an existing profiles table up to the shape the platform
-- needs WITHOUT dropping it, without changing any existing column,
-- and without touching a single ROSAF row beyond assigning them all
-- to the ROSAF tenant.
--
-- Safe to run more than once.
--
-- ⚠️ Take a backup first:
--    pg_dump "$DATABASE_URL" --schema=public -Fc -f pre-macokasa.dump
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Tenants must exist before anything can reference them
-- ------------------------------------------------------------

create extension if not exists "pgcrypto";

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

insert into public.tenants (slug, name, legal_name, settings)
values
  ('smartrosaf', 'SmartROSAF', 'Road Safety Alert Foundation',
   jsonb_build_object('vertical', 'erp')),
  ('macokasa', 'MACOKASA', 'Malawi Coalition for Kabaza Stakeholders Association',
   jsonb_build_object('vertical', 'membership'))
on conflict (slug) do nothing;

-- ------------------------------------------------------------
-- 2. Extend the existing profiles table, never replace it
--
-- Each column is added only if missing, so a ROSAF profiles table
-- with its own columns keeps every one of them.
-- ------------------------------------------------------------

alter table public.profiles add column if not exists tenant_id uuid references public.tenants (id);
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists district text;
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- The role column is the delicate one. ROSAF may already have a
-- `role` column of a different type. Add a separate, explicitly
-- named platform column rather than fighting over `role`.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_role') then
    create type public.platform_role as enum (
      'platform_admin', 'tenant_admin', 'operations',
      'finance', 'clerk', 'printing', 'viewer'
    );
  end if;
end$$;

alter table public.profiles
  add column if not exists platform_role public.platform_role not null default 'viewer';

comment on column public.profiles.platform_role is
  'Role within the Quick-Think platform. Kept separate from any pre-existing role column so SmartROSAF behaviour is unaffected.';

-- ------------------------------------------------------------
-- 3. Every existing profile belongs to ROSAF
--
-- Nothing is orphaned, and no ROSAF user changes what they can do
-- inside SmartROSAF, because that is governed by ROSAF's own column.
-- ------------------------------------------------------------

update public.profiles
   set tenant_id = (select id from public.tenants where slug = 'smartrosaf')
 where tenant_id is null;

create index if not exists profiles_tenant_idx on public.profiles (tenant_id);

-- ------------------------------------------------------------
-- 4. Platform helper functions
--
-- These read platform_role, so they are blind to ROSAF's own role
-- column and cannot alter ROSAF authorisation.
-- ------------------------------------------------------------

create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select platform_role::text from public.profiles where id = auth.uid() and is_active),
    'none'
  );
$$;

create or replace function public.has_role(allowed text[])
returns boolean language sql stable as $$
  select public.current_role_name() = any (allowed);
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select public.has_role(array['platform_admin', 'tenant_admin']);
$$;

create or replace function public.tenant_status()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select t.status from public.tenants t where t.id = public.current_tenant_id()),
    'suspended'
  );
$$;

create or replace function public.tenant_can_write()
returns boolean language sql stable as $$
  select public.tenant_status() in ('active', 'grace');
$$;

-- ------------------------------------------------------------
-- 5. Tenant metadata tables
-- ------------------------------------------------------------

create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  domain text not null unique,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.tenant_domains (tenant_id, domain, is_primary)
select id, 'erp.rosaf.org', true from public.tenants where slug = 'smartrosaf'
on conflict (domain) do nothing;

create table if not exists public.tenant_modules (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  primary key (tenant_id, module_key)
);

insert into public.tenant_modules (tenant_id, module_key)
select t.id, m.key
from public.tenants t
cross join (values
  ('members'), ('registration'), ('cards'), ('finance'),
  ('fleet'), ('packages'), ('reports'), ('settings')
) as m(key)
where t.slug = 'macokasa'
on conflict do nothing;

create table if not exists public.tenant_settings (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  key text not null,
  value jsonb not null,
  description text,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

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
returns trigger language plpgsql security definer set search_path = public as $$
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
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value from public.tenant_settings
      where tenant_id = public.current_tenant_id() and key = p_key),
    p_default
  );
$$;

-- ------------------------------------------------------------
-- 6. Shared infrastructure, namespaced to avoid ROSAF collisions
--
-- If ROSAF already has audit_log or notifications, we do NOT touch
-- them. The platform uses its own prefixed tables instead.
-- ------------------------------------------------------------

create table if not exists public.platform_audit_log (
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

create index if not exists platform_audit_tenant_idx
  on public.platform_audit_log (tenant_id, occurred_at desc);

create table if not exists public.platform_notifications (
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

create index if not exists platform_notifications_dispatch_idx
  on public.platform_notifications (tenant_id, status, scheduled_for);

create or replace function public.write_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec_tenant uuid;
begin
  begin
    rec_tenant := coalesce(new.tenant_id, old.tenant_id);
  exception when undefined_column then
    rec_tenant := public.current_tenant_id();
  end;

  insert into public.platform_audit_log (
    tenant_id, actor, actor_role, action, entity, entity_id, before, after
  )
  values (
    rec_tenant, auth.uid(), public.current_role_name(), lower(tg_op),
    tg_table_name, coalesce(new.id::text, old.id::text),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.touch_row()
returns trigger language plpgsql as $$
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
-- 7. RLS on the platform's own tables only
--
-- Deliberately does NOT enable RLS on any pre-existing ROSAF table.
-- Turning RLS on a live table without policies would immediately
-- break the SmartROSAF web app and Android client.
-- ------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.tenant_modules enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.tenant_settings_history enable row level security;
alter table public.platform_notifications enable row level security;
alter table public.platform_audit_log enable row level security;

drop policy if exists "Read own tenant" on public.tenants;
create policy "Read own tenant" on public.tenants for select to authenticated
using (id = public.current_tenant_id() or public.has_role(array['platform_admin']));

drop policy if exists "Admin update own tenant" on public.tenants;
create policy "Admin update own tenant" on public.tenants for update to authenticated
using (id = public.current_tenant_id() and public.is_admin())
with check (id = public.current_tenant_id());

drop policy if exists "Read own tenant domains" on public.tenant_domains;
create policy "Read own tenant domains" on public.tenant_domains for select to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists "Read own tenant modules" on public.tenant_modules;
create policy "Read own tenant modules" on public.tenant_modules for select to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists "Read tenant settings" on public.tenant_settings;
create policy "Read tenant settings" on public.tenant_settings for select to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists "Admin write tenant settings" on public.tenant_settings;
create policy "Admin write tenant settings" on public.tenant_settings for all to authenticated
using (tenant_id = public.current_tenant_id() and public.is_admin() and public.tenant_can_write())
with check (tenant_id = public.current_tenant_id() and public.is_admin() and public.tenant_can_write());

drop policy if exists "Admin read settings history" on public.tenant_settings_history;
create policy "Admin read settings history" on public.tenant_settings_history for select to authenticated
using (tenant_id = public.current_tenant_id() and public.is_admin());

drop policy if exists "Read own notifications" on public.platform_notifications;
create policy "Read own notifications" on public.platform_notifications for select to authenticated
using (
  tenant_id = public.current_tenant_id()
  and (recipient_user = auth.uid()
       or public.has_role(array['platform_admin','tenant_admin','operations','clerk']))
);

drop policy if exists "Staff queue notifications" on public.platform_notifications;
create policy "Staff queue notifications" on public.platform_notifications for insert to authenticated
with check (
  tenant_id = public.current_tenant_id() and public.tenant_can_write()
  and public.has_role(array['platform_admin','tenant_admin','operations','clerk','printing'])
);

drop policy if exists "Read tenant audit" on public.platform_audit_log;
create policy "Read tenant audit" on public.platform_audit_log for select to authenticated
using (
  tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','operations','finance'])
);

revoke insert, update, delete on public.platform_audit_log from anon, authenticated;
revoke update, delete on public.tenant_settings_history from anon, authenticated;

-- ------------------------------------------------------------
-- 8. Profiles policies — additive, and scoped to platform_role
--
-- Existing ROSAF policies on profiles are left untouched. These are
-- named distinctly so they cannot clash.
-- ------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "Platform read own profile" on public.profiles;
create policy "Platform read own profile" on public.profiles for select to authenticated
using (
  id = auth.uid()
  or (tenant_id = public.current_tenant_id()
      and public.has_role(array['platform_admin','tenant_admin','operations','finance']))
);

drop policy if exists "Platform admin manage profiles" on public.profiles;
create policy "Platform admin manage profiles" on public.profiles for all to authenticated
using (tenant_id = public.current_tenant_id() and public.is_admin())
with check (tenant_id = public.current_tenant_id() and public.is_admin());

commit;

-- ------------------------------------------------------------
-- Verify
-- ------------------------------------------------------------
--
--   select slug, name, status from public.tenants;
--     -- expect smartrosaf and macokasa
--
--   select count(*) from public.profiles where tenant_id is null;
--     -- expect 0
--
--   select platform_role, count(*) from public.profiles group by 1;
--     -- every existing ROSAF user should be 'viewer' until you
--     -- deliberately promote them
--
-- Then run 0002, 0003 and 0004 unchanged.
