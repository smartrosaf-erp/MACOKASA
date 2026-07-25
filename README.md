# MACOKASA

The national register of Malawi Kabaza taxi operators — a public
website and an operations platform, sharing one identity.

**Public site** at `/` — what MACOKASA is, how to join, fees, and public
card verification.
**Operations platform** at `/?portal=1` — staff only, behind sign-in.

MACOKASA is **tenant #2** on the Quick-Think Solution multi-tenant
platform, alongside SmartROSAF. One codebase, one Supabase project, many
tenants, isolated by `tenant_id` and enforced by PostgreSQL row-level
security.

---

## What it does

| Area | Capability |
|---|---|
| **Registration** | Clerk-operated wizard. Every step is confirmed before the next unlocks; a final review shows everything back before saving. Face photo captured by camera or upload. |
| **Deferred payment** | A member with no money today is saved as `pending_payment`, searchable, and converted the moment they pay. |
| **Two operator types** | Pedalists (bicycle) and motorists (motorcycle) have separate number series, fees, compliance rules and card designs. |
| **Owners** | A person may ride, own and rent out, or both — one member record with role flags. Owners get a fleet tool and access to MACOKASA-verified operators. |
| **Cards** | Printed once, enforced by the database. Queue sorted by district, area and filing clerk. Reprints need operations approval. |
| **Finance** | Append-only ledger, configurable revenue split, clerk cash custody, remittance verification, Quick-Think settlement. |
| **Configuration** | Fees, benefits, split ratio and term length are data, edited by admins, never code. |

There is **no public self-registration**. Members are registered by
MACOKASA clerks, face to face.

---

## See it working

```bash
npm run build && npm run dev     # http://127.0.0.1:4177/
```

With no database configured the platform starts in **demonstration
mode**: 64 sample members across 8 districts, full finance history, and
one-click sign-in as any role. See `docs/DEMO.md`.

Screenshots of every screen are in `screenshots/`.

## Running it

```bash
npm run build      # writes public/config.js, copies src -> public/src
npm run dev        # http://127.0.0.1:4177/

npm run check      # syntax-check every JS file
npm run sqlcheck   # parse migrations with the real PostgreSQL parser
npm run security   # secrets, tenancy and PCI scan
npm test           # finance arithmetic + application rules
npm run bootcheck  # boot the app in jsdom (needs: npm i)
npm run verify     # check + build + security + test
```

Without `SUPABASE_URL` and `SUPABASE_ANON_KEY` the app shows a
configuration notice. It does not run on local data — membership, money
and cards all live in the database.

Camera capture needs `localhost` or HTTPS.

---

## Architecture

```
src/
  app.js              shell, routing, auth, public verification
  lib/
    api.js            every read and write; RLS is the real boundary
    dom.js            escaping and templating
    format.js         money, dates, Malawi phone handling
  ui/
    components.js     panels, tables, modals, toasts, badges
    icons.js          inline SVG set
    idcard.js         pedalist and motorist card rendering
    photo.js          camera capture and image normalisation
  screens/
    dashboard.js  register.js  members.js  cards.js
    finance.js    fleet.js     settings.js

supabase/migrations/
  0001_platform_core.sql        tenants, roles, settings, notifications, audit
  0002_macokasa_membership.sql  members, packages, fees, vehicles, cards
  0003_finance.sql              ledger, payments, custody, settlements
  0004_workflow_and_config.sql  workflow functions, verification, seed data
```

Full detail in **`docs/ARCHITECTURE.md`**. Deployment in
**`docs/DEPLOYMENT.md`**.

---

## The money model, briefly

Revenue splits at collection by a configured ratio (currently 80 MACOKASA
/ 20 Quick-Think), on registration and renewal only.

```
Actual     = 100% of what was collected
Available  = MACOKASA's share, less its own drawings
```

**Paying Quick-Think does not reduce Available.** The split already
happened; that 20% was never MACOKASA's money. A settlement draws down
the Quick-Think balance and books a memo expense for reporting.

Every payment enters the collecting clerk's custody. The clerk submits a
remittance; **finance verifies it, and a clerk cannot verify their own.**

---

## Separation of duties

Enforced in SQL, not just the interface:

- a clerk cannot confirm a payment they collected
- a clerk cannot verify their own remittance
- only operations may approve a card reprint
- Quick-Think cannot request more than its available balance
- the ledger and audit log are revoked from every client role

---

## Roles

`platform_admin` · `tenant_admin` · `operations` · `finance` · `clerk` ·
`printing` · `viewer`

Assigned in SQL only, never from the browser.

---

## Status

The migrations and application are complete and validated, but **not yet
applied to any database**. Follow `docs/DEPLOYMENT.md`: staging first,
then the nine-step smoke test, then production.

Outstanding before real member data:
- run the migrations on staging and work the smoke test
- contract an SMS provider (notifications queue but do not send)
- legal review of retention and privacy posture
- rotate the Supabase anon key exposed during earlier development
