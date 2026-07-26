-- ============================================================
-- 0005_tenant_extensibility.sql
--
-- Lets each tenant have a system that feels built for them, on one
-- codebase. Modelled on how SAP and Oracle solve the same problem:
-- a fixed core with defined configuration seams, never a fork.
--
--   tenant_terminology   what this tenant calls things
--   tenant_field_config  which core fields show, and whether required
--   custom_fields        fields the core has never heard of
--   custom_values        their values, typed, per record
--   tenant_workflow      approval routes and thresholds per tenant
--
-- Idempotent. Run after 0004. Adds nothing to any existing table.
-- ============================================================

-- ------------------------------------------------------------
-- Terminology
--
-- One tenant says "member", another "operator", a school "student".
-- The interface asks for a canonical key and renders the tenant's word.
-- ------------------------------------------------------------

create table if not exists public.tenant_terminology (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  term_key text not null,
  singular text not null,
  plural text not null,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, term_key)
);

comment on table public.tenant_terminology is
  'Per-tenant vocabulary. Interface code references a canonical key and never a literal noun.';

-- ------------------------------------------------------------
-- Field configuration
--
-- Decides, per tenant, whether a core field is hidden, optional,
-- required or read-only — and what its label says. Replaces the
-- branching that would otherwise accumulate in the forms.
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'field_visibility') then
    create type public.field_visibility as enum ('hidden', 'optional', 'required', 'readonly');
  end if;
end$$;

create table if not exists public.tenant_field_config (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  entity text not null,
  field_key text not null,
  visibility public.field_visibility not null default 'optional',
  label text,
  help_text text,
  sort_order int not null default 0,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  unique (tenant_id, entity, field_key)
);

create index if not exists field_config_lookup_idx
  on public.tenant_field_config (tenant_id, entity);

-- ------------------------------------------------------------
-- Custom fields
--
-- For requirements the core has never heard of: chassis number,
-- SACCO branch, cooperative group. Defined by an administrator,
-- stored as typed JSON, rendered wherever the entity is shown.
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'custom_field_type') then
    create type public.custom_field_type as enum (
      'text', 'number', 'date', 'boolean', 'select', 'multiselect', 'phone', 'email'
    );
  end if;
end$$;

create table if not exists public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  entity text not null,
  field_key text not null,
  label text not null,
  help_text text,
  data_type public.custom_field_type not null default 'text',
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  show_in_list boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (tenant_id, entity, field_key),
  -- Keys become object properties, so keep them predictable.
  constraint custom_field_key_shape check (field_key ~ '^[a-z][a-z0-9_]{1,40}$')
);

create index if not exists custom_fields_lookup_idx
  on public.custom_fields (tenant_id, entity, is_active);

create table if not exists public.custom_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  entity text not null,
  record_id uuid not null,
  values jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  unique (tenant_id, entity, record_id)
);

create index if not exists custom_values_record_idx
  on public.custom_values (tenant_id, entity, record_id);
create index if not exists custom_values_gin_idx
  on public.custom_values using gin (values);

-- ------------------------------------------------------------
-- Workflow variants
--
-- One tenant needs a second approval on large payments; another does
-- not. Same function, different configuration.
-- ------------------------------------------------------------

create table if not exists public.tenant_workflow (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  process_key text not null,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, process_key)
);

comment on table public.tenant_workflow is
  'Approval routes, thresholds and process options per tenant. Read by workflow functions rather than branching on tenant identity.';

create or replace function public.workflow(p_process text, p_default jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select config from public.tenant_workflow
      where tenant_id = public.current_tenant_id()
        and process_key = p_process
        and is_active),
    p_default
  );
$$;

-- Resolve a tenant's word for something, falling back to the key.
create or replace function public.term(p_key text, p_plural boolean default false)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case when p_plural then plural else singular end
       from public.tenant_terminology
      where tenant_id = public.current_tenant_id() and term_key = p_key),
    p_key
  );
$$;

-- ------------------------------------------------------------
-- Change history, mirroring tenant_settings_history
-- ------------------------------------------------------------

create table if not exists public.tenant_config_history (
  id bigserial primary key,
  tenant_id uuid,
  config_table text not null,
  config_key text,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists tenant_config_history_idx
  on public.tenant_config_history (tenant_id, changed_at desc);

create or replace function public.record_config_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tenant_config_history
    (tenant_id, config_table, config_key, old_value, new_value, changed_by)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    tg_table_name,
    coalesce(
      to_jsonb(new) ->> 'field_key',
      to_jsonb(old) ->> 'field_key',
      to_jsonb(new) ->> 'term_key',
      to_jsonb(old) ->> 'term_key',
      to_jsonb(new) ->> 'process_key',
      to_jsonb(old) ->> 'process_key'
    ),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['tenant_terminology', 'tenant_field_config', 'custom_fields', 'tenant_workflow']
  loop
    execute format('drop trigger if exists %I_history on public.%I', t, t);
    execute format(
      'create trigger %I_history after insert or update or delete on public.%I
       for each row execute function public.record_config_change()', t, t);
  end loop;
end$$;

-- ------------------------------------------------------------
-- Row level security
-- ------------------------------------------------------------

alter table public.tenant_terminology enable row level security;
alter table public.tenant_field_config enable row level security;
alter table public.custom_fields enable row level security;
alter table public.custom_values enable row level security;
alter table public.tenant_workflow enable row level security;
alter table public.tenant_config_history enable row level security;

-- Configuration is readable by anyone signed in to the tenant, because
-- the interface needs it to render at all.
do $$
declare t text;
begin
  foreach t in array array['tenant_terminology', 'tenant_field_config', 'custom_fields', 'tenant_workflow']
  loop
    execute format('drop policy if exists "Read %I" on public.%I', t, t);
    execute format(
      'create policy "Read %I" on public.%I for select to authenticated
       using (tenant_id = public.current_tenant_id())', t, t);

    execute format('drop policy if exists "Admin write %I" on public.%I', t, t);
    execute format(
      'create policy "Admin write %I" on public.%I for all to authenticated
       using (tenant_id = public.current_tenant_id() and public.is_admin() and public.tenant_can_write())
       with check (tenant_id = public.current_tenant_id() and public.is_admin() and public.tenant_can_write())', t, t);
  end loop;
end$$;

-- Custom values follow the record they belong to: any staff role that
-- may write the entity may write its custom values.
drop policy if exists "Read custom values" on public.custom_values;
create policy "Read custom values"
on public.custom_values for select to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists "Staff write custom values" on public.custom_values;
create policy "Staff write custom values"
on public.custom_values for all to authenticated
using (
  tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','operations','clerk','finance'])
)
with check (tenant_id = public.current_tenant_id() and public.tenant_can_write());

drop policy if exists "Admin read config history" on public.tenant_config_history;
create policy "Admin read config history"
on public.tenant_config_history for select to authenticated
using (tenant_id = public.current_tenant_id() and public.is_admin());

revoke update, delete on public.tenant_config_history from anon, authenticated;

-- ------------------------------------------------------------
-- Seed MACOKASA's own configuration
--
-- Deliberately shows the mechanism working for the first tenant, so
-- the second tenant is a configuration exercise rather than a build.
-- ------------------------------------------------------------

do $$
declare mck uuid;
begin
  select id into mck from public.tenants where slug = 'macokasa';
  if mck is null then return; end if;

  -- Branding, previously loaded but never populated.
  update public.tenants
     set branding = jsonb_build_object(
           'displayName', 'MACOKASA',
           'shortName',   'MACOKASA',
           'tagline',     'Kabaza Stakeholders Association',
           'logoUrl',     './assets/macokasa-logo.png',
           'primary',     '#0a5236',
           'accent',      '#c8901c',
           'ink',         '#0c1512'
         )
   where id = mck and (branding = '{}'::jsonb or branding is null);

  insert into public.tenant_terminology (tenant_id, term_key, singular, plural) values
    (mck, 'member',        'member',        'members'),
    (mck, 'operator',      'operator',      'operators'),
    (mck, 'owner',         'vehicle owner', 'vehicle owners'),
    (mck, 'vehicle',       'vehicle',       'vehicles'),
    (mck, 'card',          'identity card', 'identity cards'),
    (mck, 'clerk',         'clerk',         'clerks'),
    (mck, 'district',      'district',      'districts'),
    (mck, 'area',          'rank',          'ranks'),
    (mck, 'package',       'package',       'packages'),
    (mck, 'organisation',  'Association',   'Associations')
  on conflict (tenant_id, term_key) do nothing;

  insert into public.tenant_field_config (tenant_id, entity, field_key, visibility, label, sort_order) values
    (mck, 'member', 'first_name',       'required', 'First name', 1),
    (mck, 'member', 'last_name',        'required', 'Surname', 2),
    (mck, 'member', 'sex',              'required', 'Sex', 3),
    (mck, 'member', 'phone',            'required', 'Phone', 4),
    (mck, 'member', 'national_id',      'optional', 'National ID', 5),
    (mck, 'member', 'date_of_birth',    'optional', 'Date of birth', 6),
    (mck, 'member', 'email',            'optional', 'Email', 7),
    (mck, 'member', 'kin_name',         'optional', 'Next of kin', 8),
    (mck, 'member', 'kin_phone',        'optional', 'Next of kin phone', 9),
    (mck, 'member', 'physical_address', 'optional', 'Address or landmark', 10)
  on conflict (tenant_id, entity, field_key) do nothing;

  insert into public.tenant_workflow (tenant_id, process_key, config) values
    (mck, 'payment_confirmation', jsonb_build_object(
       'allowSelfConfirm', false,
       'requiresSecondApproval', false,
       'thresholdAmount', 0)),
    (mck, 'card_printing', jsonb_build_object(
       'printOnce', true,
       'reprintRole', 'operations',
       'sortBy', 'district_area_clerk')),
    (mck, 'remittance', jsonb_build_object(
       'allowSelfVerify', false,
       'varianceToleranceAmount', 0))
  on conflict (tenant_id, process_key) do nothing;
end$$;
