# MACOKASA Kabaza Management System

Public website and management platform for the Malawi Coalition for Kabaza
Stakeholders Association — operator registration, membership and renewals,
QR identity cards, payments and finance, safety compliance, cooperative loans,
and impact reporting.

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | Vanilla ES modules, no framework, no bundler |
| Styling | Single CSS file with a design-token system |
| Data | Supabase (Postgres + Realtime + Storage + Auth) |
| Offline | `localStorage` working copy, synced when online |
| Hosting | Render static site |

**Source of truth is `src/`.** The build copies `src/` into `public/src/` and
generates `public/config.js`. Both are gitignored — never edit files under
`public/src/`, your changes will be overwritten on the next build.

---

## Local development

```bash
npm run build     # generates public/config.js and copies src -> public/src
npm run dev       # serves http://127.0.0.1:4177/
npm run check     # syntax validation
npm test          # operator category logic tests
npm run security  # secret / PCI / RLS scan
npm run verify    # all of the above
```

Without `SUPABASE_URL` and `SUPABASE_ANON_KEY` the app runs on demonstration
data and displays a banner saying so. Portal sign-in is disabled in that mode.

To develop against a real project, create `.env` from `.env.example` and export
the variables before running the build.

Camera capture for member photos requires `localhost` or HTTPS.

---

## Security model

Read this before changing anything that touches data.

- **Authentication is Supabase Auth.** Individual accounts, email + password.
  There are no shared passwords. The prototype's client-side password gate was
  removed because `public/config.js` is world-readable.
- **Authorisation is row level security** keyed on `profiles.role`.
  Roles: `staff`, `owner`, `printing`, `webadmin`, `member`.
  Anonymous visitors can read nothing and may only insert QR scan logs.
- **Roles are assigned in SQL only**, never from the browser.
- **Member photographs live in a private bucket.** Records store a
  `storage:member-photos/<path>` reference; the client mints a 5-minute signed
  URL at render time.
- **Every record mutation is written to `audit_log`** with the acting user and
  before/after snapshots. Financial records cannot be deleted by anyone.
- **`public/config.js` is public.** Never add a secret to
  `scripts/write-config.mjs`. The build warns if legacy password variables are
  detected in the environment.

---

## Operator categories

MACOKASA registers two distinct kinds of taxi operator. They are modelled
separately throughout — fees, compliance criteria, membership numbering, and
ID card design.

| | Motorcycle operator | Bicycle operator (pedal) |
|---|---|---|
| Code | `M` | `B` |
| Membership no. | `MCK-M-LL-2026-0001` | `MCK-B-BT-2026-0001` |
| Plans | Regular / Silver / Gold / Platinum | Pedal Regular / Silver / Gold |
| Entry fee | K15,000 | K7,500 |
| Card band | `MOTORCYCLE TAXI`, navy | `PEDAL TAXI`, cyan |
| Vehicle field | Plate number | Bicycle ID |
| Compliance | Driving licence, rider + passenger helmet, tracker | Reflector, training record, bicycle ID |

Sequence numbers are counted per category, so the two series never collide.
Membership plans are constrained to the operator's category at both
registration and card design — a pedal operator cannot be placed on a
motorcycle plan.

To add a category, extend `OPERATOR_CATEGORIES` in `src/app.js` and add plans
with a matching `category` field in `src/data.js`.

## Documentation

| Document | Purpose |
|---|---|
| `AUDIT.md` | Production readiness audit — open issues by severity |
| `docs/DEPLOYMENT.md` | Step-by-step production runbook and verification checklist |
| `docs/PAYMENTS.md` | Payment integration contract and PCI constraints |
| `supabase/schema.sql` | Database schema, RLS policies, audit triggers |

---

## Deployment

See **`docs/DEPLOYMENT.md`**. Summary:

1. Run `supabase/schema.sql` in the Supabase SQL editor.
2. Create the first staff user and assign the role in SQL.
3. Deploy to Render from `main`, build `npm run build`, publish `public`.
4. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PUBLIC_BASE_URL`.
5. Delete any legacy `MACOKASA_*_PASSWORD` variables.
6. Work through the post-deploy verification checklist.

---

## Operations

- Membership reminders are dispatched from the ERP Operations Control screen and
  logged per channel. **Providers are not yet contracted** — no real messages send.
- Cash payments require a collector name and stay unreconciled until deposited.
- Replacing, upgrading or downgrading a card invalidates the previous QR token.
- Operator registration requires a face photo via live capture or upload.

---

## Known limitations

Tracked in `AUDIT.md`. The significant ones:

- Bank card payments disabled pending a licensed processor.
- SMS / WhatsApp / email delivery not contracted.
- Some organisation contact details are still placeholders.
- Legal pages require review by a Malawian legal advisor.
- Test coverage is limited to operator category logic.
