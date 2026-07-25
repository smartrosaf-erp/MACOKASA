# MACOKASA ↔ Quick-Think Platform Alignment

Reference: *Quick-Think Solution — Cloud Software Services: Business &
Implementation Plan (Complete Edition)*, 25 July 2026.

This note records how the MACOKASA build relates to the Quick-Think SaaS
strategy, so design decisions stop being made in isolation. It is a
guardrail document, not a work order.

---

## The strategic frame

Quick-Think is moving from project work to **one multi-tenant SaaS platform**:
one codebase, one Supabase project, many tenants, isolated by `tenant_id` +
RLS, sold as subscriptions with an automated billing engine.

SmartROSAF is **tenant #1**. This repository sits in the `smartrosaf-erp`
GitHub organisation, so MACOKASA is realistically **tenant #2** — or a module
set within the ROSAF family — not a standalone product.

That matters because the plan is explicit: *"Never deploy a separate copy per
client — twenty clients must mean one thing to maintain, not twenty."*

---

## Where the current MACOKASA build conflicts with the plan

| # | Plan says | MACOKASA currently is | Severity |
|---|---|---|---|
| 1 | Every business row carries `tenant_id`; RLS enforces isolation | Zero occurrences of `tenant_id` in `supabase/schema.sql`. RLS is role-scoped, not tenant-scoped | **High** — retrofitting tenancy later means backfilling every table |
| 2 | One Supabase project for the whole platform | MACOKASA assumes its own project | **High** |
| 3 | Frontends on Cloudflare Pages; Render for API only | `render.yaml` deploys the frontend as a Render static site | Medium |
| 4 | Files in Cloudflare R2; DB stores links | Member photos in Supabase Storage with signed URLs | Medium |
| 5 | PayChangu is the decided gateway (webhooks + charge verification) | `docs/PAYMENTS.md` lists PayChangu as one of three *candidates* | Low — easy to align |
| 6 | Customisation by configuration; branding per tenant | MACOKASA branding is hardcoded throughout | Medium |
| 7 | Protected `main`, PR required, staging-first, nothing to production without approval | We have been committing directly to `main` | **Process** — see below |

### The PayChangu contradiction worth resolving

`normalizeState()` in `src/app.js` actively scrubs the string "PayChangu" out
of stored state, and does so via obfuscation:

```js
const legacyGateway = ["Pay", "Changu"].join("");
// ...replaces "AirtelMoney via PayChangu" -> "AirtelMoney", etc.
```

Someone deliberately removed PayChangu branding from this product. The business
plan names PayChangu as *the* gateway with webhook and reconciliation flows.
These cannot both be right. **Needs a decision before payment work resumes.**

---

## Two different subscription concepts — do not conflate

This is the easiest thing to get wrong:

1. **Member subscriptions** — MACOKASA charging Kabaza operators K15,000/year.
   This is MACOKASA's *own* business logic, a domain feature.
2. **Tenant subscriptions** — Quick-Think charging MACOKASA a monthly SaaS fee
   under the billing engine (plans, invoices, grace → read-only → suspended).

The billing engine in Section 9 is level 2. MACOKASA's membership fees are
level 1. They share vocabulary and nothing else. Level 1 must not be built on
top of level 2's tables, and level 2 must not inherit level 1's assumptions.

---

## Where the current build already aligns

- **Supabase + Postgres + RLS + Auth** — the validated stack, already adopted.
- **Per-user accounts with roles**, no shared passwords — matches Section 15's
  access philosophy exactly.
- **Audit logs** — listed as platform core; already implemented.
- **Legal pages** — the plan flags their absence as a key gap for Malawi Data
  Protection Act (2024) posture. MACOKASA now has Privacy + Terms.
  *Improvement available:* name MACRA as the supervisory authority.
- **Demo data clearly labelled** — matches the "demo tenant, never real client
  data" principle.
- **Mobile-money-first, MWK pricing, offline tolerance** — the stated
  differentiators; all present.
- **Security check in CI, fine-grained expiring tokens** — matches Section 18.

---

## Process correction

Section 18 sets the working method: protected `main`, pull request before
merge, staging-first migrations, *"nothing touches production without explicit
approval"*, and a first session that is **fully read-only**.

We have been pushing directly to `main`. That was done with per-turn approval,
but it is not the agreed method. **Recommended going forward:**

- Feature branches + PR for review, as with `design/epic-public-site`.
- Schema changes as reviewable SQL migration files, tested on a staging
  Supabase project before production.
- No production writes without a specific named approval.

---

## Decisions taken (25 July 2026)

1. **MACOKASA is a tenant** of the Quick-Think platform, alongside SmartROSAF.
2. **Tenancy retrofitted now** — `supabase/migrations/0001_platform_tenancy.sql`.
3. **PayChangu is in.** The `normalizeState()` scrubbing has been removed.
4. **Working method is feature branch + PR**, per Section 18.

## Still open

- **Hosting:** Cloudflare Pages (plan) vs Render (current `render.yaml`).
  Deferring — Render works, and the CSP/headers are already tuned for it.
- **Supabase project:** own project vs the shared platform project. The
  migration is written so either works; the tenant row is what matters.
- **Cloudflare R2** for member photos instead of Supabase Storage. Deferred:
  signed-URL access is already correct, and R2 is a swap of one adapter.
- **Branding by configuration.** `tenants.branding` exists and is loaded but
  MACOKASA's logo and colours are still hardcoded. Needed before a second
  membership-vertical tenant.
