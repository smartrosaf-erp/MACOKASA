# How tenants get a tailored system on one codebase

The requirement: every client's system should feel built for them —
their language, their fields, their workflow, their branding — while
Quick-Think maintains **one** codebase and **one** database.

This is exactly the problem Oracle and SAP solved, and it is worth
copying how they solved it rather than inventing something.

---

## What Oracle and SAP actually do

Neither ships a different product per customer. Both ship one core and
make it configurable along defined seams:

| SAP concept | What it means | Our equivalent |
|---|---|---|
| Client (mandant) | Data partition per organisation | `tenant_id` + RLS |
| Customising (IMG) | Thousands of settings tables | `tenant_settings` |
| Field status groups | Which fields show, and whether required | `tenant_field_config` |
| Custom fields (append structures) | Extra fields without forking core | `custom_fields` + `custom_values` |
| Workflow variants | Approval routes per company code | `tenant_workflow` |
| BAdIs / user exits | Named hook points | `tenant_rules` |
| Screen variants | Terminology and layout per client | `tenant_terminology` |

The discipline that makes it work is a single rule:

> **Customisation is data. If a client need requires editing code, the
> code is wrong — it needed a configuration seam instead.**

The moment you fork the codebase for one client, twenty clients means
twenty things to maintain, and the plan's core promise dies.

---

## The four levels of tailoring

Not every client need is the same size. Match the mechanism to the need.

### Level 1 — Configuration (minutes, no deploy)

Already possible: fees, packages, benefits, revenue split, membership
term, districts, enabled modules.

An administrator changes a value in Settings. Nothing is deployed.

### Level 2 — Terminology and fields (minutes, no deploy)

New. A client calls members "operators", another calls them
"associates", a third calls them "riders". A school tenant calls them
"students".

`tenant_terminology` maps a canonical term to that tenant's word, and
the whole interface follows.

`tenant_field_config` decides per tenant whether a field is hidden,
optional, required, or read-only — and what its label says.

### Level 3 — Custom fields (minutes, no deploy)

New. A client needs something the core has never heard of: chassis
number, cooperative branch, sacco group, blood type.

They define it in Settings. It is stored as typed JSON against the
record, appears on the form, in the detail view, and in exports.

### Level 4 — A new module set (one build, then reusable)

A hospital tenant needs patients and appointments. A school needs
students and fees. These are genuinely new domains, so they are built
once as a module set, switched on per tenant, and every future client
in that vertical gets them for free.

**A truly unique feature becomes a platform feature behind a toggle.**
The client pays for it; Quick-Think owns it; the next client can buy it.
That is the contract policy in Section 4.2 of the plan.

---

## What this repository has today

| Seam | State |
|---|---|
| Data isolation by tenant | Done, enforced by RLS |
| Module toggles | Done, drives the sidebar |
| Settings store with history | Done |
| Branding column | Exists, loaded, **not applied** |
| Terminology | **Missing** |
| Field configuration | **Missing** |
| Custom fields | **Missing** |
| Workflow variants | **Missing** |

Migration `0005_tenant_extensibility.sql` adds the four missing ones.

---

## How each works

### Branding

`tenants.branding` holds a JSON object:

```json
{
  "displayName": "MACOKASA",
  "shortName": "MACOKASA",
  "tagline": "Kabaza Stakeholders Association",
  "logoUrl": "./assets/macokasa-logo.png",
  "primary": "#0a5236",
  "accent": "#c8901c",
  "ink": "#0c1512"
}
```

The client applies these as CSS custom properties at run time, so a
tenant's colours and logo appear without a rebuild. White-label is then
a premium tier, exactly as the plan describes, rather than a code fork.

### Terminology

```sql
insert into tenant_terminology (tenant_id, term_key, singular, plural)
values (:t, 'member', 'operator', 'operators');
```

Interface strings call `t('member')` instead of hardcoding the word.
A cooperative tenant sees "associate", a school sees "student".

### Field configuration

```sql
insert into tenant_field_config (tenant_id, entity, field_key, visibility, label)
values (:t, 'member', 'national_id', 'required', 'National ID number');
```

`visibility` is one of `hidden`, `optional`, `required`, `readonly`.
A tenant that does not collect next of kin hides it. A tenant that must
have a national ID makes it required. No branching in code.

### Custom fields

```sql
insert into custom_fields (tenant_id, entity, field_key, label, data_type, required)
values (:t, 'member', 'sacco_branch', 'SACCO branch', 'text', false);
```

Values live in `custom_values` as typed JSON keyed by record. They
appear on the registration wizard, the member detail panel and exports,
because those screens render whatever the tenant has defined rather than
a fixed list.

### Workflow variants

```sql
insert into tenant_workflow (tenant_id, process_key, config)
values (:t, 'payment_confirmation', '{
  "requiresSecondApproval": true,
  "thresholdAmount": 500000,
  "approverRole": "operations"
}');
```

The confirm-payment function reads this. One tenant needs a second
approval above half a million kwacha; another does not. Same function,
different data.

---

## The rules that keep this maintainable

1. **No tenant-specific branching in code.** No `if (tenant === 'macokasa')`.
   A security check fails the build if one appears.
2. **Every new field is data, not a column**, unless it is genuinely
   core to every tenant in the vertical.
3. **Defaults must be sensible.** A tenant that configures nothing gets
   a working system.
4. **Configuration is versioned.** `tenant_settings_history` already
   records who changed what. Extend the same discipline to new tables.
5. **A unique feature becomes a platform feature behind a toggle**, and
   remains Quick-Think's intellectual property unless exclusivity is
   purchased.

---

## Where a dedicated instance is still right

The plan allows it, and it remains correct for:

- a client whose regulator forbids shared infrastructure
- a client large enough that their load would harm others
- a government body requiring data residency guarantees

Same codebase, own database, own deployment, premium price. This is the
exception, not the pattern, and it should be sold as such.

---

## Configuring a tenant, in practice

An administrator does all of this in **Settings**. No SQL, no deploy,
no developer.

| Tab | What it changes |
|---|---|
| **Branding** | Display name, tagline, logo, and the three brand colours. A live preview applies them to the whole interface before you save. |
| **Terminology** | Your word for member, operator, owner, vehicle, card, rank, district, package and organisation. |
| **Fields** | Each standard field set to hidden, optional, required or read-only, with your own label. Below that, add fields the system has never heard of. |
| **Workflow** | Whether a clerk may confirm their own collection, whether large payments need a second approval and above what amount, who may authorise a card reprint, how the print queue sorts, and the remittance variance tolerated. |

Two safeguards are built in:

- **Retiring a custom field never deletes it.** The definition is
  deactivated so values already captured stay readable.
- **Weakening a money control asks you to confirm.** Allowing a clerk
  to confirm their own collection, or verify their own remittance,
  requires an explicit acceptance and is written to the configuration
  history against your name.

### Onboarding a new tenant

1. Insert the tenant row and enable its modules.
2. Create their administrator and grant `tenant_admin`.
3. Hand them the Settings screen.

Steps 1 and 2 are SQL. Step 3 is the client tailoring their own system.

## Build sequence, for reference

1. `0005_tenant_extensibility.sql` — the seams. **Done.**
2. Branding applied at run time. **Done.**
3. Terminology through `t()`. **Done.**
4. Field configuration in the registration wizard. **Done.**
5. Custom fields rendered, validated, stored. **Done.**
6. Settings UI so administrators do all of it themselves. **Done.**
7. A second vertical module set — only when a client in that vertical
   is paying for it.
