# MACOKASA Kabaza Management System

Administrator handoff for the MACOKASA public website, staff ERP, motorcycle owner portal, printing/card portal, operator database, subscriptions, payments, QR cards, safety compliance, cooperative loans, and impact analytics.

## Local Test

```powershell
cd "C:\Users\Mada\OneDrive\Documents\GitHub\MACOKASA"
node scripts/write-config.mjs
node scripts/dev-server.mjs
```

Open `http://127.0.0.1:4177/`.

Default local portal passwords:

- Staff ERP: `Macokasa@2026`
- Motorcycle owner portal: `Owner@2026`
- Printing portal: `Print@2026`

## Render Static Site

1. Push this folder to a GitHub repository named `MACOKASA`.
2. In Render, create a new Static Site from that GitHub repository.
3. Use branch `main`.
4. Set build command to `npm run build`.
5. Set publish directory to `public`.
6. Add the environment variables in `.env.example`.

The included `render.yaml` also describes the Render static site settings.

## Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor. It is safe to rerun after updates and creates the `member-photos` storage bucket.
3. Optionally run `supabase/seed.sql`.
4. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to Render.
5. Do not add `SUPABASE_SERVICE_ROLE_KEY` to this Render static site.

## Operations

- Membership reminders run from the ERP Operations Control screen and record dispatch logs for Email, WhatsApp, and SMS channels.
- Cash payments require collector name and remain unreconciled until marked deposited.
- Replacement, upgrade, or downgrade card issuance invalidates the old QR token and queues a new card.
- Operator registration requires a face photo, supports live camera capture or file upload, and assigns the saved portrait to the member's first ID-card print record.
- Donation and subscription screens support bank card, AirtelMoney, Mpamba, EFT, and cash recording with finance reconciliation.
- The card preview updates live when the operator name, membership class, district, area, sex, or photo changes.

Camera capture works on `localhost` during testing and on HTTPS after deployment. The browser asks the registrar for camera permission when **Open camera** is selected.

## Production Hardening

- Replace shared review passwords with per-user authentication and role permissions.
- Configure approved SMS, WhatsApp, and email providers before sending real messages.
- Tighten Supabase RLS before entering private member data.
- Store card print files and member photos in private storage with access controls.
- Keep all service-role tokens out of Git.
