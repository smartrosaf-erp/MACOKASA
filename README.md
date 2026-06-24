# MACOKASA Kabaza Management System

Administrator handoff for the MACOKASA public website, staff ERP, motorcycle owner portal, printing/card portal, operator database, subscriptions, payments, QR cards, safety compliance, cooperative loans, and impact analytics.

## Local Test

```powershell
cd "C:\Users\Mada\Documents\Codex\2026-06-20\remove-revenue-receipts-i-find-it\outputs\macokasa-kabaza-system"
node scripts/write-config.mjs
node scripts/dev-server.mjs
```

Open `http://127.0.0.1:4177/`.

Default local portal passwords:

- Staff ERP: `Macokasa@2026`
- Motorcycle owner portal: `Owner@2026`
- Printing portal: `Print@2026`

## Cloudflare Pages

1. Create a Cloudflare Pages project named `macokasa-kabaza-system`.
2. Set build command to `node scripts/write-config.mjs`.
3. Set output directory to `public`.
4. Add the environment variables in `.env.example`.
5. Deploy manually with:

```powershell
wrangler pages deploy public --project-name macokasa-kabaza-system
```

The included GitHub Action can also deploy to Cloudflare Pages when these repository secrets exist: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `PUBLIC_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PAYCHANGU_PUBLIC_KEY`, and the three portal password secrets.

## Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Optionally run `supabase/seed.sql`.
4. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Cloudflare Pages.
5. Add `SUPABASE_SERVICE_ROLE_KEY` only to Cloudflare Pages function secrets, never to public client config.

## PayChangu

Add `PAYCHANGU_PUBLIC_KEY` for hosted checkout forms. Add `PAYCHANGU_SECRET_KEY` for the Cloudflare Pages Functions under `/api/paychangu/*`, which initiate and verify transactions server-side.

## Operations

- Membership reminders run from the ERP Operations Control screen and record dispatch logs for Email, WhatsApp, and SMS channels.
- Cash payments require collector name and remain unreconciled until marked deposited.
- Replacement, upgrade, or downgrade card issuance invalidates the old QR token and queues a new card.
- The card preview updates live when the operator name, membership class, district, area, sex, plate, or photo changes.

## Production Hardening

- Replace shared review passwords with per-user authentication and role permissions.
- Configure approved SMS, WhatsApp, and email providers before sending real messages.
- Tighten Supabase RLS before entering private member data.
- Store card print files and member photos in private storage with access controls.
- Keep all service-role, PayChangu secret, and Cloudflare tokens out of Git.
