/**
 * Settings.
 *
 * Everything commercial lives here as data: fees, benefits, the revenue
 * split, the membership term. Repricing never overwrites — the old fee is
 * closed off and a new one opens, so historical invoices still reconcile.
 */

import { esc, html, formData } from "../lib/dom.js";
import { icon } from "../ui/icons.js";
import {
  panel,
  table,
  banner,
  badge,
  stat,
  notify,
  modal,
  closeModal,
  confirmDialog
} from "../ui/components.js";
import { money, date } from "../lib/format.js";
import * as api from "../lib/api.js";

let tab = "packages";
let packages = [];
let fees = [];
let benefits = new Map();
let districts = [];

const TABS = [
  { key: "packages", label: "Packages and fees" },
  { key: "split", label: "Revenue split" },
  { key: "general", label: "General" },
  { key: "districts", label: "Districts and areas" }
];

export async function load() {
  [packages, fees, districts] = await Promise.all([
    api.listPackages(),
    api.listPackageFees(),
    api.listDistricts()
  ]);
  benefits = new Map();
  await Promise.all(
    packages.map(async (p) => {
      benefits.set(p.id, await api.listPackageBenefits(p.id).catch(() => []));
    })
  );
}

function feeFor(pkgId, type) {
  const f = fees.find((x) => x.package_id === pkgId && x.fee_type === type);
  return f ? Number(f.amount) : 0;
}

export function render() {
  if (!api.isAdmin()) {
    return banner("danger", "Administrators only", "Settings can only be changed by a tenant administrator.");
  }
  return html`
    <div class="toolbar no-print">
      <div class="chips">
        ${TABS.map(
          (t) => `<button class="chip ${tab === t.key ? "active" : ""}" data-tab="${t.key}">${esc(t.label)}</button>`
        ).join("")}
      </div>
    </div>
    ${tab === "packages" ? packagesTab() : tab === "split" ? splitTab() : tab === "general" ? generalTab() : districtsTab()}
  `;
}

/* ---------------- Packages ---------------- */

function packagesTab() {
  const groups = [
    { title: "Motorist packages", rows: packages.filter((p) => p.operator_type === "motorist") },
    { title: "Pedalist packages", rows: packages.filter((p) => p.operator_type === "pedalist") },
    { title: "Owner packages", rows: packages.filter((p) => !p.operator_type) }
  ];

  return html`
    ${banner(
      "info",
      "Fees are versioned, never overwritten",
      "Changing a fee closes the current one and opens a new one from today, so past invoices still reconcile against the fee then in force."
    )}

    ${groups
      .map(
        (g) =>
          panel({
            title: g.title,
            tight: true,
            body: table({
              columns: [
                {
                  label: "Package",
                  render: (r) => html`
                    <div class="row-main">
                      <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${esc(
                        r.colour || "#ccc"
                      )};margin-right:7px"></span>${esc(r.name)}
                    </div>
                    <div class="row-sub">${esc(r.code)}</div>
                  `
                },
                { label: "Registration", align: "right", render: (r) => money(feeFor(r.id, "registration")) },
                { label: "Renewal", align: "right", render: (r) => money(feeFor(r.id, "renewal")) },
                { label: "Card", align: "right", render: (r) => money(feeFor(r.id, "card")) },
                {
                  label: "Benefits",
                  render: (r) => `${(benefits.get(r.id) || []).length} listed`
                },
                {
                  label: "",
                  align: "right",
                  className: "actions",
                  render: (r) => html`
                    <button class="btn btn-ghost btn-sm" data-benefits="${esc(r.id)}">Benefits</button>
                    <button class="btn btn-ghost btn-sm" data-reprice="${esc(r.id)}">${icon("money")} Reprice</button>
                  `
                }
              ],
              rows: g.rows,
              empty: "No packages in this group."
            })
          })
      )
      .join("")}
  `;
}

/* ---------------- Revenue split ---------------- */

function splitTab() {
  const split = api.setting("revenue_split", { macokasa: 0.8, quickthink: 0.2 });
  const mck = Math.round((split.macokasa || 0) * 100);
  const qts = Math.round((split.quickthink || 0) * 100);

  return panel({
    eyebrow: "Configuration",
    title: "Revenue split on membership and renewals",
    body: html`
      ${banner(
        "warn",
        "This changes how future money divides",
        "Existing ledger entries are never rewritten. The change applies from the moment you save it, and the previous value is kept in the settings history."
      )}

      <div class="split-bar" style="margin:16px 0 10px">
        <span class="mck" style="width:${mck}%"></span>
        <span class="qts" style="width:${qts}%"></span>
      </div>
      <div class="legend" style="margin-bottom:18px">
        <span><i style="background:var(--accent)"></i>MACOKASA ${mck}%</span>
        <span><i style="background:var(--brand-500)"></i>Quick-Think ${qts}%</span>
      </div>

      <div class="form-grid" data-form="split">
        <label class="field"><span>MACOKASA share (%)</span>
          <input class="input" type="number" name="macokasa" value="${mck}" min="0" max="100" step="1" data-split-input />
        </label>
        <label class="field"><span>Quick-Think share (%)</span>
          <input class="input" type="number" name="quickthink" value="${qts}" min="0" max="100" step="1" data-split-input />
        </label>
        <div class="field full">
          <p class="hint" data-split-total>Total: ${mck + qts}%</p>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" data-act="save-split">${icon("check")} Save split</button>
        </div>
      </div>

      <div class="divider"></div>
      <p class="label">Card and replacement fees are never split</p>
      <p class="hint">Only registration and renewal revenue divides. Card fees stay wholly with MACOKASA.</p>
    `
  });
}

/* ---------------- General ---------------- */

function generalTab() {
  const term = api.setting("membership_term_months", 12);
  const requirePhoto = api.setting("require_photo_on_registration", true);
  const selfConfirm = api.setting("allow_clerk_self_confirm_payment", false);

  return panel({
    eyebrow: "Configuration",
    title: "General settings",
    body: html`
      <div class="form-grid" data-form="general">
        <label class="field"><span>Membership term (months)</span>
          <input class="input" type="number" name="membership_term_months" value="${esc(term)}" min="1" max="60" />
          <span class="hint">How long a paid membership lasts.</span>
        </label>
        <div class="field">
          <span>Controls</span>
          <label class="switch" style="margin-top:8px">
            <input type="checkbox" name="require_photo_on_registration" ${requirePhoto ? "checked" : ""} />
            <span class="switch-track"></span>
            <span>Require a face photo before saving a member</span>
          </label>
          <label class="switch" style="margin-top:10px">
            <input type="checkbox" name="allow_clerk_self_confirm_payment" ${selfConfirm ? "checked" : ""} />
            <span class="switch-track"></span>
            <span>Allow a clerk to confirm their own collection</span>
          </label>
          <span class="hint" style="margin-top:6px">
            Leaving this off keeps collection and confirmation in different hands.
          </span>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" data-act="save-general">${icon("check")} Save settings</button>
        </div>
      </div>
    `
  });
}

/* ---------------- Districts ---------------- */

function districtsTab() {
  return panel({
    title: "Districts",
    tight: true,
    body: table({
      columns: [
        { label: "District", render: (r) => esc(r.name) },
        { label: "Code", render: (r) => badge(r.code, "blue") },
        { label: "Region", render: (r) => esc(r.region || "—") }
      ],
      rows: districts,
      empty: "No districts configured."
    })
  });
}

/* ---------------- Interaction ---------------- */

export function bind(root, rerender) {
  root.addEventListener("input", (e) => {
    if (!e.target.closest("[data-split-input]")) return;
    const form = root.querySelector('[data-form="split"]');
    const v = formData(form);
    const total = Number(v.macokasa || 0) + Number(v.quickthink || 0);
    const el = root.querySelector("[data-split-total]");
    el.textContent = `Total: ${total}%`;
    el.style.color = total === 100 ? "var(--accent-deep)" : "var(--red)";
  });

  root.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-tab]")?.dataset.tab;
    if (t) {
      tab = t;
      rerender();
      return;
    }

    if (e.target.closest('[data-act="save-split"]')) return saveSplit(root, rerender);
    if (e.target.closest('[data-act="save-general"]')) return saveGeneral(root, rerender);

    const repriceId = e.target.closest("[data-reprice]")?.dataset.reprice;
    if (repriceId) return reprice(repriceId, rerender);

    const benefitsId = e.target.closest("[data-benefits]")?.dataset.benefits;
    if (benefitsId) return manageBenefits(benefitsId, rerender);
  });
}

async function saveSplit(root, rerender) {
  const v = formData(root.querySelector('[data-form="split"]'));
  const mck = Number(v.macokasa);
  const qts = Number(v.quickthink);
  if (mck + qts !== 100) {
    notify.err("The two shares must total exactly 100%.");
    return;
  }
  const ok = await confirmDialog({
    title: "Change the revenue split?",
    message: `Future collections will divide ${mck}% to MACOKASA and ${qts}% to Quick-Think. Existing ledger entries are not affected.`,
    confirmLabel: "Save split"
  });
  if (!ok) return;
  try {
    await api.saveSetting(
      "revenue_split",
      { macokasa: mck / 100, quickthink: qts / 100 },
      "Share of membership and renewal revenue"
    );
    notify.ok("Revenue split updated.");
    rerender();
  } catch (error) {
    notify.err(error.message);
  }
}

async function saveGeneral(root, rerender) {
  const form = root.querySelector('[data-form="general"]');
  const v = formData(form);
  try {
    await api.saveSetting("membership_term_months", Number(v.membership_term_months || 12));
    await api.saveSetting(
      "require_photo_on_registration",
      Boolean(form.querySelector('[name="require_photo_on_registration"]').checked)
    );
    await api.saveSetting(
      "allow_clerk_self_confirm_payment",
      Boolean(form.querySelector('[name="allow_clerk_self_confirm_payment"]').checked)
    );
    notify.ok("Settings saved.");
    rerender();
  } catch (error) {
    notify.err(error.message);
  }
}

async function reprice(pkgId, rerender) {
  const pkg = packages.find((p) => p.id === pkgId);
  const m = modal({
    title: `Reprice — ${pkg.name}`,
    body: html`
      ${banner(
        "info",
        "The current fees close today",
        "New fees take effect from today. Anything already invoiced keeps the old price."
      )}
      <div class="form-grid" data-form="reprice">
        <label class="field"><span>Registration fee</span>
          <input class="input" type="number" name="registration" value="${feeFor(pkgId, "registration")}" min="0" step="100" />
        </label>
        <label class="field"><span>Renewal fee</span>
          <input class="input" type="number" name="renewal" value="${feeFor(pkgId, "renewal")}" min="0" step="100" />
        </label>
        <label class="field"><span>Card fee</span>
          <input class="input" type="number" name="card" value="${feeFor(pkgId, "card")}" min="0" step="100" />
        </label>
        <label class="field"><span>Replacement fee</span>
          <input class="input" type="number" name="replacement" value="${feeFor(pkgId, "replacement")}" min="0" step="100" />
        </label>
      </div>
    `,
    footer: html`
      <button class="btn btn-ghost" type="button" data-close>Cancel</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" type="button" data-save>Apply new fees</button>
    `
  });

  m.querySelector("[data-save]").onclick = async () => {
    const v = formData(m.querySelector('[data-form="reprice"]'));
    try {
      for (const type of ["registration", "renewal", "card", "replacement"]) {
        const amount = Number(v[type] || 0);
        if (amount === feeFor(pkgId, type)) continue;
        await api.repriceFee({
          tenantId: api.state.profile.tenant_id,
          packageId: pkgId,
          feeType: type,
          amount
        });
      }
      closeModal();
      notify.ok(`${pkg.name} repriced.`);
      await load();
      rerender();
    } catch (error) {
      notify.err(error.message);
    }
  };
}

async function manageBenefits(pkgId, rerender) {
  const pkg = packages.find((p) => p.id === pkgId);
  const list = benefits.get(pkgId) || [];

  const m = modal({
    title: `Benefits — ${pkg.name}`,
    body: html`
      <p class="hint" style="margin-top:0">
        Benefits are data, not code. Add them as they are agreed; they appear on the registration screen immediately.
      </p>
      <ul class="list-plain" data-benefit-list>
        ${
          list.length
            ? list
                .map(
                  (b) => html`
                    <li>
                      ${icon("check")}
                      <span>${esc(b.benefit)}${b.detail ? ` — ${esc(b.detail)}` : ""}</span>
                      <span class="spacer"></span>
                      <button class="btn btn-ghost btn-sm" data-del-benefit="${esc(b.id)}">${icon("trash")}</button>
                    </li>
                  `
                )
                .join("")
            : `<li class="row-sub">No benefits listed yet.</li>`
        }
      </ul>
      <div class="divider"></div>
      <div class="form-grid" data-form="benefit">
        <label class="field full"><span>New benefit</span>
          <input class="input" name="benefit" placeholder="e.g. Discounted ROSAF refresher training" />
        </label>
        <label class="field full"><span>Detail</span>
          <input class="input" name="detail" placeholder="Optional explanation" />
        </label>
        <div class="form-actions">
          <button class="btn btn-primary btn-sm" type="button" data-add-benefit>${icon("plus")} Add benefit</button>
        </div>
      </div>
    `
  });

  m.addEventListener("click", async (e) => {
    const delId = e.target.closest("[data-del-benefit]")?.dataset.delBenefit;
    if (delId) {
      try {
        await api.removeBenefit(delId);
        await load();
        closeModal();
        notify.ok("Benefit removed.");
        rerender();
      } catch (error) {
        notify.err(error.message);
      }
      return;
    }

    if (e.target.closest("[data-add-benefit]")) {
      const v = formData(m.querySelector('[data-form="benefit"]'));
      if (!v.benefit?.trim()) return notify.err("Enter the benefit.");
      try {
        await api.addBenefit({
          package_id: pkgId,
          benefit: v.benefit.trim(),
          detail: v.detail?.trim() || null,
          sort_order: (benefits.get(pkgId) || []).length + 1
        });
        await load();
        closeModal();
        notify.ok("Benefit added.");
        rerender();
      } catch (error) {
        notify.err(error.message);
      }
    }
  });
}
