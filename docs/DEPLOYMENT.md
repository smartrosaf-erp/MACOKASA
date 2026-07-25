# MACOKASA — Production Deployment Runbook

Follow these steps in order. Do not skip step 3 or step 5.

---

## 1. Supabase project

1. Create a Supabase project in the region closest to Malawi (`eu-central-1` is
   currently the lowest-latency option).
2. Open **SQL Editor** and run `supabase/schema.sql` in full. It is idempotent —
   safe to re-run after updates.
3. Confirm the output shows no errors and that **Database → Tables** lists
   `profiles`, `macokasa_records`, `card_verifications`, `reminder_jobs`,
   and `audit_log`.

> ⚠️ **Upgrading from the prototype?** The old schema granted `anon` full
> read/write on every record. Running the new `schema.sql` drops those policies.
> Anything that relied on anonymous writes will stop working — that is the point.

## 2. Verify row level security

In **SQL Editor**, run:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public';
```

Every table must show `rowsecurity = true`. Then confirm the bucket is private:

```sql
select id, public from storage.buckets where id = 'member-photos';
-- public must be false
```

## 3. Create the first staff account

Roles are never assignable from the browser.

1. **Authentication → Users → Add user.** Use a real address, tick
   *Auto Confirm User*, set a strong password.
2. In **SQL Editor**:

```sql
update public.profiles
   set role = 'staff', full_name = 'Full Name'
 where id = (select id from auth.users where email = 'admin@macokasa.org');
```

3. Repeat for owner / printing / webadmin accounts, changing the role value.
   Valid roles: `staff`, `owner`, `printing`, `webadmin`, `member`.

## 4. Authentication settings

In **Authentication → Providers → Email**:
- Disable **Enable email signups** — accounts are issued by administrators only.
- Enable **Confirm email**.
- Set minimum password length to 10.

In **Authentication → URL Configuration**, set Site URL to your production
domain and add it to Redirect URLs (needed for password reset).

## 5. Render static site

1. New → Static Site → connect `smartrosaf-erp/MACOKASA`, branch `main`.
2. Build command: `npm run build` · Publish directory: `public`
3. Environment variables — set these:

| Key | Value |
|---|---|
| `SUPABASE_URL` | your project URL |
| `SUPABASE_ANON_KEY` | the **anon public** key |
| `PUBLIC_BASE_URL` | `https://your-domain` |
| `MACOKASA_CONTACT_EMAIL` | real address |
| `MACOKASA_SAFETY_LINE` | real toll-free number |

4. **Delete** these if present — they are obsolete and were a security hole:
   `MACOKASA_STAFF_PASSWORD`, `MACOKASA_OWNER_PASSWORD`,
   `MACOKASA_PRINT_PASSWORD`, `MACOKASA_WEBADMIN_PASSWORD`
5. **Never** set `SUPABASE_SERVICE_ROLE_KEY` on the static site.

## 6. Post-deploy verification

Run through every one of these before handing over:

- [ ] `https://<site>/config.js` contains **no** passwords and no service key.
- [ ] Signing in with a wrong password gives a generic failure message.
- [ ] An unauthenticated visitor sees no operator or payment data anywhere.
- [ ] A `printing` account cannot open the Finance screen.
- [ ] A member photo URL copied from the ERP returns `400` when opened in a
      private window (signed URL expired / no session).
- [ ] The donation form shows the "card payments not yet enabled" notice and
      renders **no** card number or CVV field.
- [ ] `curl -sI https://<site> | grep -i content-security-policy` returns a policy.
- [ ] Card QR verification from a phone resolves to the correct domain.
- [ ] Turning off Wi-Fi shows the offline indicator and does not lose data.

## 7. Backups and recovery

- Supabase Pro plan or higher gives daily automated backups — enable it.
- Additionally schedule a weekly logical dump:
  `pg_dump "$DATABASE_URL" --schema=public -Fc -f macokasa-$(date +%F).dump`
- Store dumps off-platform with 90-day retention.
- **Test a restore quarterly** into a scratch project. An untested backup is
  not a backup.
- The `audit_log` table is the record of who changed what. Never truncate it.

## 8. Monitoring

- Enable Render deploy notifications and Supabase database alerts.
- Add an uptime check against `/` at 5-minute intervals.
- Review `audit_log` weekly for unexpected deletions:

```sql
select occurred_at, actor_role, action, collection, record_id
from public.audit_log
where action = 'delete'
order by occurred_at desc
limit 50;
```

## 9. Still outstanding before real member data

These are tracked in `AUDIT.md` and are **not** resolved by this deployment:

- Bank card payments require a licensed processor (see `docs/PAYMENTS.md`).
- SMS / WhatsApp / email providers must be contracted before reminders send.
- Real organisation contact details must replace the remaining placeholders.
- Legal pages should be reviewed by a Malawian legal advisor.
