# Adding MACOKASA as tenant #2

One Supabase project. SmartROSAF is tenant #1 and stays exactly as it
is. MACOKASA joins as tenant #2.

This follows the Quick-Think plan, Section 10: *"Do NOT rebuild it: it
becomes the seed of the platform. ROSAF experiences no disruption."*

**The method below makes that true rather than hoping for it.** You
rehearse the entire thing on a copy first. By the time you touch
production you will have already run it once, seen the output, and
signed into both products.

Budget two hours, most of it waiting.

---

## Why this is safe

The plan's own rule is *"test every step on the staging Supabase
project first"*. That is the whole answer. Three properties make it
work:

1. **You rehearse on a real copy of ROSAF's database**, not a guess.
   Anything that would break production breaks the copy instead, where
   it costs nothing.
2. **Nothing MACOKASA adds touches a ROSAF table.** New tables only.
   ROSAF's tables are not altered, not dropped, and row level security
   is never switched on for them.
3. **Every step is reversible** until the final one, and the final one
   has a tested restore.

The earlier draft of this guide sent you straight at production with a
backup. That was the wrong sequence and it is why it felt dangerous.

---

## Phase 0 — Make a copy of production

**Nothing in this phase touches ROSAF.**

1. Supabase → **New project** → name it `qts-staging`, same region as
   production.
2. Take a dump of production:

   ```bash
   pg_dump "$PROD_DATABASE_URL" --schema=public -Fc -f rosaf-prod.dump
   ```

   Connection string: **Settings → Database → Connection string → URI**.

3. Load it into staging:

   ```bash
   pg_restore -d "$STAGING_DATABASE_URL" --no-owner --no-privileges rosaf-prod.dump
   ```

You now have a full copy of ROSAF's schema and data that you can break
freely.

> Keep `rosaf-prod.dump`. It is also your production rollback.

---

## Phase 1 — Inspect the copy

In the **staging** SQL Editor, run:

```
supabase/migrations/0000_preflight_inspect.sql
```

It changes nothing — a test in the repository asserts it contains no
write statement of any kind. It reports which object names ROSAF
already uses.

Read the `TABLE COLLISION` rows:

| Result | Path |
|---|---|
| None | **Path A** — run `0001` |
| Only `profiles` | **Path B** — run `0001a` instead of `0001` |
| Several | Stop, and send me the output |

Path B is the likely one. Either way you now know, instead of guessing.

---

## Phase 2 — Rehearse on staging

Run in the staging SQL Editor, in order:

**Path A:** `0001` → `0002` → `0003` → `0004`
**Path B:** `0001a` → `0002` → `0003` → `0004`

Then check:

```sql
select slug, name, status from public.tenants;
-- expect smartrosaf and macokasa

select count(*) from public.profiles where tenant_id is null;
-- expect 0

select count(*) from public.districts;   -- expect 28
select count(*) from public.packages;    -- expect 10
```

---

## Phase 3 — Prove ROSAF is untouched

This is the phase that answers the question "is this risky".

**3a. Compare ROSAF's tables before and after.**

```sql
-- Run on staging AFTER the migrations.
select table_name, count(*) as columns
from information_schema.columns
where table_schema = 'public'
  and table_name not in (
    'tenants','tenant_domains','tenant_modules','tenant_settings',
    'tenant_settings_history','platform_audit_log','platform_notifications',
    'districts','areas','packages','package_benefits','package_fees',
    'members','vehicles','vehicle_assignments','operator_ratings',
    'registration_sessions','memberships','id_cards','print_batches',
    'ledger_accounts','payments','ledger_entries','custody_records',
    'remittances','qts_settlements','expenses','card_scans'
  )
group by table_name order by table_name;
```

Run the same query against **production**. Every ROSAF table must have
the same column count in both. The only permitted difference is
`profiles`, which gains `tenant_id` and `platform_role`.

**3b. Confirm RLS was not switched on for ROSAF tables.**

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and rowsecurity = true
order by tablename;
```

Every table listed must be one MACOKASA created. If a ROSAF table
appears here, **stop** — that is what would break the Android app.

**3c. Point a ROSAF build at staging and use it.**

Temporarily set the SmartROSAF web app's Supabase URL and anon key to
the staging project, then:

- sign in as a normal ROSAF user
- open the screens staff use daily
- create one record and delete it
- run the Android app against staging if you can

If ROSAF behaves identically, the migration is safe. If it does not,
you have found the problem on a copy, which is the entire point.

---

## Phase 4 — Rehearse the rollback

Do this once, on staging, before you need it in anger:

```bash
pg_restore --clean --if-exists -d "$STAGING_DATABASE_URL" \
  --no-owner --no-privileges rosaf-prod.dump
```

Then confirm the MACOKASA tables are gone and ROSAF still works. Now
you know the escape hatch works, rather than assuming.

---

## Phase 5 — Production

Only now. You have already run every statement once.

1. **Fresh backup, immediately before:**

   ```bash
   pg_dump "$PROD_DATABASE_URL" --schema=public -Fc \
     -f rosaf-prod-$(date +%F-%H%M).dump
   ```

2. Choose a quiet hour. Malawi evening, or Sunday.

3. Run the same path you rehearsed, in the same order, in the
   production SQL Editor.

4. Repeat the Phase 3 checks against production.

5. **Open `erp.rosaf.org` and the Android app before doing anything
   else.** If either is wrong, restore and stop.

---

## Phase 6 — Your account

Only after ROSAF is confirmed healthy.

**Authentication → Users → Add user**

| Field | Value |
|---|---|
| Email | `madalitsojere@gmail.com` |
| Password | `JaCXv@k2tNUU7BBR74` |
| Auto Confirm User | **tick** |

⚠️ That password has appeared in a chat transcript. Change it the
moment you first sign in.

Then grant the role — **creating the user is not enough**, the profile
has no tenant and no role until this runs:

```sql
-- Path B (0001a was used)
update public.profiles
   set tenant_id     = (select id from public.tenants where slug = 'macokasa'),
       platform_role = 'tenant_admin',
       full_name     = 'Madalitso Jere',
       is_active     = true
 where id = (select id from auth.users where email = 'madalitsojere@gmail.com');

-- Path A: use `role` instead of `platform_role`
```

Verify:

```sql
select p.full_name, p.platform_role, t.name as tenant, p.is_active
  from public.profiles p join public.tenants t on t.id = p.tenant_id
 where p.id = (select id from auth.users where email = 'madalitsojere@gmail.com');
```

---

## Phase 7 — Connect the site

**Render → MACOKASA static site → Environment**

| Key | Value |
|---|---|
| `SUPABASE_URL` | the **shared** project URL, same as ROSAF |
| `SUPABASE_ANON_KEY` | the shared **anon public** key |
| `PUBLIC_BASE_URL` | the MACOKASA domain |

Both products use the same keys. Separation is enforced by `tenant_id`
and row level security inside the database, never by different
credentials.

⚠️ Never put `SUPABASE_SERVICE_ROLE_KEY` on a static site.

**Authentication → URL Configuration** — *add* the MACOKASA domain
alongside the existing ROSAF entries. Do not replace them, or ROSAF
password resets break.

**Authentication → Providers → Email** — disable public sign-ups,
enable email confirmation, minimum password length 10.

**Storage → New bucket** → `member-photos`, **Public: off**. Paths are
`<tenant_id>/<member_id>/photo.jpg`, so the two tenants cannot read
each other's files.

Redeploy. The demonstration ribbon disappears.

---

## Phase 8 — Staff accounts and fees

Separation of duties is enforced in SQL: a clerk cannot confirm a
payment they collected, nor verify their own remittance. If one person
holds every role, those protections do nothing.

| Person | `platform_role` |
|---|---|
| Registration clerk | `clerk` |
| Finance officer | `finance` |
| Operations manager | `operations` |
| Card printing | `printing` |

Then **Settings → Packages and fees** and replace the seeded indicative
figures with MACOKASA's real rates before registering anybody. Check
**Settings → Revenue split**, which ships at 80 / 20.

---

## If production goes wrong

```bash
pg_restore --clean --if-exists -d "$PROD_DATABASE_URL" \
  --no-owner --no-privileges rosaf-prod-<timestamp>.dump
```

You will have already run this once on staging, so it is a command you
have tested rather than one you are trying for the first time under
pressure.

---

## What is deferred

The plan's Section 10 has four phases. This covers phase 1, tenant-ready
core, and stops there deliberately:

- **Phase 2, RLS on ROSAF's own tables** — not done here. ROSAF keeps
  its current access model untouched. Enabling RLS on live tables is a
  separate exercise with its own rehearsal.
- **Phase 3, ROSAF branding into configuration** — the `tenants.branding`
  column exists and is loaded, but SmartROSAF still renders its own
  branding. No change to ROSAF.
- **Phase 4, billing onboarding** — the `qts_settlements` machinery is
  MACOKASA's revenue split with Quick-Think, which is a different thing
  from the platform billing engine. That is still to build.

Doing only phase 1 is what keeps ROSAF's impact at "none visible".

---

## Still outstanding

- **Rotate the anon key** exposed during earlier development.
- **Contract an SMS provider.** Notifications queue but nothing sends,
  and the website tells members they will be messaged when their card is
  printed.
- **Legal review** before personal data and photographs are captured.
