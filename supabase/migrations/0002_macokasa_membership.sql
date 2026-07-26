-- ============================================================
-- 0002_macokasa_membership.sql
-- MACOKASA membership vertical
--
-- Concept:
--   * A national database of Kabaza taxi operators.
--   * Two operator types: PEDALIST (bicycle) and MOTORIST (motorcycle).
--   * A person may operate, may own and rent out, or may do both.
--     One person = one member record, with role flags.
--   * Membership renews annually. Fees and packages are CONFIGURATION,
--     set by MACOKASA admins, never hardcoded.
--   * Clerks register members face to face and confirm each entry.
--   * Payment may be deferred: member is saved as pending_payment and
--     found later when they pay.
--
-- Idempotent. Run after 0001_platform_core.sql.
-- ============================================================

-- ------------------------------------------------------------
-- Enumerations
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'operator_type') then
    create type public.operator_type as enum ('pedalist', 'motorist');
  end if;

  if not exists (select 1 from pg_type where typname = 'member_status') then
    create type public.member_status as enum (
      'draft',            -- clerk is still capturing
      'pending_payment',  -- saved, awaiting fee
      'active',           -- paid and current
      'lapsed',           -- annual period ended
      'suspended',        -- disciplinary or fraud hold
      'deceased'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'card_status') then
    create type public.card_status as enum (
      'awaiting_payment',
      'ready_for_print',
      'queued',
      'printing',
      'printed',
      'dispatched',
      'collected',
      'reprint_requested',
      'void'
    );
  end if;
end$$;

-- ------------------------------------------------------------
-- Geography: districts and areas drive card sorting and dispatch
-- ------------------------------------------------------------

create table if not exists public.districts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  code text not null,
  region text,
  is_active boolean not null default true,
  unique (tenant_id, name)
);

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  district_id uuid not null references public.districts (id) on delete cascade,
  name text not null,
  rank_name text,
  is_active boolean not null default true,
  unique (district_id, name)
);

create index if not exists areas_district_idx on public.areas (district_id);

-- ------------------------------------------------------------
-- Packages — Regular / Silver / Gold / Platinum
--
-- Fees and benefits are DATA. Admins add, retire and reprice.
-- Benefits are rows, so new benefits "trickle in" without a deploy.
-- ------------------------------------------------------------

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  applies_to text not null default 'operator'
    check (applies_to in ('operator', 'owner', 'both')),
  operator_type public.operator_type,   -- null = applies to both types
  rank int not null default 0,          -- display + tier ordering
  colour text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

comment on column public.packages.operator_type is
  'Null means the package is offered to both pedalists and motorists.';

create table if not exists public.package_benefits (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages (id) on delete cascade,
  benefit text not null,
  detail text,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create index if not exists package_benefits_pkg_idx on public.package_benefits (package_id);

-- Priced periods. Never update a fee in place: supersede it, so
-- historical invoices always reconcile against the fee then in force.
create table if not exists public.package_fees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  package_id uuid not null references public.packages (id) on delete cascade,
  fee_type text not null check (fee_type in ('registration', 'renewal', 'card', 'replacement')),
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null default 'MWK',
  effective_from date not null default current_date,
  effective_to date,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create index if not exists package_fees_lookup_idx
  on public.package_fees (tenant_id, package_id, fee_type, effective_from desc);

-- The fee in force for a package on a given date.
create or replace function public.current_fee(
  p_package uuid,
  p_fee_type text,
  p_on date default current_date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select f.amount
  from public.package_fees f
  where f.package_id = p_package
    and f.fee_type = p_fee_type
    and f.effective_from <= p_on
    and (f.effective_to is null or f.effective_to > p_on)
  order by f.effective_from desc
  limit 1;
$$;

-- ------------------------------------------------------------
-- Members
--
-- One person, one record. A person may be an operator, an owner who
-- rents vehicles out, or both. Roles are flags, not separate records.
-- ------------------------------------------------------------

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  membership_no text,

  -- Identity
  first_name text not null,
  last_name text not null,
  other_names text,
  sex text check (sex in ('male', 'female')),
  date_of_birth date,
  national_id text,
  phone text not null,
  alt_phone text,
  email text,

  -- Roles: at least one must be true
  is_operator boolean not null default true,
  is_owner boolean not null default false,
  operator_type public.operator_type,

  -- Where they work
  district_id uuid references public.districts (id),
  area_id uuid references public.areas (id),
  physical_address text,

  -- Next of kin
  kin_name text,
  kin_phone text,
  kin_relationship text,

  -- Compliance (type appropriate; enforced in the application)
  has_licence boolean not null default false,
  licence_no text,
  licence_expiry date,
  training_ref text,

  -- Face photo: private storage object path, never a public URL
  photo_path text,
  photo_captured_at timestamptz,

  -- Membership state
  package_id uuid references public.packages (id),
  status public.member_status not null default 'draft',
  joined_on date,
  period_start date,
  period_end date,

  -- Who captured this record
  registered_by uuid references auth.users (id),
  verified_by uuid references auth.users (id),
  verified_at timestamptz,

  notes text,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint member_has_a_role check (is_operator or is_owner),
  constraint operator_needs_type check (not is_operator or operator_type is not null),
  unique (tenant_id, membership_no)
);

create index if not exists members_tenant_status_idx on public.members (tenant_id, status);
create index if not exists members_district_idx on public.members (district_id, area_id);
create index if not exists members_phone_idx on public.members (tenant_id, phone);
create index if not exists members_name_idx on public.members (tenant_id, last_name, first_name);
create index if not exists members_expiry_idx on public.members (tenant_id, period_end)
  where status = 'active';

-- Membership numbers encode the operator type so a card is
-- unambiguous: MCK-M-BT-2026-0001 / MCK-P-BT-2026-0001.
create or replace function public.next_membership_no(
  p_tenant uuid,
  p_type public.operator_type,
  p_district uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  type_code text;
  dist_code text;
  yr text;
  seq int;
begin
  type_code := case p_type when 'motorist' then 'M' else 'P' end;
  select coalesce(code, 'XX') into dist_code from public.districts where id = p_district;
  yr := to_char(current_date, 'YYYY');

  -- Sequence is per tenant, type, district and year, so series never collide.
  select count(*) + 1 into seq
  from public.members m
  where m.tenant_id = p_tenant
    and m.operator_type = p_type
    and m.district_id = p_district
    and m.membership_no is not null
    and m.membership_no like 'MCK-' || type_code || '-' || coalesce(dist_code, 'XX') || '-' || yr || '-%';

  return 'MCK-' || type_code || '-' || coalesce(dist_code, 'XX') || '-' || yr || '-' || lpad(seq::text, 4, '0');
end;
$$;

-- ------------------------------------------------------------
-- Fleet: vehicles owned and rented out
--
-- Point 3: bring owners into the equation. They register, renew, and
-- get a fleet management tool plus access to MACOKASA-vetted operators.
-- ------------------------------------------------------------

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  vehicle_type public.operator_type not null,
  identifier text not null,            -- plate for motorist, frame/rank ID for pedalist
  make text,
  model text,
  year_of_make int,
  colour text,
  -- Motorist only
  has_tracker boolean not null default false,
  helmet_count int not null default 0,
  -- Pedalist only
  has_reflector boolean not null default false,
  condition text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, identifier)
);

create index if not exists vehicles_owner_idx on public.vehicles (owner_member_id);

-- Who is riding which vehicle, on what terms.
create table if not exists public.vehicle_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  operator_member_id uuid not null references public.members (id) on delete cascade,
  agreement_type text not null default 'daily_target'
    check (agreement_type in ('daily_target', 'weekly_target', 'monthly_target', 'monthly_hire', 'commission')),
  agreed_amount numeric(14, 2) not null default 0,
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'ended', 'terminated')),
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create index if not exists assignments_vehicle_idx on public.vehicle_assignments (vehicle_id, status);
create index if not exists assignments_operator_idx on public.vehicle_assignments (operator_member_id, status);

-- One active assignment per vehicle.
create unique index if not exists assignments_one_active_per_vehicle
  on public.vehicle_assignments (vehicle_id)
  where status = 'active';

-- MACOKASA recommendation: owners source trusted operators here.
create table if not exists public.operator_ratings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  operator_member_id uuid not null references public.members (id) on delete cascade,
  rated_by uuid references auth.users (id),
  reliability int check (reliability between 1 and 5),
  safety int check (safety between 1 and 5),
  conduct int check (conduct between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists ratings_operator_idx on public.operator_ratings (operator_member_id);

-- ------------------------------------------------------------
-- Registration workflow: capture, then confirm
--
-- Point 6: each entry is confirmed after entering, so bad data does
-- not enter the database.
-- ------------------------------------------------------------

create table if not exists public.registration_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  clerk_id uuid not null references auth.users (id),
  step text not null default 'identity',
  draft jsonb not null default '{}'::jsonb,
  confirmed_steps jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reg_sessions_clerk_idx
  on public.registration_sessions (tenant_id, clerk_id, completed_at);

-- ------------------------------------------------------------
-- Membership periods: the annual cycle
-- ------------------------------------------------------------

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  package_id uuid not null references public.packages (id),
  kind text not null check (kind in ('registration', 'renewal')),
  period_start date not null,
  period_end date not null,
  fee_amount numeric(14, 2) not null,
  card_fee numeric(14, 2) not null default 0,
  currency text not null default 'MWK',
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'cancelled')),
  paid_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (period_end > period_start)
);

create index if not exists memberships_member_idx on public.memberships (member_id, period_end desc);
create index if not exists memberships_status_idx on public.memberships (tenant_id, status);

-- ------------------------------------------------------------
-- ID cards
--
-- Point 6: printed once. A reprint must be authorised by operations.
-- Point 9: pedalist and motorist cards differ by design.
-- ------------------------------------------------------------

create table if not exists public.id_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  membership_id uuid references public.memberships (id) on delete set null,
  card_no text not null,
  operator_type public.operator_type not null,
  design_variant text not null default 'standard',
  qr_token text not null unique,
  status public.card_status not null default 'awaiting_payment',

  -- Print control
  print_batch_id uuid,
  printed_at timestamptz,
  printed_by uuid references auth.users (id),
  print_count int not null default 0,

  -- Reprint authorisation
  reprint_reason text,
  reprint_requested_by uuid references auth.users (id),
  reprint_requested_at timestamptz,
  reprint_approved_by uuid references auth.users (id),
  reprint_approved_at timestamptz,

  -- Dispatch: sorted back to the clerk who filed the member
  dispatch_to_clerk uuid references auth.users (id),
  dispatch_district_id uuid references public.districts (id),
  dispatch_area_id uuid references public.areas (id),
  dispatched_at timestamptz,
  collected_at timestamptz,

  expires_on date,
  superseded_by uuid references public.id_cards (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, card_no)
);

create index if not exists cards_status_idx on public.id_cards (tenant_id, status);
create index if not exists cards_member_idx on public.id_cards (member_id);
create index if not exists cards_dispatch_idx
  on public.id_cards (tenant_id, dispatch_district_id, dispatch_area_id, dispatch_to_clerk);

-- Print batches let printing staff work a sorted run.
create table if not exists public.print_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  batch_no text not null,
  district_id uuid references public.districts (id),
  area_id uuid references public.areas (id),
  card_count int not null default 0,
  status text not null default 'open' check (status in ('open', 'printing', 'completed', 'cancelled')),
  opened_by uuid references auth.users (id),
  completed_by uuid references auth.users (id),
  opened_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (tenant_id, batch_no)
);

-- A card may only be printed once. This is enforced here, not in the UI,
-- because a UI check can be bypassed by a page refresh or a second tab.
create or replace function public.guard_card_print()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'printed' and old.status = 'printed' then
    raise exception 'Card % has already been printed. A reprint must be approved by operations.', old.card_no
      using errcode = 'check_violation';
  end if;

  if new.print_count > 1 and new.reprint_approved_by is null then
    raise exception 'Reprint of card % requires operations approval.', old.card_no
      using errcode = 'check_violation';
  end if;

  -- A card cannot reach the print queue unless its membership is paid.
  if new.status in ('ready_for_print', 'queued', 'printing')
     and old.status = 'awaiting_payment' then
    if not exists (
      select 1 from public.memberships m
      where m.id = new.membership_id and m.status = 'paid'
    ) then
      raise exception 'Card % cannot be queued before the membership fee is paid.', new.card_no
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status = 'printed' and old.status <> 'printed' then
    new.printed_at := now();
    new.printed_by := auth.uid();
    new.print_count := old.print_count + 1;
  end if;

  return new;
end;
$$;

drop trigger if exists id_cards_print_guard on public.id_cards;
create trigger id_cards_print_guard
before update on public.id_cards
for each row execute function public.guard_card_print();

-- ------------------------------------------------------------
-- Triggers: updated_at and audit
-- ------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'members', 'vehicles', 'packages', 'id_cards', 'registration_sessions'
  ]
  loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format(
      'create trigger %I_touch before insert or update on public.%I
       for each row execute function public.touch_row()', t, t);
  end loop;

  foreach t in array array[
    'members', 'memberships', 'id_cards', 'vehicles', 'vehicle_assignments', 'packages', 'package_fees'
  ]
  loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I
       for each row execute function public.write_audit()', t, t);
  end loop;
end$$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.districts enable row level security;
alter table public.areas enable row level security;
alter table public.packages enable row level security;
alter table public.package_benefits enable row level security;
alter table public.package_fees enable row level security;
alter table public.members enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_assignments enable row level security;
alter table public.operator_ratings enable row level security;
alter table public.registration_sessions enable row level security;
alter table public.memberships enable row level security;
alter table public.id_cards enable row level security;
alter table public.print_batches enable row level security;

-- Reference data: readable by any signed-in tenant user.
do $$
declare
  t text;
begin
  foreach t in array array['districts', 'areas', 'packages', 'package_fees']
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

drop policy if exists "Read package benefits" on public.package_benefits;
create policy "Read package benefits"
on public.package_benefits for select to authenticated
using (exists (
  select 1 from public.packages p
  where p.id = package_id and p.tenant_id = public.current_tenant_id()
));

drop policy if exists "Admin write package benefits" on public.package_benefits;
create policy "Admin write package benefits"
on public.package_benefits for all to authenticated
using (public.is_admin() and exists (
  select 1 from public.packages p
  where p.id = package_id and p.tenant_id = public.current_tenant_id()
))
with check (public.is_admin() and exists (
  select 1 from public.packages p
  where p.id = package_id and p.tenant_id = public.current_tenant_id()
));

-- Members: clerks and above may read; clerks may create and edit
-- their own drafts; admins and operations may edit anything.
drop policy if exists "Staff read members" on public.members;
create policy "Staff read members"
on public.members for select to authenticated
using (
  tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','operations','finance','clerk','printing','viewer'])
);

drop policy if exists "Clerk create members" on public.members;
create policy "Clerk create members"
on public.members for insert to authenticated
with check (
  tenant_id = public.current_tenant_id()
  and public.tenant_can_write()
  and public.has_role(array['platform_admin','tenant_admin','operations','clerk'])
);

drop policy if exists "Clerk update members" on public.members;
create policy "Clerk update members"
on public.members for update to authenticated
using (
  tenant_id = public.current_tenant_id()
  and (
    public.has_role(array['platform_admin','tenant_admin','operations'])
    or (public.has_role(array['clerk']) and registered_by = auth.uid() and status in ('draft','pending_payment'))
  )
)
with check (tenant_id = public.current_tenant_id() and public.tenant_can_write());

-- Deleting a member is never allowed. Use status.
drop policy if exists "No member deletes" on public.members;

drop policy if exists "Read vehicles" on public.vehicles;
create policy "Read vehicles"
on public.vehicles for select to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists "Staff write vehicles" on public.vehicles;
create policy "Staff write vehicles"
on public.vehicles for all to authenticated
using (tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','operations','clerk']))
with check (tenant_id = public.current_tenant_id() and public.tenant_can_write());

drop policy if exists "Read assignments" on public.vehicle_assignments;
create policy "Read assignments"
on public.vehicle_assignments for select to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists "Staff write assignments" on public.vehicle_assignments;
create policy "Staff write assignments"
on public.vehicle_assignments for all to authenticated
using (tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','operations','clerk']))
with check (tenant_id = public.current_tenant_id() and public.tenant_can_write());

drop policy if exists "Read ratings" on public.operator_ratings;
create policy "Read ratings"
on public.operator_ratings for select to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists "Staff write ratings" on public.operator_ratings;
create policy "Staff write ratings"
on public.operator_ratings for insert to authenticated
with check (tenant_id = public.current_tenant_id() and public.tenant_can_write());

drop policy if exists "Clerk own sessions" on public.registration_sessions;
create policy "Clerk own sessions"
on public.registration_sessions for all to authenticated
using (
  tenant_id = public.current_tenant_id()
  and (clerk_id = auth.uid() or public.has_role(array['platform_admin','tenant_admin','operations']))
)
with check (tenant_id = public.current_tenant_id() and public.tenant_can_write());

drop policy if exists "Read memberships" on public.memberships;
create policy "Read memberships"
on public.memberships for select to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists "Staff write memberships" on public.memberships;
create policy "Staff write memberships"
on public.memberships for all to authenticated
using (tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','operations','finance','clerk']))
with check (tenant_id = public.current_tenant_id() and public.tenant_can_write());

drop policy if exists "Read cards" on public.id_cards;
create policy "Read cards"
on public.id_cards for select to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists "Card production" on public.id_cards;
create policy "Card production"
on public.id_cards for update to authenticated
using (
  tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','operations','printing','clerk'])
)
with check (tenant_id = public.current_tenant_id() and public.tenant_can_write());

drop policy if exists "Staff create cards" on public.id_cards;
create policy "Staff create cards"
on public.id_cards for insert to authenticated
with check (
  tenant_id = public.current_tenant_id()
  and public.tenant_can_write()
  and public.has_role(array['platform_admin','tenant_admin','operations','clerk'])
);

drop policy if exists "Read print batches" on public.print_batches;
create policy "Read print batches"
on public.print_batches for select to authenticated
using (tenant_id = public.current_tenant_id());

drop policy if exists "Printing manage batches" on public.print_batches;
create policy "Printing manage batches"
on public.print_batches for all to authenticated
using (tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','operations','printing']))
with check (tenant_id = public.current_tenant_id() and public.tenant_can_write());

-- Public QR verification reads a deliberately narrow view, never the
-- members table. Defined in 0004.
