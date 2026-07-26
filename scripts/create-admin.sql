-- ============================================================
-- Grant administrator access to the first real MACOKASA user.
--
-- BEFORE running this:
--   1. The four migrations in supabase/migrations/ must have been run.
--   2. The user must already exist in Supabase Authentication → Users,
--      created with "Auto Confirm User" ticked.
--
-- Creating the auth user alone is not enough. A profile row is created
-- automatically by trigger, but it carries no tenant and no role, so
-- sign-in is refused until this runs.
-- ============================================================

update public.profiles
   set tenant_id = (select id from public.tenants where slug = 'macokasa'),
       role      = 'tenant_admin',
       full_name = 'Madalitso Jere',
       is_active = true
 where id = (select id from auth.users where email = 'madalitsojere@gmail.com');

-- Verify. Expect exactly one row.
select p.full_name,
       p.role,
       t.name  as tenant,
       t.status as tenant_status,
       p.is_active
  from public.profiles p
  join public.tenants  t on t.id = p.tenant_id
 where p.id = (select id from auth.users where email = 'madalitsojere@gmail.com');

-- ------------------------------------------------------------
-- Additional staff. Create each user in the dashboard first,
-- then run the matching statement.
--
-- Valid roles: tenant_admin, operations, finance, clerk, printing, viewer
-- ------------------------------------------------------------

-- update public.profiles
--    set tenant_id = (select id from public.tenants where slug = 'macokasa'),
--        role = 'clerk', full_name = 'Name Here', district = 'Blantyre', is_active = true
--  where id = (select id from auth.users where email = 'clerk@example.org');
