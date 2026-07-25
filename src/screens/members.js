/**
 * Member directory: search, filter, and the pending-payment path
 * where a clerk finds someone who has come back to pay.
 */

import { esc, html, debounce, formData } from "../lib/dom.js";
import { icon } from "../ui/icons.js";
import {
  panel,
  table,
  banner,
  badge,
  statusBadge,
  typeBadge,
  memberCell,
  notify,
  modal,
  closeModal,
  confirmDialog,
  selectOptions,
  loading
} from "../ui/components.js";
import { money, date, fullName, relativeDays } from "../lib/format.js";
import { cardPair, renderQrCodes } from "../ui/idcard.js";
import * as api from "../lib/api.js";

let filters = { term: "", status: "", districtId: "", operatorType: "" };
let rows = [];
let districts = [];
let packages = [];
let fees = [];
let busy = false;

export async function load() {
  if (!districts.length) {
    [districts, packages, fees] = await Promise.all([
      api.listDistricts(),
      api.listPackages(),
      api.listPackageFees()
    ]);
  }
  rows = await api.searchMembers(filters);
}

export function render() {
  return html`
    <div class="toolbar no-print">
      <div class="input-group">
        <input class="input search-input" data-search placeholder="Search name, membership number, phone or ID…"
          value="${esc(filters.term)}" aria-label="Search members" />
      </div>
      <select class="select" data-filter="status" aria-label="Status">
        <option value="">All statuses</option>
        ${["pending_payment", "active", "lapsed", "suspended", "draft"]
          .map(
            (s) =>
              `<option value="${s}" ${filters.status === s ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`
          )
          .join("")}
      </select>
      <select class="select" data-filter="operatorType" aria-label="Type">
        <option value="">All types</option>
        <option value="motorist" ${filters.operatorType === "motorist" ? "selected" : ""}>Motorist</option>
        <option value="pedalist" ${filters.operatorType === "pedalist" ? "selected" : ""}>Pedalist</option>
      </select>
      <select class="select" data-filter="districtId" aria-label="District">
        ${selectOptions(districts, filters.districtId, { placeholder: "All districts" })}
      </select>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" type="button" data-act="refresh">${icon("refresh")} Refresh</button>
    </div>

    ${
      filters.status === "pending_payment" && rows.length
        ? banner(
            "warn",
            `${rows.length} member${rows.length === 1 ? "" : "s"} awaiting payment`,
            "Select a member to record their payment. No card is prepared until finance confirms it."
          )
        : ""
    }

    ${panel({
      title: `Members${rows.length ? ` (${rows.length})` : ""}`,
      tight: true,
      body: table({
        columns: [
          { label: "Member", render: (r) => memberCell(r) },
          { label: "Type", render: (r) => typeBadge(r.operator_type) },
          {
            label: "Role",
            render: (r) =>
              [r.is_operator && "Operator", r.is_owner && "Owner"].filter(Boolean).join(" + ") || "—"
          },
          { label: "Phone", render: (r) => esc(r.phone) },
          {
            label: "District",
            render: (r) => esc(districts.find((d) => d.id === r.district_id)?.name || "—")
          },
          { label: "Status", render: (r) => statusBadge(r.status) },
          {
            label: "Expires",
            render: (r) => {
              if (!r.period_end) return `<span class="na">—</span>`;
              const days = relativeDays(r.period_end);
              const tone = days < 0 ? "red" : days < 30 ? "amber" : "grey";
              return `${date(r.period_end)}<br>${badge(
                days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`,
                tone
              )}`;
            }
          },
          {
            label: "",
            align: "right",
            className: "actions",
            render: (r) => html`
              ${
                r.status === "pending_payment"
                  ? `<button class="btn btn-primary btn-sm" data-pay="${esc(r.id)}">${icon("money")} Take payment</button>`
                  : ""
              }
              <button class="btn btn-ghost btn-sm" data-view="${esc(r.id)}">View</button>
            `
          }
        ],
        rows: rows.map((r) => ({ ...r, _id: r.id })),
        empty: filters.term ? "No members match that search." : "No members registered yet."
      })
    })}
  `;
}

export function bind(root, rerender) {
  const search = root.querySelector("[data-search]");
  if (search) {
    search.addEventListener(
      "input",
      debounce(async (e) => {
        filters.term = e.target.value;
        rows = await api.searchMembers(filters);
        rerender({ preserveFocus: "[data-search]" });
      }, 300)
    );
  }

  root.addEventListener("change", async (e) => {
    const f = e.target.closest("[data-filter]");
    if (!f) return;
    filters[f.dataset.filter] = f.value;
    rows = await api.searchMembers(filters);
    rerender();
  });

  root.addEventListener("click", async (e) => {
    if (e.target.closest('[data-act="refresh"]')) {
      rows = await api.searchMembers(filters);
      notify.info("Refreshed.");
      rerender();
      return;
    }

    const payId = e.target.closest("[data-pay]")?.dataset.pay;
    if (payId) return openPaymentModal(payId, rerender);

    const viewId = e.target.closest("[data-view]")?.dataset.view;
    if (viewId) return openMemberModal(viewId, rerender);
  });
}

/* ---------------- Payment ---------------- */

function feeFor(packageId, feeType) {
  const f = fees.find((x) => x.package_id === packageId && x.fee_type === feeType);
  return f ? Number(f.amount) : 0;
}

async function openPaymentModal(memberId, rerender) {
  const member = rows.find((r) => r.id === memberId) || (await api.getMember(memberId));
  const memberships = await api.listMemberships(memberId);
  const pending = memberships.find((m) => m.status === "pending_payment");

  if (!pending) {
    notify.err("No unpaid membership was found for this member.");
    return;
  }

  const total = Number(pending.fee_amount) + Number(pending.card_fee);

  const m = modal({
    title: `Take payment — ${fullName(member)}`,
    body: html`
      <dl class="kv" style="margin-bottom:16px">
        <dt>Membership no.</dt><dd>${esc(member.membership_no || "Issued on payment")}</dd>
        <dt>Package</dt><dd>${esc(packages.find((p) => p.id === pending.package_id)?.name || "—")}</dd>
        <dt>${pending.kind === "renewal" ? "Renewal" : "Registration"} fee</dt><dd>${money(pending.fee_amount)}</dd>
        <dt>Card fee</dt><dd>${money(pending.card_fee)}</dd>
        <dt style="font-weight:800;color:var(--ink)">Total</dt>
        <dd style="font-weight:800;font-size:1.05rem">${money(total)}</dd>
      </dl>

      <div class="form-grid" data-form="pay">
        <label class="field"><span>Method *</span>
          <select class="select" name="method" required>
            ${["cash", "airtel_money", "mpamba", "bank_transfer"]
              .map((x) => `<option value="${x}">${x.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>`)
              .join("")}
          </select>
        </label>
        <label class="field"><span>Amount *</span>
          <input class="input" type="number" name="amount" value="${total}" min="1" step="0.01" required />
        </label>
        <label class="field full"><span>Reference / receipt from the member</span>
          <input class="input" name="provider_ref" placeholder="Transaction ID or receipt book number" />
        </label>
      </div>

      ${banner(
        "info",
        "This enters your custody",
        "The amount is recorded against your name until you remit it and finance verifies the remittance."
      )}
    `,
    footer: html`
      <button class="btn btn-ghost" type="button" data-close>Cancel</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" type="button" data-save>${icon("money")} Record payment</button>
    `
  });

  m.querySelector("[data-save]").onclick = async () => {
    const values = formData(m.querySelector('[data-form="pay"]'));
    const amount = Number(values.amount);
    if (!amount || amount <= 0) return notify.err("Enter a valid amount.");

    if (amount < total) {
      const ok = await confirmDialog({
        title: "Part payment",
        message: `${money(amount)} is less than the ${money(total)} due. The membership stays unpaid until the full amount is received. Continue?`,
        confirmLabel: "Record part payment"
      });
      if (!ok) return;
    }

    try {
      const receiptNo = await api.nextReference("RCT", "payments");
      await api.createPayment({
        tenant_id: api.state.profile.tenant_id,
        receipt_no: receiptNo,
        member_id: memberId,
        membership_id: pending.id,
        purpose: pending.kind === "renewal" ? "renewal" : "registration",
        method: values.method,
        amount,
        collected_by: api.state.profile.id,
        status: "pending",
        provider_ref: values.provider_ref?.trim() || null,
        payer_phone: member.phone
      });
      closeModal();
      notify.ok(`Receipt ${receiptNo} recorded. Finance will confirm it and release the card.`);
      rows = await api.searchMembers(filters);
      rerender();
    } catch (error) {
      notify.err(error.message);
    }
  };
}

/* ---------------- Member detail ---------------- */

async function openMemberModal(memberId, rerender) {
  const m = modal({ title: "Member", body: loading(), wide: true });
  try {
    const [member, memberships, cards] = await Promise.all([
      api.getMember(memberId),
      api.listMemberships(memberId),
      api.listCards({ memberId })
    ]);
    const photoUrl = member.photo_path ? await api.signedPhotoUrl(member.photo_path) : "";
    const district = districts.find((d) => d.id === member.district_id);
    const pkg = packages.find((p) => p.id === member.package_id);
    const card = cards[0];
    const pedal = member.operator_type === "pedalist";

    m.querySelector(".modal-head h2").textContent = fullName(member);
    m.querySelector(".modal-body").innerHTML = html`
      <div class="grid" style="gap:16px">
        <div class="col-7">
          <dl class="review">
            <div class="review-group">Identity</div>
            <div class="review-row"><dt>Membership no.</dt><dd>${esc(member.membership_no || "Not yet issued")}</dd></div>
            <div class="review-row"><dt>Type</dt><dd>${typeBadge(member.operator_type)}</dd></div>
            <div class="review-row"><dt>Role</dt><dd>${esc(
              [member.is_operator && "Operator", member.is_owner && "Owner"].filter(Boolean).join(" + ") || "—"
            )}</dd></div>
            <div class="review-row"><dt>Status</dt><dd>${statusBadge(member.status)}</dd></div>
            <div class="review-row"><dt>Phone</dt><dd>${esc(member.phone)}</dd></div>
            <div class="review-row"><dt>National ID</dt><dd>${esc(member.national_id || "—")}</dd></div>
            <div class="review-row"><dt>District</dt><dd>${esc(district?.name || "—")}</dd></div>
            <div class="review-row"><dt>Package</dt><dd>${esc(pkg?.name || "—")}</dd></div>
            <div class="review-row"><dt>Period</dt><dd>${
              member.period_start ? `${date(member.period_start)} → ${date(member.period_end)}` : "Not started"
            }</dd></div>
            <div class="review-row"><dt>${pedal ? "Trained" : "Licensed"}</dt><dd>${
              member.has_licence ? badge("Yes", "green") : badge("No", "amber")
            }</dd></div>
            <div class="review-row"><dt>Next of kin</dt><dd>${esc(member.kin_name || "—")}${
              member.kin_phone ? ` · ${esc(member.kin_phone)}` : ""
            }</dd></div>
          </dl>

          <div class="review-group">Memberships</div>
          ${table({
            columns: [
              { label: "Kind", render: (r) => esc(r.kind) },
              { label: "Period", render: (r) => `${date(r.period_start)} → ${date(r.period_end)}` },
              { label: "Fee", align: "right", render: (r) => money(Number(r.fee_amount) + Number(r.card_fee)) },
              { label: "Status", render: (r) => statusBadge(r.status) }
            ],
            rows: memberships,
            empty: "No membership periods."
          })}

          <div class="review-group">Cards</div>
          ${table({
            columns: [
              { label: "Card no.", render: (r) => esc(r.card_no) },
              { label: "Status", render: (r) => statusBadge(r.status) },
              { label: "Prints", align: "right", render: (r) => String(r.print_count) },
              { label: "Printed", render: (r) => (r.printed_at ? date(r.printed_at) : "—") }
            ],
            rows: cards,
            empty: "No card issued yet."
          })}
        </div>

        <div class="col-5">
          ${cardPair({
            member: { ...member, _vehicle_id: "" },
            card,
            packageName: pkg?.name,
            districtName: district?.name,
            photoUrl,
            verifyUrl: card ? verifyLink(card.qr_token) : ""
          })}
        </div>
      </div>
    `;
    renderQrCodes(m);
  } catch (error) {
    m.querySelector(".modal-body").innerHTML = banner("danger", "Could not load member", error.message);
  }
}

function verifyLink(token) {
  const base =
    window.MACOKASA_CONFIG?.publicBaseUrl && window.MACOKASA_CONFIG.publicBaseUrl !== "__origin__"
      ? window.MACOKASA_CONFIG.publicBaseUrl
      : window.location.origin;
  return `${base}/?verify=${encodeURIComponent(token)}`;
}
