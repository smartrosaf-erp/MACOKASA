/**
 * Finance module.
 *
 * Two balances that must never be confused:
 *   Actual    — 100% of what was collected
 *   Available — MACOKASA's own share, which is what it may actually spend
 *
 * Paying Quick-Think draws down the QTS balance and books a memo expense.
 * It does NOT reduce Available, because the split already happened at
 * collection: that 20% was never MACOKASA's money.
 */

import { esc, html, formData } from "../lib/dom.js";
import { icon } from "../ui/icons.js";
import {
  panel,
  table,
  banner,
  badge,
  statusBadge,
  stat,
  notify,
  modal,
  closeModal,
  confirmDialog,
  loading
} from "../ui/components.js";
import { money, moneyRich, date, dateTime, fullName } from "../lib/format.js";
import * as api from "../lib/api.js";

let tab = "overview";
let data = {
  balances: null,
  custody: [],
  payments: [],
  remittances: [],
  settlements: [],
  expenses: [],
  staff: []
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "payments", label: "Payments" },
  { key: "custody", label: "Clerk custody" },
  { key: "remittances", label: "Remittances" },
  { key: "settlements", label: "Quick-Think" },
  { key: "expenses", label: "Expenses" }
];

export async function load() {
  const [balances, custody, payments, remittances, settlements, expenses, staff] = await Promise.all([
    api.getBalances(),
    api.getClerkCustody(),
    api.listPayments({ limit: 120 }),
    api.listRemittances(),
    api.listSettlements(),
    api.listExpenses(),
    api.listStaff().catch(() => [])
  ]);
  data = { balances, custody, payments, remittances, settlements, expenses, staff };
}

function staffName(id) {
  return data.staff.find((s) => s.id === id)?.full_name || "—";
}

export function render() {
  return html`
    <div class="toolbar no-print">
      <div class="chips">
        ${TABS.map(
          (t) => `<button class="chip ${tab === t.key ? "active" : ""}" data-tab="${t.key}">${esc(t.label)}</button>`
        ).join("")}
      </div>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" data-act="refresh">${icon("refresh")} Refresh</button>
    </div>
    ${
      tab === "overview"
        ? overview()
        : tab === "payments"
          ? paymentsTab()
          : tab === "custody"
            ? custodyTab()
            : tab === "remittances"
              ? remittancesTab()
              : tab === "settlements"
                ? settlementsTab()
                : expensesTab()
    }
  `;
}

/* ---------------- Overview ---------------- */

function overview() {
  const b = data.balances || {};
  const actual = Number(b.actual_revenue || 0);
  const available = Number(b.macokasa_available || 0);
  const qts = Number(b.quickthink_balance || 0);
  const custody = Number(b.clerk_custody || 0);

  const split = api.setting("revenue_split", { macokasa: 0.8, quickthink: 0.2 });
  const mckPct = Math.round((split.macokasa || 0.8) * 100);
  const qtsPct = Math.round((split.quickthink || 0.2) * 100);

  const pendingPayments = data.payments.filter((p) => p.status === "pending");

  return html`
    <div class="grid" style="margin-bottom:18px">
      ${stat({
        label: "Actual revenue",
        value: moneyRich(actual),
        note: "Everything collected and confirmed, 100%",
        tone: "stat-accent",
        span: 3
      })}
      ${stat({
        label: "MACOKASA available",
        value: `<span class="pos">${moneyRich(available)}</span>`,
        note: `${mckPct}% share, less drawings`,
        tone: "stat-accent",
        span: 3
      })}
      ${stat({
        label: "Quick-Think owed",
        value: moneyRich(qts),
        note: `${qtsPct}% share, less settlements paid`,
        tone: "stat-gold",
        span: 3
      })}
      ${stat({
        label: "In clerk hands",
        value: moneyRich(custody),
        note: "Not yet remitted or reconciled",
        tone: custody > 0 ? "stat-red" : "",
        span: 3
      })}
    </div>

    ${
      pendingPayments.length
        ? banner(
            "warn",
            `${pendingPayments.length} payment${pendingPayments.length === 1 ? "" : "s"} awaiting confirmation`,
            "Cards are not prepared until finance confirms the payment. Confirm them on the Payments tab."
          )
        : ""
    }

    <div class="grid">
      ${panel({
        span: 7,
        eyebrow: "How revenue divides",
        title: "Revenue split",
        body: html`
          <div class="split-bar" style="margin-bottom:12px">
            <span class="mck" style="width:${mckPct}%"></span>
            <span class="qts" style="width:${qtsPct}%"></span>
          </div>
          <div class="legend" style="margin-bottom:16px">
            <span><i style="background:var(--green)"></i>MACOKASA ${mckPct}%</span>
            <span><i style="background:var(--gold)"></i>Quick-Think ${qtsPct}%</span>
          </div>
          <dl class="kv">
            <dt>Collected (actual)</dt><dd>${money(actual)}</dd>
            <dt>MACOKASA share</dt><dd>${money(actual * (split.macokasa || 0.8))}</dd>
            <dt>Quick-Think share</dt><dd>${money(actual * (split.quickthink || 0.2))}</dd>
            <dt>Settled to Quick-Think</dt><dd>${money(actual * (split.quickthink || 0.2) - qts)}</dd>
          </dl>
          ${banner(
            "info",
            "Paying Quick-Think does not reduce Available",
            "The split happens when money is collected. A settlement draws down the Quick-Think balance and is recorded as an expense for reporting only."
          )}
        `
      })}

      ${panel({
        span: 5,
        eyebrow: "Outstanding",
        title: "Money in clerk hands",
        tight: true,
        body: table({
          columns: [
            { label: "Clerk", render: (r) => esc(r.clerk_name || staffName(r.clerk_id)) },
            { label: "Receipts", align: "right", render: (r) => String(r.held_count || 0) },
            {
              label: "Held",
              align: "right",
              render: (r) => `<span class="${Number(r.held_amount) > 0 ? "money-neg" : ""}">${money(r.held_amount)}</span>`
            }
          ],
          rows: data.custody.filter((c) => Number(c.held_amount) > 0),
          empty: "Every clerk is clear."
        })
      })}
    </div>
  `;
}

/* ---------------- Payments ---------------- */

function paymentsTab() {
  const canConfirm = api.hasRole("platform_admin", "tenant_admin", "operations", "finance");
  return panel({
    title: "Payments",
    tight: true,
    body: table({
      columns: [
        { label: "Receipt", render: (r) => esc(r.receipt_no) },
        { label: "Taken", render: (r) => dateTime(r.collected_at) },
        { label: "By", render: (r) => esc(staffName(r.collected_by)) },
        { label: "Purpose", render: (r) => esc(String(r.purpose).replace(/_/g, " ")) },
        { label: "Method", render: (r) => esc(String(r.method).replace(/_/g, " ")) },
        { label: "Amount", align: "right", render: (r) => money(r.amount) },
        { label: "Status", render: (r) => statusBadge(r.status) },
        {
          label: "",
          align: "right",
          className: "actions",
          render: (r) => {
            if (r.status !== "pending") return "";
            if (!canConfirm) return `<span class="na">Finance confirms</span>`;
            if (r.collected_by === api.state.profile.id && !api.setting("allow_clerk_self_confirm_payment", false)) {
              return `<span class="na" title="You collected this">Another officer must confirm</span>`;
            }
            return `<button class="btn btn-primary btn-sm" data-confirm="${esc(r.id)}">${icon("check")} Confirm</button>`;
          }
        }
      ],
      rows: data.payments,
      empty: "No payments recorded."
    })
  });
}

/* ---------------- Custody ---------------- */

function custodyTab() {
  const mine = data.custody.find((c) => c.clerk_id === api.state.profile.id);
  return html`
    ${
      mine && Number(mine.held_amount) > 0
        ? banner(
            "warn",
            `You are holding ${money(mine.held_amount)}`,
            "Submit a remittance when you bank it, so finance can clear your name."
          ) +
          `<div style="margin-bottom:16px"><button class="btn btn-primary" data-act="new-remittance">${icon(
            "wallet"
          )} Submit a remittance</button></div>`
        : ""
    }
    ${panel({
      title: "Custody by clerk",
      tight: true,
      body: table({
        columns: [
          { label: "Clerk", render: (r) => esc(r.clerk_name || staffName(r.clerk_id)) },
          { label: "Receipts held", align: "right", render: (r) => String(r.held_count || 0) },
          { label: "Held", align: "right", render: (r) => money(r.held_amount) },
          { label: "Remitted", align: "right", render: (r) => money(r.remitted_amount) },
          { label: "Reconciled", align: "right", render: (r) => money(r.reconciled_amount) },
          {
            label: "Oldest held",
            render: (r) => (r.oldest_held_at ? date(r.oldest_held_at) : "—")
          }
        ],
        rows: data.custody,
        empty: "No custody records."
      })
    })}
  `;
}

/* ---------------- Remittances ---------------- */

function remittancesTab() {
  const canVerify = api.hasRole("platform_admin", "tenant_admin", "finance");
  return html`
    <div class="toolbar no-print">
      <span class="spacer"></span>
      <button class="btn btn-primary btn-sm" data-act="new-remittance">${icon("plus")} Submit remittance</button>
    </div>
    ${panel({
      title: "Remittances",
      tight: true,
      body: table({
        columns: [
          { label: "Reference", render: (r) => esc(r.reference) },
          { label: "Clerk", render: (r) => esc(staffName(r.clerk_id)) },
          { label: "Declared", align: "right", render: (r) => money(r.declared_amount) },
          { label: "Expected", align: "right", render: (r) => money(r.expected_amount) },
          {
            label: "Variance",
            align: "right",
            render: (r) => {
              const v = Number(r.variance || 0);
              if (!v) return `<span class="na">—</span>`;
              return `<span class="${v < 0 ? "money-neg" : "money-pos"}">${money(v)}</span>`;
            }
          },
          { label: "Submitted", render: (r) => date(r.submitted_at) },
          { label: "Status", render: (r) => statusBadge(r.status) },
          {
            label: "",
            align: "right",
            className: "actions",
            render: (r) => {
              if (r.status === "cleared") return "";
              if (!canVerify) return `<span class="na">Finance verifies</span>`;
              if (r.clerk_id === api.state.profile.id) {
                return `<span class="na" title="You submitted this">Another officer must verify</span>`;
              }
              return `<button class="btn btn-primary btn-sm" data-verify="${esc(r.id)}">${icon("check")} Verify</button>`;
            }
          }
        ],
        rows: data.remittances,
        empty: "No remittances submitted."
      })
    })}
  `;
}

/* ---------------- Quick-Think settlements ---------------- */

function settlementsTab() {
  const qts = Number(data.balances?.quickthink_balance || 0);
  const isPlatform = api.hasRole("platform_admin");
  const canApprove = api.hasRole("platform_admin", "tenant_admin", "finance");

  return html`
    <div class="grid" style="margin-bottom:16px">
      ${stat({
        label: "Available to Quick-Think",
        value: moneyRich(qts),
        note: "Only this may be requested",
        tone: "stat-gold",
        span: 4
      })}
      ${stat({
        label: "Requested, unpaid",
        value: moneyRich(
          data.settlements
            .filter((s) => ["requested", "approved"].includes(s.status))
            .reduce((t, s) => t + Number(s.amount_requested), 0)
        ),
        span: 4
      })}
      ${stat({
        label: "Settled to date",
        value: moneyRich(data.settlements.filter((s) => s.status === "paid").reduce((t, s) => t + Number(s.amount_paid || 0), 0)),
        span: 4
      })}
    </div>

    ${
      isPlatform
        ? `<div class="toolbar no-print"><span class="spacer"></span>
             <button class="btn btn-primary btn-sm" data-act="new-settlement">${icon("receipt")} Raise invoice</button>
           </div>`
        : banner(
            "info",
            "Quick-Think raises these invoices",
            "MACOKASA reviews, approves and pays. Only the available balance can be requested."
          )
    }

    ${panel({
      title: "Settlement invoices",
      tight: true,
      body: table({
        columns: [
          { label: "Invoice", render: (r) => esc(r.invoice_no) },
          {
            label: "Period",
            render: (r) => (r.period_start ? `${date(r.period_start)} → ${date(r.period_end)}` : "—")
          },
          { label: "Requested", align: "right", render: (r) => money(r.amount_requested) },
          {
            label: "Available then",
            align: "right",
            render: (r) => `<span class="row-sub">${money(r.amount_available_at_request)}</span>`
          },
          { label: "Paid", align: "right", render: (r) => (r.amount_paid ? money(r.amount_paid) : "—") },
          { label: "Status", render: (r) => statusBadge(r.status) },
          {
            label: "",
            align: "right",
            className: "actions",
            render: (r) => {
              if (!canApprove) return "";
              if (r.status === "requested")
                return html`
                  <button class="btn btn-ghost btn-sm" data-reject="${esc(r.id)}">Reject</button>
                  <button class="btn btn-primary btn-sm" data-approve="${esc(r.id)}">Approve</button>
                `;
              if (r.status === "approved")
                return `<button class="btn btn-primary btn-sm" data-pay="${esc(r.id)}">${icon("money")} Pay</button>`;
              return "";
            }
          }
        ],
        rows: data.settlements,
        empty: "No settlement invoices raised."
      })
    })}
  `;
}

/* ---------------- Expenses ---------------- */

function expensesTab() {
  return html`
    <div class="toolbar no-print">
      <span class="spacer"></span>
      <button class="btn btn-primary btn-sm" data-act="new-expense">${icon("plus")} Record expense</button>
    </div>
    ${panel({
      title: "Expenses",
      tight: true,
      body: table({
        columns: [
          { label: "Reference", render: (r) => esc(r.reference) },
          { label: "Date", render: (r) => date(r.incurred_on) },
          { label: "Category", render: (r) => esc(r.category) },
          { label: "Description", render: (r) => esc(r.description) },
          { label: "Payee", render: (r) => esc(r.payee || "—") },
          { label: "Amount", align: "right", render: (r) => money(r.amount) },
          { label: "Status", render: (r) => statusBadge(r.status) }
        ],
        rows: data.expenses,
        empty: "No expenses recorded."
      })
    })}
  `;
}

/* ---------------- Interaction ---------------- */

export function bind(root, rerender) {
  root.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-tab]")?.dataset.tab;
    if (t) {
      tab = t;
      rerender();
      return;
    }

    if (e.target.closest('[data-act="refresh"]')) {
      await load();
      notify.info("Finance data refreshed.");
      rerender();
      return;
    }

    const confirmId = e.target.closest("[data-confirm]")?.dataset.confirm;
    if (confirmId) return confirmPayment(confirmId, rerender);

    if (e.target.closest('[data-act="new-remittance"]')) return newRemittance(rerender);

    const verifyId = e.target.closest("[data-verify]")?.dataset.verify;
    if (verifyId) return verifyRemittance(verifyId, rerender);

    if (e.target.closest('[data-act="new-settlement"]')) return newSettlement(rerender);

    const approveId = e.target.closest("[data-approve]")?.dataset.approve;
    if (approveId) return decideSettlement(approveId, "approved", rerender);

    const rejectId = e.target.closest("[data-reject]")?.dataset.reject;
    if (rejectId) return decideSettlement(rejectId, "rejected", rerender);

    const payId = e.target.closest("[data-pay]")?.dataset.pay;
    if (payId) return paySettlement(payId, rerender);

    if (e.target.closest('[data-act="new-expense"]')) return newExpense(rerender);
  });
}

async function confirmPayment(id, rerender) {
  const p = data.payments.find((x) => x.id === id);
  const ok = await confirmDialog({
    title: "Confirm this payment?",
    message: `${money(p.amount)} on receipt ${p.receipt_no}. This posts the revenue split, activates the membership and releases the card for printing. It cannot be undone without a reversal.`,
    confirmLabel: "Confirm payment"
  });
  if (!ok) return;
  try {
    await api.confirmPayment(id);
    notify.ok("Payment confirmed. The card is now in the print queue.");
    await load();
    rerender();
  } catch (error) {
    notify.err(error.message);
  }
}

async function newRemittance(rerender) {
  const mine = data.custody.find((c) => c.clerk_id === api.state.profile.id);
  const expected = Number(mine?.held_amount || 0);

  const m = modal({
    title: "Submit a remittance",
    body: html`
      ${banner("info", `You are holding ${money(expected)}`, "Declare what you are banking. Finance will verify it.")}
      <div class="form-grid" data-form="remit">
        <label class="field"><span>Amount declared *</span>
          <input class="input" type="number" name="declared_amount" value="${expected}" min="0" step="0.01" required />
        </label>
        <label class="field"><span>Method</span>
          <select class="select" name="method">
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="airtel_money">Airtel Money</option>
            <option value="mpamba">Mpamba</option>
          </select>
        </label>
        <label class="field full"><span>Deposit reference</span>
          <input class="input" name="deposit_ref" placeholder="Bank slip or transaction reference" />
        </label>
        <label class="field full"><span>Notes</span>
          <textarea class="textarea" name="notes"></textarea>
        </label>
      </div>
    `,
    footer: html`
      <button class="btn btn-ghost" type="button" data-close>Cancel</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" type="button" data-save>Submit</button>
    `
  });

  m.querySelector("[data-save]").onclick = async () => {
    const v = formData(m.querySelector('[data-form="remit"]'));
    const declared = Number(v.declared_amount);
    if (declared < 0) return notify.err("Enter a valid amount.");
    if (declared !== expected) {
      const ok = await confirmDialog({
        title: "Amount does not match",
        message: `You are holding ${money(expected)} but declaring ${money(declared)}. The difference will be flagged to finance as a variance. Continue?`,
        confirmLabel: "Submit anyway",
        danger: true
      });
      if (!ok) return;
    }
    try {
      const ref = await api.nextReference("RMT", "remittances");
      await api.createRemittance({
        tenant_id: api.state.profile.tenant_id,
        reference: ref,
        clerk_id: api.state.profile.id,
        declared_amount: declared,
        expected_amount: expected,
        method: v.method,
        deposit_ref: v.deposit_ref?.trim() || null,
        notes: v.notes?.trim() || null
      });
      closeModal();
      notify.ok(`Remittance ${ref} submitted for verification.`);
      await load();
      rerender();
    } catch (error) {
      notify.err(error.message);
    }
  };
}

async function verifyRemittance(id, rerender) {
  const r = data.remittances.find((x) => x.id === id);
  const variance = Number(r.variance || 0);
  const ok = await confirmDialog({
    title: "Verify this remittance?",
    message: variance
      ? `Declared ${money(r.declared_amount)} against ${money(r.expected_amount)} expected — a variance of ${money(variance)}. Verifying clears the clerk's custody.`
      : `${money(r.declared_amount)} from ${staffName(r.clerk_id)}. Verifying clears their custody.`,
    confirmLabel: "Verify and clear",
    danger: Boolean(variance)
  });
  if (!ok) return;
  try {
    await api.verifyRemittance(id);
    notify.ok("Remittance verified. The clerk's custody is cleared.");
    await load();
    rerender();
  } catch (error) {
    notify.err(error.message);
  }
}

async function newSettlement(rerender) {
  const available = Number(data.balances?.quickthink_balance || 0);
  const m = modal({
    title: "Raise a settlement invoice",
    body: html`
      ${banner("info", `${money(available)} is available`, "A request above the available balance will be rejected by the system.")}
      <div class="form-grid" data-form="settle">
        <label class="field"><span>Amount requested *</span>
          <input class="input" type="number" name="amount_requested" value="${available}" min="1" max="${available}" step="0.01" required />
        </label>
        <label class="field"><span>Period start</span>
          <input class="input" type="date" name="period_start" />
        </label>
        <label class="field"><span>Period end</span>
          <input class="input" type="date" name="period_end" />
        </label>
        <label class="field full"><span>Notes</span>
          <textarea class="textarea" name="notes" placeholder="What this invoice covers"></textarea>
        </label>
      </div>
    `,
    footer: html`
      <button class="btn btn-ghost" type="button" data-close>Cancel</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" type="button" data-save>${icon("receipt")} Raise invoice</button>
    `
  });

  m.querySelector("[data-save]").onclick = async () => {
    const v = formData(m.querySelector('[data-form="settle"]'));
    const amount = Number(v.amount_requested);
    if (!amount || amount <= 0) return notify.err("Enter an amount.");
    if (amount > available) return notify.err(`Only ${money(available)} is available.`);
    try {
      const inv = await api.nextReference("QTS", "qts_settlements");
      await api.createSettlement({
        tenant_id: api.state.profile.tenant_id,
        invoice_no: inv,
        amount_requested: amount,
        amount_available_at_request: available,
        period_start: v.period_start || null,
        period_end: v.period_end || null,
        status: "requested",
        requested_by: api.state.profile.id,
        notes: v.notes?.trim() || null
      });
      closeModal();
      notify.ok(`Invoice ${inv} raised for ${money(amount)}.`);
      await load();
      rerender();
    } catch (error) {
      notify.err(error.message);
    }
  };
}

async function decideSettlement(id, status, rerender) {
  const s = data.settlements.find((x) => x.id === id);
  if (status === "rejected") {
    const m = modal({
      title: "Reject this invoice",
      body: html`
        <div class="form-grid">
          <label class="field full"><span>Reason *</span>
            <textarea class="textarea" data-reason placeholder="Why is this being rejected?"></textarea>
          </label>
        </div>
      `,
      footer: html`
        <button class="btn btn-ghost" type="button" data-close>Cancel</button>
        <span class="spacer"></span>
        <button class="btn btn-danger" type="button" data-ok>Reject invoice</button>
      `
    });
    m.querySelector("[data-ok]").onclick = async () => {
      const reason = m.querySelector("[data-reason]").value.trim();
      if (!reason) return notify.err("Give a reason.");
      try {
        await api.updateSettlement(id, { status: "rejected", rejection_reason: reason });
        closeModal();
        notify.ok("Invoice rejected.");
        await load();
        rerender();
      } catch (error) {
        notify.err(error.message);
      }
    };
    return;
  }

  const ok = await confirmDialog({
    title: "Approve this invoice?",
    message: `${money(s.amount_requested)} on invoice ${s.invoice_no}. Approval authorises payment.`,
    confirmLabel: "Approve"
  });
  if (!ok) return;
  try {
    await api.updateSettlement(id, {
      status: "approved",
      approved_by: api.state.profile.id,
      approved_at: new Date().toISOString()
    });
    notify.ok("Invoice approved and ready for payment.");
    await load();
    rerender();
  } catch (error) {
    notify.err(error.message);
  }
}

async function paySettlement(id, rerender) {
  const s = data.settlements.find((x) => x.id === id);
  const m = modal({
    title: `Pay invoice ${s.invoice_no}`,
    body: html`
      ${banner(
        "info",
        "This does not reduce MACOKASA Available",
        "The split already happened at collection. Paying Quick-Think draws down their balance and records an expense for reporting."
      )}
      <div class="form-grid" data-form="paysettle">
        <label class="field"><span>Amount *</span>
          <input class="input" type="number" name="amount" value="${s.amount_requested}" min="1" max="${s.amount_requested}" step="0.01" required />
        </label>
        <label class="field"><span>Method *</span>
          <select class="select" name="method">
            <option value="bank_transfer">Bank transfer</option>
            <option value="airtel_money">Airtel Money</option>
            <option value="mpamba">Mpamba</option>
            <option value="cash">Cash</option>
          </select>
        </label>
        <label class="field full"><span>Payment reference</span>
          <input class="input" name="ref" placeholder="Bank or transaction reference" />
        </label>
      </div>
    `,
    footer: html`
      <button class="btn btn-ghost" type="button" data-close>Cancel</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" type="button" data-save>${icon("money")} Record payment</button>
    `
  });

  m.querySelector("[data-save]").onclick = async () => {
    const v = formData(m.querySelector('[data-form="paysettle"]'));
    try {
      await api.paySettlement({
        id,
        amount: Number(v.amount),
        method: v.method,
        ref: v.ref?.trim() || null
      });
      closeModal();
      notify.ok("Settlement paid and recorded.");
      await load();
      rerender();
    } catch (error) {
      notify.err(error.message);
    }
  };
}

async function newExpense(rerender) {
  const m = modal({
    title: "Record an expense",
    body: html`
      <div class="form-grid" data-form="exp">
        <label class="field"><span>Category *</span>
          <select class="select" name="category">
            ${["Card production", "Transport", "Stationery", "Training", "Rent", "Salaries", "Other"]
              .map((c) => `<option value="${c}">${c}</option>`)
              .join("")}
          </select>
        </label>
        <label class="field"><span>Amount *</span>
          <input class="input" type="number" name="amount" min="1" step="0.01" required />
        </label>
        <label class="field"><span>Date *</span>
          <input class="input" type="date" name="incurred_on" value="${new Date().toISOString().slice(0, 10)}" required />
        </label>
        <label class="field"><span>Payee</span>
          <input class="input" name="payee" />
        </label>
        <label class="field full"><span>Description *</span>
          <input class="input" name="description" required />
        </label>
      </div>
    `,
    footer: html`
      <button class="btn btn-ghost" type="button" data-close>Cancel</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" type="button" data-save>Record</button>
    `
  });

  m.querySelector("[data-save]").onclick = async () => {
    const v = formData(m.querySelector('[data-form="exp"]'));
    if (!v.description?.trim()) return notify.err("Enter a description.");
    if (!Number(v.amount)) return notify.err("Enter an amount.");
    try {
      const ref = await api.nextReference("EXP", "expenses");
      await api.createExpense({
        tenant_id: api.state.profile.tenant_id,
        reference: ref,
        category: v.category,
        description: v.description.trim(),
        amount: Number(v.amount),
        incurred_on: v.incurred_on,
        payee: v.payee?.trim() || null,
        recorded_by: api.state.profile.id
      });
      closeModal();
      notify.ok(`Expense ${ref} recorded.`);
      await load();
      rerender();
    } catch (error) {
      notify.err(error.message);
    }
  };
}
