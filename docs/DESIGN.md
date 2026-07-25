# Design language — "Sunrise on the road"

MACOKASA has its own identity, drawn from the Malawi flag: a rising sun
over a dark horizon, with the flag's green and crimson as support. It
stays in the Quick-Think family through the gold accent and tight
geometry, but it is unmistakably MACOKASA rather than a recolour of the
parent brand.

## Palette

| Token | Value | Meaning |
|---|---|---|
| `--ink` | `#101a17` | The horizon. Sidebar, headings, motorist identity |
| `--forest` | `#0d5c3f` | Malawi green. Success, money, primary confirmation |
| `--sun` | `#f5a524` | The rising sun. **The single call to action** |
| `--crimson` | `#c1272d` | Flag red. Refusals, overdue, danger only |
| `--sky` | `#2e7d9a` | Information, pedalist identity |
| `--canvas` | `#f7f6f2` | Warm parchment, not cold grey |

The canvas is deliberately warm. Malawi is not a blue-grey country and
the product should not feel like a northern-hemisphere SaaS dashboard.

## Type

- **Fraunces** for display — a soft serif with optical sizing. It gives
  headlines and large figures a human, editorial weight that a grotesk
  cannot.
- **Plus Jakarta Sans** for interface — open, legible at small sizes,
  and it renders well on the low-end Android devices clerks use.

Large numerals are set in Fraunces so a dashboard reads like a report
rather than a spreadsheet.

## Rules

1. **Sun means act.** One gold button per view. Everything else is
   ghost, ink or forest.
2. **Forest means money and success**, never an action.
3. **Sky means information**, never an action.
4. **Crimson is only ever a refusal**, never decoration.
5. Radii step 6 / 10 / 14 / 20 / 28. Cards and modals sit at the
   generous end, controls at the tight end.
6. Depth is soft and wide, never a hard drop shadow.
7. Eyebrows are forest, uppercase, 0.18em tracked, with a two-tone rule.

## Two faces, one product

**The public website** is the outward face: what MACOKASA is, how to
join, what it costs, and how to verify a card. Editorial layout, large
imagery, generous whitespace, scroll-reveal.

**The operations platform** sits behind a staff sign-in at `?portal=1`.
Denser, calmer, built for a clerk working through a queue. It shares the
palette and type so the two read as one organisation.

There is a single discreet "Staff portal" link on the website. The ERP
is never advertised to members.

## Category identity

Motorists carry deep **navy-ink**, pedalists carry **teal**. This runs
through badges, choice cards, the ID card spine, corner ribbon and
background texture, so the two are separable at a glance and in print.

## Guards

Automated checks fail the build if:
- any icon renders above 60px (inline SVGs have no intrinsic size and
  silently expand to fill their container)
- any text is clipped by its container
- the page scrolls horizontally
- the site hardcodes a fee amount instead of reading configuration
