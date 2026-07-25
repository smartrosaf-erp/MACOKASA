# Design language

MACOKASA uses the **Quick-Think Solution** design language, so every
product in the group reads as one family. Tokens are taken from
quickthinks.com rather than invented.

## Palette

| Token | Value | Used for |
|---|---|---|
| `--navy` | `#08213d` | Sidebar, headings, motorist identity |
| `--navy-2` | `#06172c` | Sidebar gradient base |
| `--gold` | `#efb904` | **The single call to action on any screen** |
| `--green` | `#16875f` | Success, MACOKASA share, eyebrows |
| `--sky` | `#2f9fd3` | Focus rings, pedalist identity, information |
| `--red` | `#d64545` | Refusals and overdue amounts |
| `--graphite` | `#263238` | Body text |
| `--cloud` / `--ice` | `#f5f8fb` / `#f8fbfd` | Canvas and table headers |
| `--crystal` | `rgba(255,255,255,.72)` | Glass surfaces |

Type is **Segoe UI**, matching the marketing site. No webfont is loaded,
so the platform renders instantly on a weak connection.

## Rules

1. **Gold means act.** One gold button per view: Sign in, Print, Confirm,
   Save. Everything else is ghost or navy. If two golds appear, one is wrong.
2. **Green is money and success**, never an action.
3. **Sky is information and focus**, never an action.
4. **Radii are tight** — 6/8/14px, matching the site's `--radius: 8px`.
   Rounded-everything reads as consumer software, not an operations tool.
5. **Shadows are soft and wide**, `0 18px 42px rgba(8,33,61,.055)`.
   Depth comes from layering glass, not from dark drop shadows.
6. **Eyebrows are green, uppercase, 0.16em tracked**, exactly as on
   the marketing site's section headers.
7. **Currency at large sizes** uses `moneyRich()`: the symbol is set
   small and muted so the numeral carries the weight.

## Category identity

Motorists carry **navy**, pedalists carry **sky**. This runs through
badges, choice cards, the ID card spine, the corner ribbon and the
background texture, so the two are separable at a glance and in print.

## Accessibility

- Focus rings are 2px sky at 2px offset, never removed.
- Motion honours `prefers-reduced-motion`.
- Icons are explicitly sized; an automated check fails the build if any
  icon renders above 60px, because inline SVGs have no intrinsic size
  and silently expand to fill their container.
- Text is never clipped: a check asserts no element overflows its box.
