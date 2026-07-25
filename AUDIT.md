# MACOKASA — Production Readiness Audit
Date: 2026-07-25 · Branch audited: `main` @ 3dec2c0
**Remediation pass 1 applied — see status tags below.**

## Severity key
- **P0** — blocks client/member use. Legal, security or data-loss risk.
- **P1** — must fix before public launch.
- **P2** — quality, polish, maintainability.

---

## P0 — BLOCKERS

### ✅ FIXED — P0-1. Portal passwords are shipped to every visitor in plain text
`scripts/write-config.mjs` writes all four portal passwords into `public/config.js`,
which is a world-readable static file on the deployed site.

```
window.MACOKASA_CONFIG = { "portalPasswords": { "staff": "Macokasa@2026", ... } }
```

Anyone can open `https://<site>/config.js` and read the Staff ERP password.
`submitPortalLogin()` compares client-side, so there is effectively **no access control**.

**Fix:** remove passwords from the client bundle entirely. Move to Supabase Auth
(email + password, per-user) with roles in a `profiles` table, or at minimum a
server-side session endpoint. Client-side password gates cannot be secured.

### ✅ FIXED — P0-2. Database is fully open to anonymous users
`supabase/schema.sql` grants `anon` **select / insert / update / delete** on
`macokasa_records` with `using (true)`. That table holds every operator, owner,
payment and card record.

Any visitor with the anon key (also public) can read the entire member database,
alter payment records, or delete all operators.

**Fix:** replace review policies with authenticated, role-scoped policies.
Deny `anon` everything except the card-verification insert.

### ✅ FIXED — P0-3. Member ID photos are in a public storage bucket
The `member-photos` bucket is created with `public = true` and an `anon` read
policy. Face photographs of named members are personal data, guessable by URL.

**Fix:** private bucket + signed URLs with short TTL.

### ✅ FIXED — P0-4. Payment card fields collected with no processor
`paymentFieldsFor("card")` renders Name / Card number / Expiry / CVV inputs.
There is no PCI-compliant gateway behind them. Collecting a CVV into app state
is a compliance violation.

**Fix:** remove raw card capture, or integrate a hosted checkout/iframe from a
licensed processor. Never touch the PAN or CVV in your own DOM.

### ✅ FIXED — P0-5. Real money flows have no audit trail or authorisation
Payments, reconciliation and cash collection are mutated in `localStorage`
and pushed to an open table. No immutable ledger, no who-did-what, no approvals.

**Fix:** append-only audit table, `created_by` on every mutation, dual control
on cash reconciliation.

---

## P1 — LAUNCH BLOCKERS

- **P1-1.** Toll-free line is the placeholder `1234XY` (footer, About, Contact — 4 places).
- **P1-2.** Demo/seed records ship as the default state; a fresh production visitor
  sees fabricated operators and payments as if real.
- **P1-3.** No legal pages: privacy notice, terms, data-protection statement.
  Mandatory when collecting biometric-adjacent photos and phone numbers.
- **P1-4.** No cookie/consent or data-retention statement for stored member photos.
- **P1-5.** No error boundary. Any thrown render error blanks `#app` with no recovery.
- **P1-6.** No offline/failed-network handling; Supabase drop shows "Connecting" forever.
- **P1-7.** No form-level validation feedback (phone format, duplicate membership no.).
- **P1-8.** `PUBLIC_BASE_URL` defaults to `__origin__`; QR verification links may
  resolve wrongly on a custom domain if unset.
- **P1-9.** No backups documented for Supabase; no restore runbook.
- **P1-10.** No security headers (CSP, X-Frame-Options, Referrer-Policy) in `render.yaml`.

---

## P2 — QUALITY

- **P2-1.** `src/` is duplicated into `public/src/` by the build; source of truth is
  easy to get wrong — a developer editing `public/src/app.js` loses work on next build.
- **P2-2.** `app.js` is a single 3,456-line module; no tests, no linting.
- **P2-3.** No CI beyond `node --check` syntax validation.
- **P2-4.** README documents a Windows-only local path.
- **P2-5.** No 404 handling — dev server returns index.html for any path.
- **P2-6.** Images unoptimised (full-size JPEGs, no responsive `srcset`, no lazy-load).
- **P2-7.** No analytics or uptime monitoring.

---

## Recommended sequence

1. Replace client-side passwords with Supabase Auth + roles. (P0-1)
2. Lock RLS to authenticated roles. (P0-2)
3. Private photo bucket + signed URLs. (P0-3)
4. Strip raw card capture. (P0-4)
5. Audit trail on financial mutations. (P0-5)
6. Real contact details, remove demo data, add legal pages. (P1-1..4)
7. Resilience: error boundary, offline state, validation. (P1-5..7)
8. Hardening: security headers, backups, monitoring. (P1-9,10)
9. Quality: de-duplicate source, tests, CI, image optimisation. (P2)


---

## Remediation pass 1 — 2026-07-25

### Resolved

| ID | Resolution |
|---|---|
| P0-1 | Client password gate removed. Supabase Auth with per-user accounts; roles in `profiles`. `write-config.mjs` no longer emits passwords and warns if legacy vars are set. |
| P0-2 | All `using (true)` anon policies dropped. Role-scoped RLS via `has_role()`. Anon may only insert card scan logs. Financial records undeletable. |
| P0-3 | `member-photos` bucket set private. Records store `storage:` refs; client mints 5-minute signed URLs. Read limited to staff/printing. |
| P0-4 | Card number / expiry / CVV inputs removed, plus dead preview code. Replaced with integration notice and alternate-method shortcuts. `docs/PAYMENTS.md` defines the correct hosted-checkout contract. |
| P0-5 | `audit_log` table with insert/update/delete triggers capturing actor, role, and before/after JSON. Insert/update/delete revoked from all client roles. |
| P1-2 | Demo data now announced by a visible banner when Supabase is unconfigured. |
| P1-3 | Privacy notice and Terms of use pages added, routed, and linked in the footer. |
| P1-4 | Retention periods and local-storage explanation documented in the privacy notice. |
| P1-5 | Error boundary with recovery screen; all event handlers wrapped. |
| P1-6 | Online/offline detection with visible indicator and status downgrade. |
| P1-8 | `PUBLIC_BASE_URL` documented; reset redirect uses `appBaseUrl()`. |
| P1-9 | Backup, restore, and monitoring procedures in `docs/DEPLOYMENT.md`. |
| P1-10 | CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy in `render.yaml`. |
| P2-1 | `public/src/` and `public/config.js` untracked and gitignored. `src/` is the single source of truth. |
| P2-3 | CI runs syntax, build, `security-check.mjs`, and a committed-secret scan. |
| P2-4 | README rewritten; Windows-only path removed. |

### Still open

| ID | Item | Owner |
|---|---|---|
| P0-1a | **Rotate the Supabase anon key** and any credential exposed while the old `config.js` was live. | MACOKASA |
| P1-1 | Real toll-free number, email, and address. Env vars exist and are wired; values needed. | MACOKASA |
| P1-7 | Field-level validation feedback (phone format, duplicate membership numbers). | Dev |
| P2-2 | `app.js` is one large module with no unit tests. | Dev |
| P2-6 | Image optimisation: `srcset`, WebP, lazy-loading beyond member photos. | Dev |
| P2-7 | Analytics and uptime monitoring not configured. | MACOKASA |
| — | Legal pages need review by a Malawian legal advisor. | MACOKASA |
| — | SMS / WhatsApp / email providers not contracted; reminders do not send. | MACOKASA |


---

## Change log — operator categories, 2026-07-25

Bicycle (pedal) and motorcycle operators are now first-class distinct
categories rather than a cosmetic dropdown value.

**Data model**
- Three pedal membership plans added at roughly half the motorcycle rate:
  Pedal Regular K7,500 / Pedal Silver K15,000 / Pedal Gold K27,500.
- Every operator plan now declares a `category`.
- Membership numbers encode the category: `MCK-M-...` / `MCK-B-...`.
  Sequence is counted per category so the series never collide.
- Card numbers follow the same scheme: `CARD-M-0001` / `CARD-B-0001`.

**Corrections to existing behaviour**
- `safetyStatus()` previously required a helmet and plate for every operator,
  so a bicycle operator could never reach "Safer rank ready". Pedal operators
  are now assessed on reflector and bicycle identification.
- The demo bicycle operator was recorded as owning a motorcycle, on a
  motorcycle plan, with a motorcycle plate. Corrected.
- The registration form asked bicycle operators for a driving licence,
  plate, and tracker. It now adapts to the selected category.

**ID cards** — visually distinct at arm's length: coloured spine, diagonal
`PEDAL TAXI` / `MOTORCYCLE TAXI` corner band with vehicle icon, category
background texture, vehicle identifier row labelled appropriately, and a
category strip on the reverse. Colours are print-exact.

**Tests** — `tests/category.test.mjs`, 13 assertion groups, wired into
`npm run verify` and CI.


---

## Change log — owner and fleet categories, 2026-07-25

Extends the operator category split to the ownership side.

**Data model**
- Pedal owner plans added: Pedal Owner Basic K22,500, Pedal Owner Fleet K60,000
  (half the motorcycle owner rates).
- Owners carry `ownerCategory`; vehicles carry `vehicleCategory`.
- `ownerCategoryOf()` falls back through plan category then held vehicles, so
  legacy records without the field resolve sensibly.

**Corrections**
- Demo `bike-002` was a TVS HLX motorcycle with a motorcycle plate assigned to
  `op-002`, who is a bicycle operator, under a motorcycle owner plan. Now a
  pedal taxi with a bicycle ID under a pedal owner plan.
- Owner `owner-002` was on `owner_basic`; moved to `pedal_owner_basic`.

**Referential integrity**
- `submitMotorcycle()` refuses to link a vehicle to an operator of the other
  category, naming the conflict.
- Owner and operator pickers are filtered by the selected vehicle type.
- The fleet table flags any pre-existing cross-category assignment rather than
  hiding it.

**Wording** — the owner portal no longer says "motorcycle" to pedal owners.
Role labels, metrics, tables, and public copy now read "vehicle" or the
category-correct noun. `planAudienceLabel()` maps the retained
`"Motorcycle Owner"` audience key to accurate display text.

**Tests** — 25 assertion groups, including data-integrity checks that assert no
demo vehicle, operator, or owner is on a record from another category. These
would have caught the `bike-002` defect.
