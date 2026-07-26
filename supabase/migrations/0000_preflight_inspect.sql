-- ============================================================
-- 0000_preflight_inspect.sql
--
-- READ-ONLY. Changes nothing. Run this FIRST, on the project that
-- already hosts SmartROSAF, and read the output before running
-- anything else.
--
-- Purpose: the MACOKASA migrations create public.profiles,
-- public.audit_log, public.notifications and a platform_role enum.
-- If SmartROSAF already has objects with those names, the migrations
-- would silently skip creating them (they use IF NOT EXISTS) and then
-- later statements would reference columns that do not exist — or
-- worse, apply row level security to live ROSAF tables and lock out
-- the Android app.
--
-- This script tells you which of those collisions exist so the
-- adoption path can be chosen deliberately.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Which shared object names already exist?
-- ------------------------------------------------------------

select
  'TABLE COLLISION' as finding,
  t.table_name,
  (select count(*) from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t.table_name) as columns,
  case t.table_name
    when 'profiles'       then 'MACOKASA expects: id, tenant_id, full_name, phone, role, district, is_active'
    when 'tenants'        then 'MACOKASA expects: id, slug, name, status, branding, settings'
    when 'audit_log'      then 'MACOKASA expects: tenant_id, actor, action, entity, before, after'
    when 'notifications'  then 'MACOKASA expects: tenant_id, channel, recipient, body, status'
    when 'tenant_settings' then 'MACOKASA expects: tenant_id, key, value'
    when 'payments'       then 'MACOKASA expects a membership-payments table'
    when 'expenses'       then 'MACOKASA expects a tenant expenses table'
    when 'memberships'    then 'MACOKASA expects annual membership periods'
    else 'review manually'
  end as note
from information_schema.tables t
where t.table_schema = 'public'
  and t.table_name in (
    'tenants','tenant_domains','tenant_modules','profiles','tenant_settings',
    'tenant_settings_history','notifications','audit_log','memberships',
    'payments','expenses','districts','areas','packages','members','vehicles'
  )
order by t.table_name;

-- ------------------------------------------------------------
-- 2. If profiles exists, what shape is it?
--    This is the single most likely collision.
-- ------------------------------------------------------------

select
  'PROFILES COLUMN' as finding,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- ------------------------------------------------------------
-- 3. Enum collisions
-- ------------------------------------------------------------

select
  'ENUM COLLISION' as finding,
  t.typname as enum_name,
  string_agg(e.enumlabel, ', ' order by e.enumsortorder) as current_values
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typname in ('platform_role','macokasa_role','operator_type','member_status',
                    'card_status','payment_method','payment_status','custody_status')
group by t.typname;

-- ------------------------------------------------------------
-- 4. Function collisions
-- ------------------------------------------------------------

select
  'FUNCTION COLLISION' as finding,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('current_tenant_id','current_role_name','has_role','is_admin',
                    'tenant_status','tenant_can_write','handle_new_user','touch_row',
                    'write_audit','setting')
order by p.proname;

-- ------------------------------------------------------------
-- 5. How much live data is at risk?
-- ------------------------------------------------------------

select
  'ROW COUNT' as finding,
  schemaname,
  relname as table_name,
  n_live_tup as approx_rows
from pg_stat_user_tables
where schemaname = 'public'
  and n_live_tup > 0
order by n_live_tup desc
limit 30;

-- ------------------------------------------------------------
-- 6. Which tables already have RLS, and which do not?
--    Any live table WITHOUT rls is currently open to the anon key.
-- ------------------------------------------------------------

select
  'RLS STATE' as finding,
  tablename,
  rowsecurity as rls_enabled,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.tablename) as policies
from pg_tables t
where schemaname = 'public'
order by rowsecurity, tablename;

-- ------------------------------------------------------------
-- 7. Existing auth users — these become tenant members
-- ------------------------------------------------------------

select 'AUTH USERS' as finding, count(*) as total from auth.users;

-- ------------------------------------------------------------
-- HOW TO READ THIS
--
--   No TABLE COLLISION rows   -> run 0001, then 0002, 0003, 0004.
--   Only profiles collides    -> run 0001a instead of 0001,
--                                then 0002, 0003, 0004.
--   Several collisions        -> STOP and review before running
--                                any migration.
-- ------------------------------------------------------------

