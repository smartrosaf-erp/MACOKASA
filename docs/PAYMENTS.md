# MACOKASA — Payment Integration Contract

## Current position

| Method | Status | How it works today |
|---|---|---|
| AirtelMoney | Manual | Payer confirms a prompt; staff record the reference |
| TNM Mpamba | Manual | Payer confirms a prompt; staff record the reference |
| Bank transfer (EFT) | Manual | Payer transfers; staff record the bank reference |
| Cash | Manual | Collector named, unreconciled until deposited |
| **Bank card** | **Disabled** | Shows a "not yet enabled" notice |

## Why card capture was removed

The prototype rendered `Card number`, `Expiry` and `CVV` inputs with no payment
processor behind them. Rendering those fields in your own DOM puts MACOKASA in
PCI-DSS scope as a merchant handling cardholder data, and storing or even
transiting a CVV is prohibited. The fields have been replaced with a notice and
alternate-method shortcuts.

**Do not reinstate raw card fields under any circumstances.**

## Integrating a processor correctly

When MACOKASA contracts a licensed provider, use a **hosted checkout** or a
**processor-hosted iframe** so card data never touches this application.

**PayChangu is the platform's decided gateway** (Quick-Think Business &
Implementation Plan, Section 11). It covers Airtel Money, TNM Mpamba, cards and
bank, with webhooks plus a charge-verification endpoint for reconciliation.

The `payment_gateways` table in the platform schema keeps gateways pluggable so
Stripe or Flutterwave can be added for international tenants later.

> Historical note: an earlier MACOKASA build actively scrubbed the PayChangu
> name out of stored state via `normalizeState()`. That contradicted the
> platform decision and has been removed. Legacy strings now migrate forward
> rather than being erased.

### Integration points in the code

1. `paymentFieldsFor("card", context)` in `src/app.js` — replace the notice with
   a container the provider's SDK mounts into, or a redirect button.
2. `submitPayment()` / `submitDonation()` — must not mark a payment as received
   on form submit. Set status `pending` and wait for confirmation.
3. **Webhook required.** A static site cannot verify payment. Add a Supabase
   edge function that (per plan Section 9.1, steps 4 and 6):
   - verifies the provider's signature on the callback,
   - looks up the pending record by provider reference,
   - updates status to `paid` using the service role key,
   - writes an `audit_log` entry.
4. Never trust a client-side "payment succeeded" callback to mark money received.

### Required environment variables (server side only)

```
PAYCHANGU_PUBLIC_KEY=          # safe in client bundle
PAYCHANGU_SECRET_KEY=          # edge function ONLY
PAYCHANGU_WEBHOOK_SECRET=      # edge function ONLY
```

Docs: https://developer.paychangu.com/docs/webhooks

### Nightly reconciliation

Webhooks are not guaranteed to arrive. Per plan Section 9.1 step 6, run a
nightly job that calls PayChangu's charge-verification endpoint for every
invoice still marked pending, and closes any gap. Without this, a dropped
webhook silently becomes an unpaid-looking paid invoice.

The secret and signing keys must never appear in `scripts/write-config.mjs`.

## Cash controls

Cash remains the highest-risk channel. Current mitigations:

- Collector name is mandatory on every cash entry.
- Entries stay `unreconciled` until Finance marks them deposited.
- All mutations are written to `audit_log` with the acting user.

Recommended additions before scale:
- Sequential pre-numbered receipt books reconciled against system entries.
- Dual authorisation for reconciliation — the collector must not be the reconciler.
- Daily banking deadline with an exception report for aged unreconciled cash.


---

## Two subscription concepts — do not merge them

| | Member subscriptions | Tenant subscriptions |
|---|---|---|
| Who pays | Kabaza operators | MACOKASA, as a Quick-Think client |
| What for | Annual membership, K7,500-K90,000 | SaaS platform fee |
| Lives in | `macokasa_records`, collection `payments` | Platform `subscriptions` / `invoices` |
| Drives | Card issuance, renewal reminders | `tenants.status`, access middleware |

They share vocabulary and nothing else. The billing engine in plan Section 9
governs the right-hand column only. MACOKASA's membership fees must never be
built on those tables, and tenant billing must not inherit membership logic.
