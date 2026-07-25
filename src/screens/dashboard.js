import { esc, html } from "../lib/dom.js";
import { icon } from "../ui/icons.js";
import { panel, table, stat, badge, statusBadge, typeBadge, banner, memberCell } from "../ui/components.js";
import { money, date, compact, relativeDays } from "../lib/format.js";
import * as api from "../lib/api.js";

let data = {};

export async function load() {
  const [total, motorists, pedalists, owners, pending, active, balances, queue, recent, expiring] =
    await Promise.all([
      api.countMembers(),
      api.countMembers({ operator_type: "motorist" }),
      api.countMembers({ operator_type: "pedalist" }),
      api.countMembers({ is_owner: true }),
      api.countMembers({ status: "pending_payment" }),
      api.countMembers({ status: "active" }),
      api.getBalances().catch(() => null),
      api.listPrintQueue().catch(() => []),
      api.searchMembers({ limit: 8 }),
      api.searchMembers({ status: "active", limit: 100 })
    ]);

  const soon = expiring
    .filter((m) => m.period_end && relativeDays(m.period_end) <= 30)
    .sort((a, b) => new Date(a.period_end) - new Date(b.period_end))
    .slice(0, 8);

  data = { total, motorists, pedalists, owners, pending, active, balances, queue, recent, soon };
}

export function render() {
  const b = data.balances;
  const canSeeMoney = api.hasRole("platform_admin", "tenant_admin", "finance", "operations");

  return html`
    <div class="grid" style="margin-bottom:18px">
      ${stat({ label: "Total members", value: compact(data.total), note: "All registered records", tone: "stat-accent", span: 3 })}
      ${stat({ label: "Motorists", value: compact(data.motorists), note: "Motorcycle Kabaza", tone: "stat-motor", span: 3 })}
      ${stat({ label: "Pedalists", value: compact(data.pedalists), note: "Bicycle Kabaza", tone: "stat-pedal", span: 3 })}
      ${stat({ label: "Owners", value: compact(data.owners), note: "Renting vehicles out", span: 3 })}
    </div>

    <div class="grid" style="margin-bottom:18px">
      ${stat({
        label: "Awaiting payment",
        value: compact(data.pending),
        note: "Saved, not yet paid",
        tone: data.pending > 0 ? "stat-gold" : "",
        span: 3
      })}
      ${stat({ label: "Active memberships", value: compact(data.active), note: "Paid and current", span: 3 })}
      ${
        canSeeMoney && b
          ? stat({
              label: "MACOKASA available",
              value: `<span class="pos">${money(b.macokasa_available)}</span>`,
              note: "Own share, spendable",
              tone: "stat-accent",
              span: 3
            })
          : stat({ label: "Cards to print", value: compact(data.queue.length), span: 3 })
      }
      ${
        canSeeMoney && b
          ? stat({
              label: "In clerk hands",
              value: money(b.clerk_custody),
              note: "Not yet reconciled",
              tone: Number(b.clerk_custody) > 0 ? "stat-red" : "",
              span: 3
            })
          : stat({ label: "Your role", value: esc(String(api.role()).replace(/_/g, " ")), span: 3 })
      }
    </div>

    ${
      data.pending > 0
        ? banner(
            "warn",
            `${data.pending} member${data.pending === 1 ? "" : "s"} awaiting payment`,
            "Filter Members by 'pending payment' to find and take payment from them."
          )
        : ""
    }

    <div class="grid">
      ${panel({
        span: 7,
        eyebrow: "Latest",
        title: "Recently registered",
        tight: true,
        body: table({
          columns: [
            { label: "Member", render: (r) => memberCell(r) },
            { label: "Type", render: (r) => typeBadge(r.operator_type) },
            { label: "Status", render: (r) => statusBadge(r.status) },
            { label: "Registered", render: (r) => date(r.created_at) }
          ],
          rows: data.recent,
          empty: "No members registered yet."
        })
      })}

      ${panel({
        span: 5,
        eyebrow: "Renewals",
        title: "Expiring within 30 days",
        tight: true,
        body: table({
          columns: [
            { label: "Member", render: (r) => memberCell(r) },
            {
              label: "Expires",
              render: (r) => {
                const d = relativeDays(r.period_end);
                return `${date(r.period_end)}<br>${badge(
                  d < 0 ? `${Math.abs(d)}d overdue` : `${d}d`,
                  d < 0 ? "red" : "amber"
                )}`;
              }
            }
          ],
          rows: data.soon,
          empty: "Nothing expiring soon."
        })
      })}
    </div>
  `;
}
