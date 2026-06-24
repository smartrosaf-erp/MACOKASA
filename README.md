# MACOKASA Kabaza Management System

A static-first web app prototype for the Malawi Coalition for Kabaza Stakeholders Association (MACOKASA). It includes a public website, staff ERP portal, motorcycle owner portal, printing authority view, operator database, memberships, payments, cash accountability, QR ID cards, safety compliance, cooperative loan requests, owner fund tracking, and impact analytics.

## What is included

- Public MACOKASA website with impact stories, data, registration, and donation entry.
- Operator registration for Regular, Silver, Gold, and Platinum annual memberships.
- Motorcycle owner subscriptions and motorcycle-to-operator mapping.
- Bank, POS, AirtelMoney, Mpamba, and Cash payment capture.
- Cash collector tracking until bank deposit reconciliation.
- Renewal reminder queue for 4 weeks, 2 weeks, 1 week, 3 days, 2 days, and 1 day before expiry.
- PVC ID card preview with QR verification token.
- Replacement/upgrade/downgrade card workflow that invalidates old QR tokens.
- Licence, helmet, passenger helmet, licence plate, tracker, and ROSAF benefit tracking.
- Cooperative motorcycle loan request pipeline where MACOKASA can act as guarantor.
- Owner fund management for income, expenses, target-based agreements, and monthly-pay agreements.
- Supabase schema and Edge Function starter for reminders.
- Render static-site deployment config.
- GitHub Actions syntax verification workflow.

## Local test

This project has no package dependencies. It uses the bundled browser and local JavaScript files.

```powershell
cd "C:\Users\Mada\Documents\Codex\2026-06-20\remove-revenue-receipts-i-find-it\outputs\macokasa-kabaza-system"
node scripts/write-config.mjs
node scripts/dev-server.mjs
```

Open:

```text
http://127.0.0.1:4177/
```

The app starts in local demo mode and saves changes in browser localStorage.

## GitHub setup

1. Create a private GitHub repository.
2. Push this folder to GitHub.
3. Keep `.env`, service-role keys, payment provider secrets, SMS secrets, and WhatsApp secrets out of Git.
4. Use pull requests so MACOKASA can review changes before Render auto-deploys.

## Supabase setup

1. Create a free Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Optionally run `supabase/seed.sql`.
4. Copy your Project URL and public anon key.
5. Add those values to Render as `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

The prototype schema uses one JSONB table named `macokasa_records` for speed. Before production, split this into normalized tables, add authenticated roles, and restrict RLS policies by user type.

## Render setup

1. In Render, create a Static Site from the GitHub repository.
2. Use the included `render.yaml`, or set:
   - Build command: `node scripts/write-config.mjs`
   - Publish directory: `public`
3. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `PUBLIC_BASE_URL`

Render static sites can deploy from GitHub and provide an `onrender.com` URL. Supabase free plan is enough for a lean prototype, but production data volume, file storage, SMS, WhatsApp, and payment callbacks need careful capacity planning.

## Data sources used in the prototype

- The Times Group: https://times.mw/0-35-kabaza-operators-registered/
- Malawi News Agency: https://manaonline.gov.mw/index.php?Itemid=412&id=6065%3Amacokasa-in-kabaza-awareness-campaign&option=com_k2&view=item
- Nation Online: https://mwnation.com/fresh-drive-to-tame-kabaza/
- Nyasa Times: https://www.nyasatimes.com/despite-many-accidents-malawians-still-prefer-kabaza/
- Render Static Sites docs: https://render.com/docs/static-sites
- Render Free docs: https://render.com/docs/free
- Supabase pricing: https://supabase.com/pricing
- Supabase billing and free-plan limits: https://supabase.com/docs/guides/platform/billing-on-supabase

## Production notes

- A copied QR code can still scan. The real control should be live token validation, invalidation on replacement, anti-copy laminate or hologram, card serial number, audit logs, and verification screens.
- Real card, mobile money, and donation payments need provider callbacks, not only front-end form entries.
- Real WhatsApp/SMS/email reminders need approved providers and opt-in consent.
- Private member and owner data needs privacy notices, role-based access, and stricter Supabase RLS.
- Staff login should use Supabase Auth with roles such as staff, finance, printing, owner, and public verifier.
