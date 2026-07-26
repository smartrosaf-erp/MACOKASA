import { esc, html, $ } from "../lib/dom.js";
import { icon } from "./icons.js";
import { money, date, fullName, initials } from "../lib/format.js";

/* ---------------- Toast ---------------- */

let toastHost = null;

function ensureToastHost() {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.className = "toasts";
    toastHost.setAttribute("role", "status");
    toastHost.setAttribute("aria-live", "polite");
    document.body.appendChild(toastHost);
  }
  return toastHost;
}

export function toast(message, kind = "info", ms = 4200) {
  const host = ensureToastHost();
  const el = document.createElement("div");
  el.className = `toast ${kind === "success" ? "ok" : kind === "error" ? "err" : kind === "warning" ? "warn" : ""}`;
  const glyph =
    kind === "success" ? "checkCircle" : kind === "error" ? "xCircle" : kind === "warning" ? "alert" : "info";
  el.innerHTML = `${icon(glyph)}<span>${esc(message)}</span><button type="button" aria-label="Dismiss">${icon("x")}</button>`;
  el.querySelector("button").onclick = () => el.remove();
  host.appendChild(el);
  if (ms) window.setTimeout(() => el.remove(), ms);
  return el;
}

export const notify = {
  ok: (m) => toast(m, "success"),
  err: (m) => toast(m, "error", 7000),
  warn: (m) => toast(m, "warning", 6000),
  info: (m) => toast(m, "info")
};

/* ---------------- Modal ---------------- */

let openModal = null;

export function modal({ title, body, footer, wide = false, onMount } = {}) {
  closeModal();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = html`
    <div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <h2>${esc(title)}</h2>
        <button class="btn btn-icon btn-ghost" type="button" data-close aria-label="Close">${icon("x")}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
    </div>
  `;
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop || e.target.closest("[data-close]")) closeModal();
  });
  document.body.appendChild(backdrop);
  document.body.style.overflow = "hidden";
  openModal = backdrop;

  const escHandler = (e) => {
    if (e.key === "Escape") closeModal();
  };
  document.addEventListener("keydown", escHandler);
  backdrop._esc = escHandler;

  // Focus the first sensible control.
  window.requestAnimationFrame(() => {
    const target = backdrop.querySelector("input, select, textarea, button:not([data-close])");
    target?.focus();
    onMount?.(backdrop);
  });
  return backdrop;
}

export function closeModal() {
  if (!openModal) return;
  if (openModal._esc) document.removeEventListener("keydown", openModal._esc);
  openModal.remove();
  openModal = null;
  document.body.style.overflow = "";
}

export function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const m = modal({
      title,
      body: `<p style="margin:0;color:var(--ink-2)">${esc(message)}</p>`,
      footer: html`
        <button class="btn btn-ghost" type="button" data-close>Cancel</button>
        <span class="spacer"></span>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" type="button" data-ok>
          ${esc(confirmLabel)}
        </button>
      `
    });
    m.querySelector("[data-ok]").onclick = () => {
      closeModal();
      resolve(true);
    };
    m.addEventListener("click", (e) => {
      if (e.target === m || e.target.closest("[data-close]")) resolve(false);
    });
  });
}

/* ---------------- Building blocks ---------------- */

export function panel({ eyebrow, title, actions, body, tight = false, span = 12 }) {
  return html`
    <section class="panel col-${span}">
      ${
        title
          ? html`<div class="panel-head">
              <div>
                ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ""}
                <h2>${esc(title)}</h2>
              </div>
              ${actions ? `<div class="panel-head-actions">${actions}</div>` : ""}
            </div>`
          : ""
      }
      <div class="panel-body ${tight ? "tight" : ""}">${body}</div>
    </section>
  `;
}

export function stat({ label, value, note, tone = "", span = 3 }) {
  return html`
    <div class="stat ${tone} col-${span}">
      <span class="stat-label">${esc(label)}</span>
      <span class="stat-value">${value}</span>
      ${note ? `<span class="stat-note">${note}</span>` : ""}
    </div>
  `;
}

export function badge(text, tone = "grey", glyph = "") {
  return `<span class="badge badge-${tone}">${glyph ? icon(glyph) : ""}${esc(text)}</span>`;
}

export function typeBadge(operatorType) {
  return operatorType === "pedalist"
    ? badge("Pedalist", "pedal", "bicycle")
    : badge("Motorist", "motor", "motorcycle");
}

const STATUS_TONES = {
  draft: "grey",
  pending_payment: "amber",
  active: "green",
  lapsed: "red",
  suspended: "red",
  deceased: "grey",
  awaiting_payment: "amber",
  ready_for_print: "blue",
  queued: "blue",
  printing: "blue",
  printed: "green",
  dispatched: "green",
  collected: "green",
  reprint_requested: "amber",
  void: "grey",
  pending: "amber",
  confirmed: "green",
  reversed: "red",
  failed: "red",
  held: "amber",
  remitted: "blue",
  reconciled: "green",
  submitted: "amber",
  verified: "green",
  cleared: "green",
  disputed: "red",
  requested: "amber",
  approved: "blue",
  paid: "green",
  rejected: "red",
  cancelled: "grey",
  recorded: "grey"
};

export function statusBadge(status) {
  const label = String(status || "").replace(/_/g, " ");
  return badge(label, STATUS_TONES[status] || "grey");
}

export function table({ columns, rows, empty = "Nothing here yet.", emptyIcon = "inbox" }) {
  if (!rows || !rows.length) {
    return html`
      <div class="empty">
        ${icon(emptyIcon)}
        <strong>${esc(empty)}</strong>
      </div>
    `;
  }
  return html`
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            ${columns.map((c) => `<th class="${c.align === "right" ? "num" : ""}">${esc(c.label)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr${r._id ? ` data-row-id="${esc(r._id)}"` : ""}>${columns
                .map((c) => `<td class="${c.align === "right" ? "num" : ""}${c.className ? ` ${c.className}` : ""}">${
                  c.render ? c.render(r) : esc(r[c.key])
                }</td>`)
                .join("")}</tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function banner(kind, title, message, extra = "") {
  const glyph = kind === "danger" ? "alert" : kind === "warn" ? "alert" : kind === "ok" ? "checkCircle" : "info";
  return html`
    <div class="banner banner-${kind}">
      ${icon(glyph)}
      <div>
        <strong>${esc(title)}</strong>
        <span>${esc(message)}</span>
        ${extra}
      </div>
    </div>
  `;
}

export function loading(label = "Loading…") {
  return `<div class="loading"><div class="spinner"></div><span>${esc(label)}</span></div>`;
}

export function memberCell(member) {
  return html`
    <div class="row-main">${esc(fullName(member))}</div>
    <div class="row-sub">${esc(member.membership_no || "Not yet issued")}</div>
  `;
}

export function selectOptions(items, selected, { valueKey = "id", labelKey = "name", placeholder } = {}) {
  const opts = items
    .map(
      (i) =>
        `<option value="${esc(i[valueKey])}"${String(i[valueKey]) === String(selected) ? " selected" : ""}>${esc(
          i[labelKey]
        )}</option>`
    )
    .join("");
  return (placeholder ? `<option value="">${esc(placeholder)}</option>` : "") + opts;
}

export { money, date, fullName, initials };
