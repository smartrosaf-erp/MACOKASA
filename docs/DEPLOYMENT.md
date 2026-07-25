# MACOKASA — Deployment Runbook

MACOKASA is tenant #2 on the Quick-Think platform. It shares the Supabase
project with SmartROSAF.

---

## 1. Staging first, always

Per the Quick-Think plan Section 18, no schema change reaches production
without being tested on staging.

1. Create the `qts-staging` Supabase project if it does not exist.
2. Validate locally: `npm run sqlcheck`
3. In the staging SQL editor, run in order:
   - `supabase/migrations/0001_platform_core.sql`
   - `supabase/migrations/0002_macokasa_membership.sql`
   - `supabase/migrations/0003_finance.sql`
   - `supabase/migrations/0004_workflow_and_config.sql`
4. Work through the verification queries in section 4 below.

## 2. Production

⚠️ **Back up first:**

```bash
pg_dump "$DATABASE_URL" --schema=public -Fc -f macokasa-$(date +%F).dump
```

Then run the same four files in the same order.

> These migrations create the platform core. If SmartROSAF already has tables
> in this project, review `0001` against them before running — the tenant,
> profile and audit structures are intended to be shared.

## 3. First accounts

Roles are never assignable from the browser.

1. **Authentication → Users → Add user**, tick *Auto Confirm*.
2. Attach the user to the MACOKASA tenant with a role:

```sql
update public.profiles
   set tenant_id = (select id from public.tenants where slug = 'macokasa'),
       role = 'tenant_admin',
       full_name = 'Full Name'
 where id = (select id from auth.users where email = 'admin@macokasa.org');
```

Valid roles: `platform_admin`, `tenant_admin`, `operations`, `finance`,
`clerk`, `printing`, `viewer`.

Create at least one `clerk`, one `finance`, one `operations` and one `printing`
account — the separation of duties depends on them being different people.

## 4. Verification

```sql
-- Tenants exist
select slug, name, status from public.tenants;

-- Every table has RLS on
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and rowsecurity = false;
-- must return zero rows

-- Configuration seeded
select key, value from public.tenant_settings
where tenant_id = (select id from public.tenants where slug='macokasa');

-- Packages and fees
select p.code, p.name, f.fee_type, f.amount
from public.packages p
join public.package_fees f on f.package_id = p.id
order by p.rank, f.fee_type;

-- The ledger must be unwritable by clients
select has_table_privilege('authenticated', 'public.ledger_entries', 'INSERT');
-- must be false

-- Split must total 1.0
select (value->>'macokasa')::numeric + (value->>'quickthink')::numeric
from public.tenant_settings where key = 'revenue_split';
-- must be 1.0
```

### End-to-end smoke test on staging

1. As a clerk, register a member → confirm they save as `pending_payment`.
2. As finance, `select public.confirm_payment('<payment-id>')`.
3. Check `v_balances`: actual = full amount, available = MACOKASA share.
4. Check the card moved to `ready_for_print`.
5. As printing, `select public.mark_card_printed('<card-id>')`.
6. Try to print it again → must raise an exception.
7. Check `notifications` has a member SMS row and a clerk in-app row.
8. As the same clerk, try to verify your own remittance → must fail.
9. As platform_admin, request a settlement above the available balance → must fail.

## 5. Scheduled jobs

Supabase → Database → Cron:

```sql
-- Nightly membership expiry
select cron.schedule('expire-memberships', '0 1 * * *',
  $$select public.expire_memberships()$$);
```

## 6. Storage

Create a **private** bucket `member-photos`. Object paths are
`<tenant_id>/<member_id>/photo.jpg`. Never make it public — the application
mints short-lived signed URLs.

## 7. Backups

- Enable Supabase automated daily backups (Pro plan).
- Weekly logical dump to off-platform storage, 90-day retention.
- **Test a restore quarterly.** An untested backup is not a backup.
- Never truncate `audit_log`, `ledger_entries` or `tenant_settings_history`.
  They are the evidence trail for money and access.
