# Demonstration mode

The platform ships with a full in-browser demonstration so the product
can be reviewed without a database.

## Running it

```bash
npm install     # first time only, for the boot checks
npm run build
npm run dev     # http://127.0.0.1:4177/
```

Demo mode activates automatically when no Supabase project is
configured, or explicitly with `?demo=1`.

Sign in by clicking any role card — no password. A ribbon in the corner
reads **Demonstration data** so it can never be mistaken for live.

## Roles to try

| Role | Sign in as | What to look at |
|---|---|---|
| Administrator | Ruth Mbewe | Settings: reprice a package, change the revenue split |
| Data clerk | Patrick Mvula | Register a member, take a payment, see your custody |
| Finance | Esther Nyirenda | Confirm a payment, verify a remittance, pay Quick-Think |
| Printing | Samuel Nyasulu | Work the print queue, try printing a card twice |
| Operations | Daniel Kaunda | Approve a reprint |
| Quick-Think | billing@quickthinks.com | Raise a settlement invoice |

## Rules worth testing

These all fail deliberately, and are the point of the design:

1. **Print a card twice** — Card production → Print, then Print again.
   Refused: a reprint needs operations.
2. **Confirm your own collection** — sign in as the clerk, go to
   Finance → Payments. The button is replaced by
   *"Another officer must confirm"*.
3. **Verify your own remittance** — same pattern on the Remittances tab.
4. **Over-request a settlement** — as Quick-Think, ask for more than the
   available balance. Rejected with the actual figure.
5. **Pay Quick-Think** — watch MACOKASA Available stay unchanged while
   the Quick-Think balance draws down.
6. **Register without payment** — the member saves as pending payment
   and appears under that filter, ready to pay later.

## What the demo is not

- It is **not** a security boundary. Access rules are enforced by
  PostgreSQL row-level security in production; the demo only mirrors
  them so the interface behaves correctly.
- Data lives in memory and resets on reload.
- Nothing is written anywhere, and no network calls are made.

The seed contains 64 members across 8 districts, roughly 70% motorists
and 30% pedalists, with a realistic spread of active, pending and lapsed
memberships, plus fleet, custody, remittances and settlements.
