-- ============================================================
-- 0000b_verify_rosaf_untouched.sql
--
-- READ-ONLY. Run AFTER the migrations, on staging first and then on
-- production, to prove SmartROSAF was not altered.
--
-- Every check below returns either PASS or FAIL in the first column.
-- If anything returns FAIL, restore the backup and stop.
-- ============================================================

-- ------------------------------------------------------------
-- CHECK 1 — Row level security must not be enabled on any table
--           MACOKASA did not create.
--
-- This is the check that matters most. Enabling RLS on a live ROSAF
-- table without policies makes it return zero rows to the application,
-- which silently breaks the web app and the Android client.
-- ------------------------------------------------------------

with platform_tables as (
  select unnest(array[
    'tenants','tenant_domains','tenant_modules','tenant_settings',
    'tenant_settings_history','platform_audit_log','platform_notifications',
    'audit_log','notifications','profiles',
    'districts','areas','packages','package_benefits','package_fees',
    'members','vehicles','vehicle_assignments','operator_ratings',
    'registration_sessions','memberships','id_cards','print_batches',
    'ledger_accounts','payments','ledger_entries','custody_records',
    'remittances','qts_settlements','expenses','card_scans'
  ]) as name
)
select
  case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
  'RLS enabled on a table MACOKASA did not create' as check_name,
  coalesce(string_agg(t.tablename, ', '), 'none') as offending_tables
from pg_tables t
where t.schemaname = 'public'
  and t.rowsecurity = true
  and t.tablename not in (select name from platform_tables);

-- ------------------------------------------------------------
-- CHECK 2 — Every profile belongs to a tenant.
--           An orphaned profile cannot sign in anywhere.
-- ------------------------------------------------------------

select
  case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
  'profiles without a tenant' as check_name,
  count(*)::text as orphans
from public.profiles
where tenant_id is null;

-- ------------------------------------------------------------
-- CHECK 3 — Both tenants exist and are active.
-- ------------------------------------------------------------

select
  case when count(*) = 2 then 'PASS' else 'FAIL' end as result,
  'both tenants present and active' as check_name,
  coalesce(string_agg(slug || '=' || status, ', '), 'none') as detail
from public.tenants
where slug in ('smartrosaf', 'macokasa') and status = 'active';

-- ------------------------------------------------------------
-- CHECK 4 — Existing users defaulted to the least privilege.
--
-- No pre-existing ROSAF user should have been handed a MACOKASA role.
-- ------------------------------------------------------------

select
  case when count(*) = 0 then 'PASS' else 'REVIEW' end as result,
  'ROSAF users holding a privileged platform role' as check_name,
  coalesce(string_agg(p.id::text, ', '), 'none') as detail
from public.profiles p
join public.tenants t on t.id = p.tenant_id
where t.slug = 'smartrosaf'
  and coalesce(
        (select p2.platform_role::text
           from public.profiles p2 where p2.id = p.id),
        'viewer'
      ) not in ('viewer');

-- ------------------------------------------------------------
-- CHECK 5 — MACOKASA reference data seeded.
-- ------------------------------------------------------------

select
  case when (select count(*) from public.districts) = 28
        and (select count(*) from public.packages) >= 10
       then 'PASS' else 'FAIL' end as result,
  'MACOKASA reference data' as check_name,
  (select count(*) from public.districts)::text || ' districts, ' ||
  (select count(*) from public.packages)::text  || ' packages' as detail;

-- ------------------------------------------------------------
-- CHECK 6 — The evidence tables cannot be edited by a client.
-- ------------------------------------------------------------

select
  case when not has_table_privilege('authenticated', c.oid, 'INSERT')
        and not has_table_privilege('authenticated', c.oid, 'UPDATE')
        and not has_table_privilege('authenticated', c.oid, 'DELETE')
       then 'PASS' else 'FAIL' end as result,
  'ledger is append-only to clients' as check_name,
  c.relname::text as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'ledger_entries';

-- ------------------------------------------------------------
-- CHECK 7 — Storage bucket for member photographs is private.
-- ------------------------------------------------------------

select
  case when coalesce(bool_and(not public), true) then 'PASS' else 'FAIL' end as result,
  'member-photos bucket is private' as check_name,
  coalesce(string_agg(id || '=' || case when public then 'PUBLIC' else 'private' end, ', '),
           'bucket not created yet') as detail
from storage.buckets
where id = 'member-photos';

-- ------------------------------------------------------------
-- CHECK 8 — Cross-tenant isolation is expressed in every policy
--           that touches MACOKASA business data.
-- ------------------------------------------------------------

select
  case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
  'MACOKASA policies missing a tenant check' as check_name,
  coalesce(string_agg(tablename || '.' || policyname, ', '), 'none') as detail
from pg_policies
where schemaname = 'public'
  and tablename in (
    'members','vehicles','memberships','id_cards','payments',
    'ledger_entries','custody_records','remittances','qts_settlements','expenses'
  )
  and coalesce(qual, '') || coalesce(with_check, '') not like '%current_tenant_id%';
