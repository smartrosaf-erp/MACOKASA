/**
 * Card production.
 *
 * The queue is sorted by district, then area, then the clerk who filed
 * the member, so a print run comes off the machine already sorted for
 * dispatch. Printing is one-way: the database refuses a second print
 * unless operations has approved a reprint.
 */

import { esc, html, formData } from "../lib/dom.js";
import { icon } from "../ui/icons.js";
import {
  panel,
  table,
  banner,
  badge,
  statusBadge,
  typeBadge,
  notify,
  modal,
  closeModal,
  confirmDialog,
  stat,
  loading
} from "../ui/components.js";
import { money, date, dateTime, fullName } from "../lib/format.js";
import { cardPair, renderQrCodes } from "../ui/idcard.js";
import * as api from "../lib/api.js";

let queue = [];
let printed = [];
let grouping = "district";

export async function load() {
  [queue, printed] = await Promise.all([
    api.listPrintQueue(),
    api.listCards({ status: "printed", limit: 40 })
  ]);
}

function groupQueue() {
  const groups = new Map();
  for (const row of queue) {
    const key =
      grouping === "district"
        ? `${row.district || "No district"} · ${row.area || "No area"}`
        : row.clerk_name || "Unassigned clerk";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function render() {
  const groups = groupQueue();
  const motorists = queue.filter((q) => q.operator_type === "motorist").length;
  const pedalists = queue.filter((q) => q.operator_type === "pedalist").length;

  return html`
    <div class="grid" style="margin-bottom:16px">
      ${stat({ label: "Waiting to print", value: queue.length, tone: "stat-accent", span: 3 })}
      ${stat({ label: "Motorist cards", value: motorists, tone: "stat-motor", span: 3 })}
      ${stat({ label: "Pedalist cards", value: pedalists, tone: "stat-pedal", span: 3 })}
      ${stat({ label: "Printed recently", value: printed.length, span: 3 })}
    </div>

    <div class="toolbar no-print">
      <span class="label">Group by</span>
      <div class="chips">
        <button class="chip ${grouping === "district" ? "active" : ""}" data-group="district">District and area</button>
        <button class="chip ${grouping === "clerk" ? "active" : ""}" data-group="clerk">Filing clerk</button>
      </div>
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" data-act="refresh">${icon("refresh")} Refresh</button>
      ${
        queue.length
          ? `<button class="btn btn-dark btn-sm" data-act="print-sheet">${icon("printer")} Print all as sheet</button>`
          : ""
      }
    </div>

    ${
      queue.length === 0
        ? panel({
            title: "Print queue",
            body: html`<div class="empty">${icon("printer")}<strong>Nothing waiting to print</strong>
              <span>Cards appear here once finance confirms a member's payment.</span></div>`
          })
        : groups
            .map(
              ([label, items]) => html`
                <section class="panel" style="margin-bottom:16px">
                  <div class="panel-head">
                    <div>
                      <p class="eyebrow">${grouping === "district" ? "District · Area" : "Clerk"}</p>
                      <h2>${esc(label)}</h2>
                    </div>
                    <div class="panel-head-actions">
                      ${badge(`${items.length} card${items.length === 1 ? "" : "s"}`, "blue")}
                    </div>
                  </div>
                  <div class="panel-body tight">
                    ${table({
                      columns: [
                        {
                          label: "Member",
                          render: (r) => html`<div class="row-main">${esc(r.member_name)}</div>
                            <div class="row-sub">${esc(r.membership_no || "—")}</div>`
                        },
                        { label: "Card no.", render: (r) => esc(r.card_no) },
                        { label: "Type", render: (r) => typeBadge(r.operator_type) },
                        {
                          label: "Dispatch to",
                          render: (r) => esc(r.clerk_name || "Unassigned")
                        },
                        { label: "Status", render: (r) => statusBadge(r.status) },
                        {
                          label: "",
                          align: "right",
                          className: "actions",
                          render: (r) => html`
                            <button class="btn btn-ghost btn-sm" data-preview="${esc(r.card_id)}">Preview</button>
                            <button class="btn btn-primary btn-sm" data-print="${esc(r.card_id)}">
                              ${icon("printer")} Print
                            </button>
                          `
                        }
                      ],
                      rows: items.map((i) => ({ ...i, _id: i.card_id }))
                    })}
                  </div>
                </section>
              `
            )
            .join("")
    }

    ${panel({
      title: "Recently printed",
      tight: true,
      body: table({
        columns: [
          { label: "Card no.", render: (r) => esc(r.card_no) },
          { label: "Type", render: (r) => typeBadge(r.operator_type) },
          { label: "Status", render: (r) => statusBadge(r.status) },
          { label: "Prints", align: "right", render: (r) => String(r.print_count) },
          { label: "Printed", render: (r) => dateTime(r.printed_at) },
          {
            label: "",
            align: "right",
            className: "actions",
            render: (r) =>
              api.hasRole("platform_admin", "tenant_admin", "operations")
                ? `<button class="btn btn-ghost btn-sm" data-reprint="${esc(r.id)}">Approve reprint</button>`
                : `<span class="na">Reprint needs operations</span>`
          }
        ],
        rows: printed,
        empty: "No cards printed yet."
      })
    })}
  `;
}

export function bind(root, rerender) {
  root.addEventListener("click", async (e) => {
    const group = e.target.closest("[data-group]")?.dataset.group;
    if (group) {
      grouping = group;
      rerender();
      return;
    }

    if (e.target.closest('[data-act="refresh"]')) {
      await load();
      notify.info("Queue refreshed.");
      rerender();
      return;
    }

    if (e.target.closest('[data-act="print-sheet"]')) {
      window.print();
      return;
    }

    const previewId = e.target.closest("[data-preview]")?.dataset.preview;
    if (previewId) return preview(previewId);

    const printId = e.target.closest("[data-print]")?.dataset.print;
    if (printId) return doPrint(printId, rerender);

    const reprintId = e.target.closest("[data-reprint]")?.dataset.reprint;
    if (reprintId) return doReprint(reprintId, rerender);
  });
}

async function preview(cardId) {
  const row = queue.find((q) => q.card_id === cardId);
  const m = modal({ title: "Card preview", body: loading(), wide: true });
  try {
    const cards = await api.listCards({ limit: 200 });
    const card = cards.find((c) => c.id === cardId);
    const member = await api.getMember(card.member_id);
    const photoUrl = member.photo_path ? await api.signedPhotoUrl(member.photo_path) : "";
    m.querySelector(".modal-body").innerHTML = cardPair({
      member,
      card,
      packageName: row?.package_name,
      districtName: row?.district,
      photoUrl,
      verifyUrl: verifyLink(card.qr_token)
    });
    renderQrCodes(m);
  } catch (error) {
    m.querySelector(".modal-body").innerHTML = banner("danger", "Preview failed", error.message);
  }
}

async function doPrint(cardId, rerender) {
  const row = queue.find((q) => q.card_id === cardId);
  const ok = await confirmDialog({
    title: "Print this card?",
    message: `${row?.member_name || "This member"}'s card will be marked printed. A card can only be printed once — a further print needs approval from the operations manager.`,
    confirmLabel: "Print and lock"
  });
  if (!ok) return;

  try {
    await api.markCardPrinted(cardId);
    notify.ok("Card marked printed. The member and the filing clerk have been notified.");
    await load();
    rerender();
    window.setTimeout(() => window.print(), 200);
  } catch (error) {
    notify.err(error.message);
  }
}

async function doReprint(cardId, rerender) {
  const m = modal({
    title: "Approve a reprint",
    body: html`
      ${banner(
        "warn",
        "Reprints are audited",
        "Your name, the reason and the time are recorded permanently against this card."
      )}
      <div class="form-grid" data-form="reprint">
        <label class="field full"><span>Reason *</span>
          <select class="select" name="reason_kind">
            <option value="Damaged in production">Damaged in production</option>
            <option value="Lost by member">Lost by member</option>
            <option value="Stolen">Stolen</option>
            <option value="Details corrected">Details corrected</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label class="field full"><span>Detail</span>
          <textarea class="textarea" name="detail" placeholder="What happened?"></textarea>
        </label>
      </div>
    `,
    footer: html`
      <button class="btn btn-ghost" type="button" data-close>Cancel</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" type="button" data-approve">${icon("check")} Approve reprint</button>
    `
  });

  m.querySelector("[data-approve]").onclick = async () => {
    const v = formData(m.querySelector('[data-form="reprint"]'));
    const reason = [v.reason_kind, v.detail?.trim()].filter(Boolean).join(" — ");
    try {
      await api.approveReprint(cardId, reason);
      closeModal();
      notify.ok("Reprint approved. The card is back in the print queue.");
      await load();
      rerender();
    } catch (error) {
      notify.err(error.message);
    }
  };
}

function verifyLink(token) {
  const base =
    window.MACOKASA_CONFIG?.publicBaseUrl && window.MACOKASA_CONFIG.publicBaseUrl !== "__origin__"
      ? window.MACOKASA_CONFIG.publicBaseUrl
      : window.location.origin;
  return `${base}/?verify=${encodeURIComponent(token)}`;
}
