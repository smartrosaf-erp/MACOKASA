-- ============================================================
-- 0004_workflow_and_config.sql
-- Registration → payment → card → print → notify workflow,
-- public verification, and seed configuration.
--
-- Idempotent. Run after 0003_finance.sql.
-- ============================================================

-- ------------------------------------------------------------
-- Confirm a payment: post the ledger, activate the membership,
-- and move the card to the print queue. One transaction.
-- ------------------------------------------------------------

create or replace function public.confirm_payment(p_payment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pay record;
  ms record;
  mem record;
  card_id uuid;
  card_no text;
  term_months int;
begin
  if not public.has_role(array['platform_admin','tenant_admin','operations','finance']) then
    raise exception 'Only finance or operations may confirm a payment';
  end if;

  select * into pay from public.payments where id = p_payment;
  if not found then raise exception 'Payment not found'; end if;
  if pay.status = 'confirmed' then return; end if;

  update public.payments
     set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
   where id = p_payment;

  perform public.post_payment_to_ledger(p_payment);

  if pay.membership_id is null then return; end if;

  select * into ms from public.memberships where id = pay.membership_id;
  select * into mem from public.members where id = ms.member_id;

  term_months := coalesce((public.setting('membership_term_months') #>> '{}')::int, 12);

  update public.memberships
     set status = 'paid', paid_at = now()
   where id = ms.id;

  -- The annual clock starts when the fee is paid, not when captured.
  update public.members
     set status = 'active',
         package_id = ms.package_id,
         joined_on = coalesce(mem.joined_on, current_date),
         period_start = current_date,
         period_end = (current_date + (term_months || ' months')::interval)::date,
         membership_no = coalesce(
           mem.membership_no,
           public.next_membership_no(mem.tenant_id, mem.operator_type, mem.district_id)
         )
   where id = mem.id;

  -- Issue or release the card.
  select id into card_id from public.id_cards
   where membership_id = ms.id and status <> 'void' limit 1;

  if card_id is null then
    select 'CRD-' || case mem.operator_type when 'motorist' then 'M' else 'P' end || '-' ||
           to_char(current_date, 'YYYY') || '-' ||
           lpad((count(*) + 1)::text, 5, '0')
      into card_no
      from public.id_cards where tenant_id = mem.tenant_id;

    insert into public.id_cards (
      tenant_id, member_id, membership_id, card_no, operator_type,
      design_variant, qr_token, status,
      dispatch_to_clerk, dispatch_district_id, dispatch_area_id, expires_on
    )
    values (
      mem.tenant_id, mem.id, ms.id, card_no, mem.operator_type,
      mem.operator_type::text, encode(gen_random_bytes(16), 'hex'), 'ready_for_print',
      mem.registered_by, mem.district_id, mem.area_id,
      (current_date + (term_months || ' months')::interval)::date
    );
  else
    update public.id_cards set status = 'ready_for_print' where id = card_id;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Mark a card printed, then notify the member and the filing clerk.
-- ------------------------------------------------------------

create or replace function public.mark_card_printed(p_card uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  mem record;
  clerk_email text;
  msg text;
begin
  if not public.has_role(array['platform_admin','tenant_admin','operations','printing']) then
    raise exception 'Only printing or operations may mark a card printed';
  end if;

  select * into c from public.id_cards where id = p_card;
  if not found then raise exception 'Card not found'; end if;

  -- The trigger enforces single print and reprint approval.
  update public.id_cards set status = 'printed' where id = p_card;

  select * into mem from public.members where id = c.member_id;

  msg := format(
    'MACOKASA: Your %s member ID card (%s) has been printed and is being sent to %s for collection.',
    case mem.operator_type when 'motorist' then 'motorcycle operator' else 'pedal operator' end,
    mem.membership_no,
    coalesce((select name from public.areas where id = mem.area_id), 'your area')
  );

  -- Member alert
  insert into public.notifications (tenant_id, channel, recipient, subject, body, template_key, context)
  values (
    c.tenant_id, 'sms', mem.phone, 'ID card printed', msg, 'card_printed',
    jsonb_build_object('cardId', c.id, 'memberId', mem.id, 'membershipNo', mem.membership_no)
  );

  -- Clerk alert
  if c.dispatch_to_clerk is not null then
    select email into clerk_email from auth.users where id = c.dispatch_to_clerk;
    insert into public.notifications
      (tenant_id, channel, recipient, recipient_user, subject, body, template_key, context)
    values (
      c.tenant_id, 'in_app', coalesce(clerk_email, 'clerk'), c.dispatch_to_clerk,
      'Card ready for dispatch',
      format('Card %s for %s %s is printed and assigned to you for dispatch.',
             c.card_no, mem.first_name, mem.last_name),
      'card_dispatch',
      jsonb_build_object('cardId', c.id, 'memberId', mem.id)
    );
  end if;
end;
$$;

-- Reprints are an operations decision, never a printing-room one.
create or replace function public.approve_reprint(p_card uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(array['platform_admin','tenant_admin','operations']) then
    raise exception 'Only the operations manager may approve a reprint';
  end if;

  update public.id_cards
     set status = 'ready_for_print',
         reprint_reason = p_reason,
         reprint_approved_by = auth.uid(),
         reprint_approved_at = now()
   where id = p_card;
end;
$$;

-- ------------------------------------------------------------
-- Remittance verification: clears a clerk's name.
-- ------------------------------------------------------------

create or replace function public.verify_remittance(p_remittance uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  grp uuid := gen_random_uuid();
  acc_remit uuid;
begin
  if not public.has_role(array['platform_admin','tenant_admin','finance']) then
    raise exception 'Only finance may verify a remittance';
  end if;

  select * into r from public.remittances where id = p_remittance;
  if not found then raise exception 'Remittance not found'; end if;
  if r.clerk_id = auth.uid() then
    raise exception 'A clerk may not verify their own remittance';
  end if;

  select id into acc_remit from public.ledger_accounts
   where tenant_id = r.tenant_id and code = 'CUSTODY-REMIT';

  insert into public.ledger_entries
    (tenant_id, entry_group, account_id, party, clerk_id, amount, description, created_by)
  values
    (r.tenant_id, grp, acc_remit, 'clerk', r.clerk_id, -r.declared_amount,
     'Remittance ' || r.reference || ' verified', auth.uid());

  update public.custody_records
     set status = 'reconciled', remittance_id = r.id
   where tenant_id = r.tenant_id
     and clerk_id = r.clerk_id
     and status in ('held', 'remitted');

  update public.remittances
     set status = 'cleared', verified_by = auth.uid(), verified_at = now()
   where id = p_remittance;
end;
$$;

-- ------------------------------------------------------------
-- Nightly: lapse memberships whose period has ended.
-- Hard expiry — the card is invalid the day after period_end.
-- ------------------------------------------------------------

create or replace function public.expire_memberships()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.members
     set status = 'lapsed'
   where status = 'active'
     and period_end is not null
     and period_end < current_date;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ------------------------------------------------------------
-- Public QR verification
--
-- Deliberately narrow: confirms standing, reveals nothing sensitive.
-- No phone, no national ID, no photo, no address.
-- ------------------------------------------------------------

create table if not exists public.card_scans (
  id bigserial primary key,
  tenant_id uuid,
  qr_token text not null,
  scanned_at timestamptz not null default now(),
  user_agent text
);

create index if not exists card_scans_token_idx on public.card_scans (qr_token, scanned_at desc);

create or replace function public.verify_card(p_token text)
returns table (
  valid boolean,
  member_name text,
  membership_no text,
  operator_type text,
  package_name text,
  district text,
  status text,
  expires_on date
)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.card_scans (tenant_id, qr_token)
  select c.tenant_id, p_token from public.id_cards c where c.qr_token = p_token;

  return query
  select
    (m.status = 'active' and (m.period_end is null or m.period_end >= current_date)) as valid,
    (m.first_name || ' ' || m.last_name) as member_name,
    m.membership_no,
    m.operator_type::text,
    p.name as package_name,
    d.name as district,
    m.status::text,
    m.period_end
  from public.id_cards c
  join public.members m on m.id = c.member_id
  left join public.packages p on p.id = m.package_id
  left join public.districts d on d.id = m.district_id
  where c.qr_token = p_token
    and c.status not in ('void');
end;
$$;

grant execute on function public.verify_card(text) to anon, authenticated;

alter table public.card_scans enable row level security;

drop policy if exists "Staff read scans" on public.card_scans;
create policy "Staff read scans"
on public.card_scans for select to authenticated
using (tenant_id = public.current_tenant_id()
  and public.has_role(array['platform_admin','tenant_admin','operations']));

-- ------------------------------------------------------------
-- Sorted print queue for the printing room
-- ------------------------------------------------------------

create or replace view public.v_print_queue
with (security_invoker = true) as
select
  c.id as card_id,
  c.tenant_id,
  c.card_no,
  c.operator_type,
  c.status,
  m.membership_no,
  m.first_name || ' ' || m.last_name as member_name,
  d.name as district,
  a.name as area,
  c.dispatch_to_clerk,
  pr.full_name as clerk_name,
  c.print_count,
  c.created_at
from public.id_cards c
join public.members m on m.id = c.member_id
left join public.districts d on d.id = m.district_id
left join public.areas a on a.id = m.area_id
left join public.profiles pr on pr.id = c.dispatch_to_clerk
where c.status in ('ready_for_print', 'queued', 'printing')
order by d.name, a.name, pr.full_name, m.last_name;

-- ------------------------------------------------------------
-- Seed configuration
--
-- Everything below is DATA the admin edits. Nothing here belongs in
-- application code.
-- ------------------------------------------------------------

do $$
declare
  mck uuid;
  pkg record;
  reg_fee numeric;
  ren_fee numeric;
begin
  select id into mck from public.tenants where slug = 'macokasa';
  if mck is null then return; end if;

  insert into public.tenant_settings (tenant_id, key, value, description) values
    (mck, 'revenue_split',
     jsonb_build_object('macokasa', 0.80, 'quickthink', 0.20),
     'Share of membership and renewal revenue. Must total 1.0.'),
    (mck, 'membership_term_months', to_jsonb(12),
     'Length of a membership period in months.'),
    (mck, 'currency', to_jsonb('MWK'::text), 'Reporting currency.'),
    (mck, 'card_expiry_matches_membership', to_jsonb(true),
     'Card expiry follows the membership period end.'),
    (mck, 'require_photo_on_registration', to_jsonb(true),
     'A face photo is mandatory before a member can be saved.'),
    (mck, 'allow_clerk_self_confirm_payment', to_jsonb(false),
     'When false, a clerk cannot confirm a payment they collected.'),
    (mck, 'notification_channels',
     jsonb_build_array('in_app'),
     'Enabled dispatch channels. Add sms/whatsapp once a provider is contracted.')
  on conflict (tenant_id, key) do nothing;

  -- Districts of Malawi
  insert into public.districts (tenant_id, name, code, region)
  select mck, d.name, d.code, d.region
  from (values
    ('Balaka','BL','Southern'), ('Blantyre','BT','Southern'), ('Chikwawa','CK','Southern'),
    ('Chiradzulu','CZ','Southern'), ('Chitipa','CP','Northern'), ('Dedza','DZ','Central'),
    ('Dowa','DA','Central'), ('Karonga','KA','Northern'), ('Kasungu','KU','Central'),
    ('Likoma','LK','Northern'), ('Lilongwe','LL','Central'), ('Machinga','MC','Southern'),
    ('Mangochi','MG','Southern'), ('Mchinji','MJ','Central'), ('Mulanje','MU','Southern'),
    ('Mwanza','MW','Southern'), ('Mzimba','MZ','Northern'), ('Neno','NE','Southern'),
    ('Nkhata Bay','NB','Northern'), ('Nkhotakota','NK','Central'), ('Nsanje','NS','Southern'),
    ('Ntcheu','NU','Central'), ('Ntchisi','NI','Central'), ('Phalombe','PH','Southern'),
    ('Rumphi','RU','Northern'), ('Salima','SA','Central'), ('Thyolo','TH','Southern'),
    ('Zomba','ZA','Southern')
  ) as d(name, code, region)
  on conflict (tenant_id, name) do nothing;

  -- Packages. Indicative opening fees only: the admin reprices these
  -- in the Settings screen as economic conditions change.
  insert into public.packages (tenant_id, code, name, applies_to, operator_type, rank, colour)
  values
    (mck, 'REG-M',  'Regular',  'operator', 'motorist', 1, '#0f4a76'),
    (mck, 'SIL-M',  'Silver',   'operator', 'motorist', 2, '#8a94a6'),
    (mck, 'GLD-M',  'Gold',     'operator', 'motorist', 3, '#d4a017'),
    (mck, 'PLT-M',  'Platinum', 'operator', 'motorist', 4, '#2b2f36'),
    (mck, 'REG-P',  'Regular',  'operator', 'pedalist', 1, '#0aa2c0'),
    (mck, 'SIL-P',  'Silver',   'operator', 'pedalist', 2, '#7cc4d6'),
    (mck, 'GLD-P',  'Gold',     'operator', 'pedalist', 3, '#f0a500'),
    (mck, 'PLT-P',  'Platinum', 'operator', 'pedalist', 4, '#1f4b57'),
    (mck, 'OWN-B',  'Owner Basic', 'owner', null, 1, '#0f766e'),
    (mck, 'OWN-F',  'Owner Fleet', 'owner', null, 2, '#134e4a')
  on conflict (tenant_id, code) do nothing;

  -- Opening fees
  for pkg in select id, code from public.packages where tenant_id = mck loop
    reg_fee := case pkg.code
      when 'REG-M' then 15000 when 'SIL-M' then 30000
      when 'GLD-M' then 55000 when 'PLT-M' then 90000
      when 'REG-P' then 7500  when 'SIL-P' then 15000
      when 'GLD-P' then 27500 when 'PLT-P' then 45000
      when 'OWN-B' then 45000 when 'OWN-F' then 120000 end;
    ren_fee := round(reg_fee * 0.8, 2);

    insert into public.package_fees (tenant_id, package_id, fee_type, amount)
    select mck, pkg.id, 'registration', reg_fee
    where not exists (
      select 1 from public.package_fees f
      where f.package_id = pkg.id and f.fee_type = 'registration' and f.effective_to is null);

    insert into public.package_fees (tenant_id, package_id, fee_type, amount)
    select mck, pkg.id, 'renewal', ren_fee
    where not exists (
      select 1 from public.package_fees f
      where f.package_id = pkg.id and f.fee_type = 'renewal' and f.effective_to is null);

    insert into public.package_fees (tenant_id, package_id, fee_type, amount)
    select mck, pkg.id, 'card', 10000
    where not exists (
      select 1 from public.package_fees f
      where f.package_id = pkg.id and f.fee_type = 'card' and f.effective_to is null);
  end loop;

  -- Benefits are rows so they can trickle in without a deploy.
  insert into public.package_benefits (package_id, benefit, sort_order)
  select p.id, b.benefit, b.ord
  from public.packages p
  cross join (values
    ('National membership record', 1),
    ('Annual renewal reminders', 2),
    ('Public QR verification', 3)
  ) as b(benefit, ord)
  where p.tenant_id = mck
    and not exists (select 1 from public.package_benefits pb where pb.package_id = p.id);
end$$;
