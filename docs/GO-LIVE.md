# Going live — first real account

Right now the platform runs on demonstration data because no database is
connected. This guide connects one, then creates the first real
administrator account for **madalitsojere@gmail.com**.

Roughly ten minutes. Do it on staging first if you want to rehearse.

---

## Step 1 — Create the Supabase project

1. Go to https://supabase.com/dashboard and sign in.
2. **New project**.
   - Name: `macokasa` (or use the shared Quick-Think platform project
     if SmartROSAF already lives there — see the note at the end)
   - Database password: generate a strong one and **save it in your
     password manager**. You cannot recover it later.
   - Region: **eu-central-1 (Frankfurt)** — lowest latency to Malawi of
     the available options.
3. Wait for provisioning to finish, about two minutes.

---

## Step 2 — Run the migrations

Open **SQL Editor** in the Supabase dashboard and run these four files
in order, one at a time, waiting for each to succeed:

1. `supabase/migrations/0001_platform_core.sql`
2. `supabase/migrations/0002_macokasa_membership.sql`
3. `supabase/migrations/0003_finance.sql`
4. `supabase/migrations/0004_workflow_and_config.sql`

Each is idempotent, so re-running one is harmless.

Confirm it worked:

```sql
select slug, name, status from public.tenants;
-- expect: smartrosaf, macokasa

select count(*) from public.districts;
-- expect: 28

select code, name from public.packages order by rank;
-- expect: ten packages
```

---

## Step 3 — Create the user

**Authentication → Users → Add user**

| Field | Value |
|---|---|
| Email | `madalitsojere@gmail.com` |
| Password | choose one — see the suggestion below |
| Auto Confirm User | **tick this**, or you cannot sign in |

A suggested password, generated with a cryptographic random source:

```
JaCXv@k2tNUU7BBR74
```

Use it or replace it with your own. Either way, **store it in a password
manager and change it after your first sign-in**. It has appeared in a
chat transcript, so treat it as compromised the moment you have set your
own.

---

## Step 4 — Grant the administrator role

Creating the user is not enough. A profile row exists but carries no
tenant and no role, so sign-in will be refused. Run this in **SQL
Editor**:

```sql
update public.profiles
   set tenant_id = (select id from public.tenants where slug = 'macokasa'),
       role      = 'tenant_admin',
       full_name = 'Madalitso Jere',
       is_active = true
 where id = (select id from auth.users where email = 'madalitsojere@gmail.com');
```

Verify:

```sql
select p.full_name, p.role, t.name as tenant, p.is_active
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
 where p.id = (select id from auth.users where email = 'madalitsojere@gmail.com');
```

You should see one row: `Madalitso Jere | tenant_admin | MACOKASA | true`.

---

## Step 5 — Lock down sign-ups

**Authentication → Providers → Email**

- **Disable** "Enable email signups". Accounts are issued by
  administrators, never self-created.
- **Enable** "Confirm email".
- Minimum password length: **10**.

**Authentication → URL Configuration**

- Site URL: your live domain
- Redirect URLs: add the same domain, so password reset works.

---

## Step 6 — Create the storage bucket

**Storage → New bucket**

- Name: `member-photos`
- Public: **off**. It must be private; the application mints
  short-lived signed URLs.

The migrations already created the access policies for it.

---

## Step 7 — Point the site at the database

In **Render → your static site → Environment**, add:

| Key | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → **anon public** key |
| `PUBLIC_BASE_URL` | your live domain, e.g. `https://macokasa.org` |

⚠️ Never add `SUPABASE_SERVICE_ROLE_KEY` to the static site. It bypasses
every access rule and the site is public.

Trigger a redeploy. The build writes these into `public/config.js`, the
demonstration ribbon disappears, and the sign-in form becomes real.

---

## Step 8 — Sign in and check

1. Open `https://your-domain/?portal=1`
2. Sign in with `madalitsojere@gmail.com`
3. **Change your password immediately** — the one above was shared in
   chat.
4. You should land on the Dashboard with every figure at zero. That is
   correct: there is no data yet.

If sign-in is refused, the cause is almost always step 4 — the profile
has no tenant or no role.

---

## Step 9 — Create the working accounts

Separation of duties only works if these are different people. Repeat
steps 3 and 4 for each, changing the role value:

| Person | Role value | Can do |
|---|---|---|
| Registration clerk | `clerk` | Register members, take payment |
| Finance officer | `finance` | Confirm payments, verify remittances |
| Operations manager | `operations` | Approve reprints, oversee dispatch |
| Card printing | `printing` | Work the print queue |

The system deliberately refuses to let a clerk confirm their own
collection, or verify their own remittance. If one person holds every
role, those protections do nothing.

---

## Step 10 — Set your real fees

Sign in as administrator → **Settings → Packages and fees**.

The migrations seed indicative figures. Replace them with MACOKASA's
actual rates before registering anybody. Repricing closes the old fee
and opens a new one, so historical records stay correct.

Also check **Settings → Revenue split** — it ships at 80 MACOKASA / 20
Quick-Think.

---

## A note on the shared platform

The Quick-Think plan calls for **one** Supabase project holding every
tenant, with SmartROSAF as tenant #1 and MACOKASA as tenant #2. The
migrations are written for that: they create both tenant rows and
isolate all data by `tenant_id`.

- If SmartROSAF already has a Supabase project, run these migrations
  **there** instead of creating a new one, and review `0001` against the
  existing tables first.
- If you would rather keep MACOKASA separate for now, a standalone
  project works unchanged. Merging later means moving data.

Decide before you register real members. Moving afterwards is harder.

---

## Still outstanding

- **Rotate the anon key** that was exposed during earlier development.
- **Contract an SMS provider.** Notifications queue correctly but
  nothing sends, and the website currently tells members they will get
  a message when their card is printed.
- **Legal review** of the privacy and retention position before
  personal data and photographs are captured.
