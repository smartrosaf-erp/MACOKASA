# Going live — MACOKASA as tenant #2 alongside SmartROSAF

One Supabase project, two tenants. SmartROSAF is tenant #1 and already
live with real data and an Android client. MACOKASA joins as tenant #2.

⚠️ **This is the highest-risk operation in the project so far.** You are
adding tables to a database that is serving a production client. Read
the whole page before running anything.

---

## The risk, stated plainly

The MACOKASA migrations create `profiles`, `audit_log`, `notifications`
and a role enum. **SmartROSAF very likely already has a `profiles`
table.** Because the migrations use `CREATE TABLE IF NOT EXISTS`, they
would silently skip it, then later statements would reference columns
that do not exist — or worse, enable row level security on a live ROSAF
table and lock out the Android app.

So the first thing you run changes nothing at all. It only looks.

---

## Step 0 — Back up. Not optional.

```bash
pg_dump "$DATABASE_URL" --schema=public -Fc -f rosaf-pre-macokasa.dump
```

Confirm the file exists and has a sensible size before continuing. If
anything goes wrong, this is what saves ROSAF.

Take it from **Supabase → Settings → Database → Connection string**.

---

## Step 1 — Inspect (read-only, changes nothing)

In the SQL Editor of the project hosting SmartROSAF, run:

```
supabase/migrations/0000_preflight_inspect.sql
```

It reports table collisions, the shape of any existing `profiles`,
enum and function collisions, row counts, and which tables currently
have RLS.

**Read the output and choose a path:**

| What the inspection shows | What to run next |
|---|---|
| No `TABLE COLLISION` rows | Step 2A |
| Only `profiles` collides | Step 2B |
| Several tables collide | **Stop.** Send me the output first. |

---

## Step 2A — Clean project

Run in order:

1. `0001_platform_core.sql`
2. `0002_macokasa_membership.sql`
3. `0003_finance.sql`
4. `0004_workflow_and_config.sql`

Skip `0001a`.

---

## Step 2B — Project already has `profiles` (the likely case)

Run in order:

1. `0001a_adopt_existing_profiles.sql` ← **instead of 0001**
2. `0002_macokasa_membership.sql`
3. `0003_finance.sql`
4. `0004_workflow_and_config.sql`

What `0001a` does differently:

- **Extends** the existing `profiles` table instead of replacing it.
  Every ROSAF column is kept.
- Adds a **separate `platform_role` column** rather than fighting over
  `role`. ROSAF's own authorisation is untouched.
- Assigns every existing profile to the **ROSAF tenant**, so nothing is
  orphaned.
- Uses **`platform_audit_log`** and **`platform_notifications`** rather
  than the bare names, in case ROSAF owns those.
- Enables RLS **only on tables it created**. It never turns RLS on a
  live ROSAF table, which would break the app instantly.

Everyone who already had a ROSAF account becomes a `viewer` on the
platform side, which grants nothing in MACOKASA until you promote them
deliberately.

---

## Step 3 — Verify before going further

```sql
-- Both tenants present
select slug, name, status from public.tenants;

-- No orphaned profiles
select count(*) from public.profiles where tenant_id is null;   -- expect 0

-- Existing users defaulted to the safest role
select platform_role, count(*) from public.profiles group by 1;

-- MACOKASA reference data seeded
select count(*) from public.districts;                          -- expect 28
select count(*) from public.packages;                           -- expect 10
```

**Then check SmartROSAF still works.** Open `erp.rosaf.org`, sign in,
load a few screens, and open the Android app. Do this before creating
any MACOKASA account. If ROSAF is broken, restore the dump.

---

## Step 4 — Create your account

**Authentication → Users → Add user**

| Field | Value |
|---|---|
| Email | `madalitsojere@gmail.com` |
| Password | see below |
| Auto Confirm User | **tick** |

Suggested password, cryptographically generated, ambiguous characters
removed so it can be typed from paper:

```
JaCXv@k2tNUU7BBR74
```

⚠️ It has appeared in a chat transcript. **Change it immediately after
your first sign-in.**

---

## Step 5 — Grant the role

Creating the user is not enough. The profile row exists but has no
tenant and no platform role, so sign-in is refused.

If you ran **0001a**:

```sql
update public.profiles
   set tenant_id     = (select id from public.tenants where slug = 'macokasa'),
       platform_role = 'tenant_admin',
       full_name     = 'Madalitso Jere',
       is_active     = true
 where id = (select id from auth.users where email = 'madalitsojere@gmail.com');
```

If you ran **0001**, use `role` instead of `platform_role`.

Verify:

```sql
select p.full_name, p.platform_role, t.name as tenant, p.is_active
  from public.profiles p join public.tenants t on t.id = p.tenant_id
 where p.id = (select id from auth.users where email = 'madalitsojere@gmail.com');
```

> Note: you are the MACOKASA administrator. To administer Quick-Think
> across both tenants, use `platform_admin` instead — but hold that on
> a separate account, not your day-to-day login.

---

## Step 6 — Lock down sign-ups

**Authentication → Providers → Email**

- **Disable** "Enable email signups"
- **Enable** "Confirm email"
- Minimum password length: 10

**Authentication → URL Configuration** — add the MACOKASA domain to
Site URL and Redirect URLs, alongside the existing ROSAF entries. Do
not replace them.

---

## Step 7 — Storage bucket

**Storage → New bucket** → `member-photos`, **Public: off**.

Policies were created by the migrations. Object paths are
`<tenant_id>/<member_id>/photo.jpg`, so ROSAF and MACOKASA files can
never be read across the boundary.

---

## Step 8 — Point MACOKASA at the shared project

In **Render → MACOKASA static site → Environment**:

| Key | Value |
|---|---|
| `SUPABASE_URL` | the **shared** project URL, same as ROSAF |
| `SUPABASE_ANON_KEY` | the shared **anon public** key |
| `PUBLIC_BASE_URL` | the MACOKASA domain |

Both products use the same keys. Separation is enforced by `tenant_id`
and RLS inside the database, never by using different credentials.

⚠️ Never put `SUPABASE_SERVICE_ROLE_KEY` on a static site.

Redeploy. The demonstration ribbon disappears and sign-in becomes real.

---

## Step 9 — Staff accounts

Separation of duties is enforced in SQL: a clerk cannot confirm a
payment they collected, nor verify their own remittance. If one person
holds every role, those protections do nothing.

Create each in the dashboard, then grant:

| Person | `platform_role` |
|---|---|
| Registration clerk | `clerk` |
| Finance officer | `finance` |
| Operations manager | `operations` |
| Card printing | `printing` |

---

## Step 10 — Real fees

Sign in → **Settings → Packages and fees**. The migrations seed
indicative figures; replace them with MACOKASA's actual rates before
registering anybody. Check **Settings → Revenue split** too — it ships
at 80 MACOKASA / 20 Quick-Think.

---

## If something breaks

```bash
pg_restore --clean --if-exists -d "$DATABASE_URL" rosaf-pre-macokasa.dump
```

ROSAF returns to its pre-migration state. Nothing MACOKASA added
survives, which is the intended outcome.

---

## Still outstanding

- **Rotate the anon key** exposed during earlier development.
- **Contract an SMS provider.** Notifications queue but nothing sends,
  and the website tells members they will be messaged when their card
  is printed.
- **Legal review** before personal data and photographs are captured.
