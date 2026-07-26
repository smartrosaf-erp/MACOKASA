# MACOKASA — Architecture

MACOKASA is **tenant #2** on the Quick-Think Solution multi-tenant platform,
alongside SmartROSAF. One codebase, one Supabase project, many tenants,
isolated by `tenant_id` and enforced by PostgreSQL row-level security.

---

## Migrations

Run in order. Each is idempotent and safe to re-run.

| File | Contents |
|---|---|
| `0001_platform_core.sql` | Tenants, domains, modules, profiles, roles, settings + history, notifications, audit log |
| `0002_macokasa_membership.sql` | Districts, areas, packages, fees, members, vehicles, assignments, ratings, registration sessions, memberships, ID cards, print batches |
| `0003_finance.sql` | Ledger accounts and entries, payments, clerk custody, remittances, revenue split, Quick-Think settlements, expenses |
| `0004_workflow_and_config.sql` | Payment confirmation, card printing, reprint approval, remittance verification, expiry job, public verification, seed configuration |

Validate before applying: `npm run sqlcheck` (parses with the real PostgreSQL
parser via `pglast`).

---

## The member model

**One person, one record.** A person may operate a vehicle, own vehicles and
rent them out, or both. Roles are flags on `members`:

```
is_operator  boolean   -- rides
is_owner     boolean   -- owns and rents out
operator_type enum     -- 'pedalist' | 'motorist'
constraint: is_operator OR is_owner
```

This avoids the duplicate-person problem that appears when owners and
operators are separate tables. An owner-operator has one membership number,
one card, one renewal date.

### Two operator types

| | Pedalist | Motorist |
|---|---|---|
| Membership no. | `MCK-P-BT-2026-0001` | `MCK-M-BT-2026-0001` |
| Card no. | `CRD-P-2026-00001` | `CRD-M-2026-00001` |
| Card design | `design_variant = 'pedalist'` | `design_variant = 'motorist'` |
| Vehicle ID | frame or rank ID | number plate |
| Compliance | reflector, training record | licence, helmets, tracker |

Sequences are per tenant, type, district and year, so the two series can never
collide.

---

## Configuration, not code

Nothing commercial is hardcoded. Admins change it as economic conditions shift.

| What | Where |
|---|---|
| Registration and renewal fees | `package_fees`, versioned by `effective_from` / `effective_to` |
| Package benefits | `package_benefits` rows, added without a deploy |
| Revenue split | `tenant_settings.revenue_split` |
| Membership term | `tenant_settings.membership_term_months` |
| Districts and areas | `districts`, `areas` |

**Fees are versioned, never overwritten.** Superseding a fee leaves history
intact, so an invoice from last year still reconciles against the fee then in
force. `current_fee(package, type, on_date)` resolves the correct one.

Every configuration change is written to `tenant_settings_history` with the
actor. That table cannot be updated or deleted by any client role.

---

## Registration workflow

Registration is **clerk-operated**. There is no self-registration path — no
policy grants `anon` insert on `members`.

```
  clerk captures  ──►  confirm each step  ──►  member saved
       │                                            │
       │                                   paid? ───┴─── no ──►  status: pending_payment
       │                                     │                   (searchable, resumable)
       │                                    yes
       ▼                                     ▼
  face photo (mandatory)            confirm_payment()
                                             │
                          ┌──────────────────┼──────────────────┐
                          ▼                  ▼                  ▼
                    ledger posted     membership active    card issued
                    (split applied)   (annual clock         status:
                    custody recorded   starts on payment)   ready_for_print
                                                                 │
                                                                 ▼
                                                      printing marks printed
                                                                 │
                                          ┌──────────────────────┼─────────┐
                                          ▼                      ▼         ▼
                                    member notified      clerk notified   print
                                                         for dispatch     locked
```

`registration_sessions` holds the in-progress draft with `confirmed_steps`, so
a clerk confirms each block before it becomes a member record.

### Print control

A card is printed **once**. This is enforced by a database trigger, not the UI,
because a UI check is defeated by a page refresh or a second tab:

- printing a card already `printed` raises an exception
- `print_count > 1` without `reprint_approved_by` raises an exception
- moving to the print queue while the membership is unpaid raises an exception

Only `operations` may call `approve_reprint()`.

`v_print_queue` returns cards sorted by district, then area, then the filing
clerk, so a print run comes off the machine already sorted for dispatch.

---

## Finance

### Ledger

A single append-only table with signed amounts and an explicit account.
Balances are **derived**, never stored, so they cannot drift out of step with
the entries that produced them.

`ledger_entries` is revoked from `anon` and `authenticated`. Corrections are
reversing entries, never updates or deletes.

### The revenue split

Configured, currently 80 MACOKASA / 20 Quick-Think, applied to `registration`
and `renewal` only. Card and replacement fees are not split.

Confirming a payment writes one atomic entry group:

| Account | Amount | Meaning |
|---|---|---|
| `REV-MEMBERSHIP` | +100% | revenue recognised |
| `SHARE-MACOKASA` | +80% | MACOKASA's share |
| `SHARE-QTS` | +20% | Quick-Think's share |
| `CUSTODY-CLERK` | +100% | liability of the collecting clerk |

The Quick-Think share is rounded, and MACOKASA takes the **remainder**, so the
two shares always reconstruct the total exactly and rounding never leaks value.

### Two balances

```
Actual     = REV-MEMBERSHIP                      -- 100% of collections
Available  = SHARE-MACOKASA + MACOKASA-DRAW      -- MACOKASA's share, less drawings
```

**Paying Quick-Think does not reduce MACOKASA's available balance.** The split
already happened at collection, so the 20% was never MACOKASA's money. A
settlement writes:

- `QTS-SETTLEMENT` −amount → draws down the Quick-Think balance
- `EXP-PLATFORM-FEE` −amount → memo expense for MACOKASA reporting

`EXP-PLATFORM-FEE` is deliberately excluded from the `available` calculation.

### Clerk custody

Every payment enters the collecting clerk's custody, whatever the method.
`clerk_custody_balance()` and `v_clerk_custody` show what each clerk owes.

A clerk submits a `remittance`; **finance verifies it, and a clerk cannot
verify their own** — enforced both in RLS (`clerk_id <> auth.uid()`) and in
`verify_remittance()`. Verification writes a negative custody entry and clears
the clerk's name.

Nor can a clerk confirm a payment they collected: `confirm_payment()` requires
`finance` or `operations`.

### Quick-Think settlement

Quick-Think raises an electronic invoice for at most its available balance.
A trigger rejects any request exceeding `v_balances.quickthink_balance`.
MACOKASA approves, then `pay_qts_settlement()` records payment.

---

## Roles

| Role | Can |
|---|---|
| `platform_admin` | Quick-Think staff; raise settlements, cross-tenant read |
| `tenant_admin` | Configure packages, fees, districts, users |
| `operations` | Approve reprints, confirm payments, oversee dispatch |
| `finance` | Confirm payments, verify remittances, settlements, expenses |
| `clerk` | Register members, collect payments, dispatch cards |
| `printing` | Work the print queue, mark cards printed |
| `viewer` | Read only |

Roles are assigned in SQL, never from the browser.

---

## Public verification

`verify_card(token)` is the only function granted to `anon`. It returns name,
membership number, operator type, package, district, status and expiry —
**and nothing else**. No phone, no national ID, no photo, no address, no next
of kin. A test asserts this.

Membership expiry is hard: a card is invalid the day after `period_end`.
`expire_memberships()` runs nightly.

---

## Notifications

`notifications` is a queue. Nothing is sent from the browser. A server-side
adapter drains it once a provider is contracted; until then rows accumulate as
`in_app` and are visible in the portal. Enabled channels are configuration
(`tenant_settings.notification_channels`).

---

## Guards

`npm run verify` runs syntax, build, security scan and tests.

`scripts/security-check.mjs` fails the build if:
- a policy on a business table omits a tenant check
- a policy grants `anon` access to a business table
- `ledger_entries` or `audit_log` is not revoked from client roles
- the member photo bucket is public
- a secret reaches `public/config.js`

Each of these was verified by deliberately introducing the fault.

`tests/finance.test.mjs` — 28 assertion groups covering split arithmetic,
rounding, balance semantics, custody, and schema guarantees.
