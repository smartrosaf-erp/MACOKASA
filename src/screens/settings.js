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
import * as tenant from "../lib/tenant.js";

let tab = "packages";
let packages = [];
let fees = [];
let benefits = new Map();
let districts = [];
let terminology = [];
let fieldConfig = [];
let customFields = [];
let workflows = [];

const TABS = [
  { key: "packages", label: "Packages and fees" },
  { key: "split", label: "Revenue split" },
  { key: "branding", label: "Branding" },
  { key: "terminology", label: "Terminology" },
  { key: "fields", label: "Fields" },
  { key: "workflow", label: "Workflow" },
  { key: "general", label: "General" },
  { key: "districts", label: "Districts and areas" }
];

/* Core fields an administrator may show, hide or require. */
const CONFIGURABLE_FIELDS = [
  ["national_id", "National ID"],
  ["date_of_birth", "Date of birth"],
  ["email", "Email"],
  ["alt_phone", "Alternative phone"],
  ["physical_address", "Address or landmark"],
  ["kin_name", "Next of kin name"],
  ["kin_phone", "Next of kin phone"],
  ["kin_relationship", "Next of kin relationship"]
];

/* Words the interface asks for by key. */
const TERM_KEYS = [
  ["member", "The people you register"],
  ["operator", "Someone who rides"],
  ["owner", "Someone who owns and hires out"],
  ["vehicle", "What is ridden"],
  ["card", "The identity document issued"],
  ["area", "The place they work from"],
  ["district", "The larger administrative area"],
  ["package", "A membership tier"],
  ["organisation", "What you call yourselves"]
];

export async function load() {
  [packages, fees, districts, terminology, fieldConfig, customFields, workflows] = await Promise.all([
    api.listPackages(),
    api.listPackageFees(),
    api.listDistricts(),
    api.listTerminology().catch(() => []),
    api.listFieldConfig("member").catch(() => []),
    api.listCustomFields("member").catch(() => []),
    api.listWorkflows().catch(() => [])
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
    ${
      tab === "packages" ? packagesTab()
      : tab === "split" ? splitTab()
      : tab === "branding" ? brandingTab()
      : tab === "terminology" ? terminologyTab()
      : tab === "fields" ? fieldsTab()
      : tab === "workflow" ? workflowTab()
      : tab === "general" ? generalTab()
      : districtsTab()
    }
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
        <span><i style="background:var(--green)"></i>MACOKASA ${mck}%</span>
        <span><i style="background:var(--gold)"></i>Quick-Think ${qts}%</span>
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

/* ---------------- Branding ---------------- */

function brandingTab() {
  const b = tenant.brandAll();
  return html`
    ${banner(
      "info",
      "This is how white-label works",
      "Colours and names are stored against your organisation, not written into the code. Changing them here changes the whole system immediately."
    )}

    <div class="grid">
      ${panel({
        span: 7,
        eyebrow: "Identity",
        title: "Names and colours",
        body: html`
          <div class="form-grid" data-form="branding">
            <label class="field"><span>Display name</span>
              <input class="input" name="displayName" value="${esc(b.displayName)}" />
              <span class="hint">Shown in the sidebar and on documents.</span>
            </label>
            <label class="field"><span>Short name</span>
              <input class="input" name="shortName" value="${esc(b.shortName)}" />
            </label>
            <label class="field full"><span>Tagline</span>
              <input class="input" name="tagline" value="${esc(b.tagline)}" />
            </label>
            <label class="field"><span>Primary colour</span>
              <div class="input-group">
                <input class="input" name="primary" value="${esc(b.primary)}" data-colour />
                <input type="color" class="colour-well" value="${esc(b.primary)}" data-colour-for="primary" aria-label="Pick primary colour" />
              </div>
              <span class="hint">Buttons, confirmations, success.</span>
            </label>
            <label class="field"><span>Accent colour</span>
              <div class="input-group">
                <input class="input" name="accent" value="${esc(b.accent)}" data-colour />
                <input type="color" class="colour-well" value="${esc(b.accent)}" data-colour-for="accent" aria-label="Pick accent colour" />
              </div>
              <span class="hint">Highlights and markers.</span>
            </label>
            <label class="field"><span>Dark colour</span>
              <div class="input-group">
                <input class="input" name="ink" value="${esc(b.ink)}" data-colour />
                <input type="color" class="colour-well" value="${esc(b.ink)}" data-colour-for="ink" aria-label="Pick dark colour" />
              </div>
              <span class="hint">Sidebar and headings.</span>
            </label>
            <label class="field full"><span>Logo path</span>
              <input class="input" name="logoUrl" value="${esc(b.logoUrl)}" />
            </label>
            <div class="form-actions">
              <button class="btn btn-ghost" data-act="preview-branding">Preview</button>
              <span class="spacer"></span>
              <button class="btn btn-primary" data-act="save-branding">${icon("check")} Save branding</button>
            </div>
          </div>
        `
      })}

      ${panel({
        span: 5,
        eyebrow: "Preview",
        title: "How it looks",
        body: html`
          <div class="brand-preview" data-brand-preview>
            <div class="bp-bar"><span class="bp-dot"></span><strong>${esc(b.displayName)}</strong></div>
            <div class="bp-body">
              <span class="bp-eyebrow">${esc(b.tagline || "Tagline")}</span>
              <div class="bp-buttons">
                <span class="bp-btn primary">Primary action</span>
                <span class="bp-btn ghost">Secondary</span>
              </div>
              <div class="bp-swatches">
                <span data-swatch="primary" style="background:${esc(b.primary)}"></span>
                <span data-swatch="accent" style="background:${esc(b.accent)}"></span>
                <span data-swatch="ink" style="background:${esc(b.ink)}"></span>
              </div>
            </div>
          </div>
          <p class="side-note" style="margin-top:14px">
            Preview applies the colours live. Nothing is stored until you save.
          </p>
        `
      })}
    </div>
  `;
}

/* ---------------- Terminology ---------------- */

function terminologyTab() {
  const byKey = new Map(terminology.map((t) => [t.term_key, t]));
  return html`
    ${banner(
      "info",
      "Your words, not ours",
      "The system asks for a concept and prints your word for it. A cooperative might say associate; a school, student."
    )}
    ${panel({
      title: "Vocabulary",
      tight: true,
      body: table({
        columns: [
          {
            label: "Concept",
            render: (r) => html`<div class="row-main">${esc(r.key)}</div><div class="row-sub">${esc(r.hint)}</div>`
          },
          {
            label: "Singular",
            render: (r) => `<input class="input input-inline" data-term="${esc(r.key)}" data-part="singular"
              value="${esc(byKey.get(r.key)?.singular || "")}" placeholder="${esc(r.key)}" />`
          },
          {
            label: "Plural",
            render: (r) => `<input class="input input-inline" data-term="${esc(r.key)}" data-part="plural"
              value="${esc(byKey.get(r.key)?.plural || "")}" placeholder="${esc(r.key)}s" />`
          }
        ],
        rows: TERM_KEYS.map(([key, hint]) => ({ key, hint, _id: key }))
      })
    })}
    <div class="form-actions" style="margin-top:16px">
      <span class="spacer"></span>
      <button class="btn btn-primary" data-act="save-terms">${icon("check")} Save vocabulary</button>
    </div>
  `;
}

/* ---------------- Fields ---------------- */

function fieldsTab() {
  const byKey = new Map(fieldConfig.map((f) => [f.field_key, f]));
  const active = customFields.filter((c) => c.is_active !== false);

  return html`
    ${banner(
      "info",
      "Collect what you need, and nothing more",
      "Hide fields you do not use, require the ones you must have, and add your own. No developer involved."
    )}

    ${panel({
      title: "Standard fields",
      tight: true,
      body: table({
        columns: [
          { label: "Field", render: (r) => `<div class="row-main">${esc(r.label)}</div>` },
          {
            label: "Requirement",
            render: (r) => {
              const current = byKey.get(r.key)?.visibility || "optional";
              return `<select class="select select-inline" data-fieldcfg="${esc(r.key)}">
                ${["hidden", "optional", "required", "readonly"]
                  .map((v) => `<option value="${v}" ${current === v ? "selected" : ""}>${v}</option>`)
                  .join("")}
              </select>`;
            }
          },
          {
            label: "Label shown",
            render: (r) => `<input class="input input-inline" data-fieldlabel="${esc(r.key)}"
              value="${esc(byKey.get(r.key)?.label || "")}" placeholder="${esc(r.label)}" />`
          }
        ],
        rows: CONFIGURABLE_FIELDS.map(([key, label]) => ({ key, label, _id: key }))
      })
    })}

    <div class="form-actions" style="margin:16px 0 28px">
      <span class="spacer"></span>
      <button class="btn btn-primary" data-act="save-fields">${icon("check")} Save field settings</button>
    </div>

    ${panel({
      title: `Your own fields${active.length ? ` (${active.length})` : ""}`,
      actions: `<button class="btn btn-primary btn-sm" data-act="new-custom-field">${icon("plus")} Add a field</button>`,
      tight: true,
      body: table({
        columns: [
          {
            label: "Field",
            render: (r) => html`<div class="row-main">${esc(r.label)}</div>
              <div class="row-sub"><code>${esc(r.field_key)}</code></div>`
          },
          { label: "Type", render: (r) => badge(String(r.data_type).replace(/_/g, " "), "blue") },
          { label: "Required", render: (r) => (r.required ? badge("Required", "amber") : badge("Optional", "grey")) },
          {
            label: "Options",
            render: (r) =>
              Array.isArray(r.options) && r.options.length
                ? esc(r.options.join(", "))
                : `<span class="na">—</span>`
          },
          {
            label: "",
            align: "right",
            className: "actions",
            render: (r) => `<button class="btn btn-ghost btn-sm" data-retire-field="${esc(r.id)}">Retire</button>`
          }
        ],
        rows: active.map((c) => ({ ...c, _id: c.id })),
        empty: "No custom fields yet. Add one to collect something the system does not already ask for."
      })
    })}
  `;
}

/* ---------------- Workflow ---------------- */

function workflowTab() {
  const byKey = new Map(workflows.map((w) => [w.process_key, w.config || {}]));
  const pay = byKey.get("payment_confirmation") || {};
  const card = byKey.get("card_printing") || {};
  const rem = byKey.get("remittance") || {};

  return html`
    ${banner(
      "warn",
      "These rules protect your money",
      "Relaxing them is allowed but recorded. Every change is written to the configuration history with your name against it."
    )}

    <div class="grid">
      ${panel({
        span: 6,
        eyebrow: "Payments",
        title: "Confirming a collection",
        body: html`
          <div class="form-grid" data-form="wf-payment">
            <label class="field full">
              <label class="switch">
                <input type="checkbox" name="allowSelfConfirm" ${pay.allowSelfConfirm ? "checked" : ""} />
                <span class="switch-track"></span>
                <span>A clerk may confirm a payment they collected</span>
              </label>
              <span class="hint">Leave off to keep collection and confirmation in different hands.</span>
            </label>
            <label class="field full">
              <label class="switch">
                <input type="checkbox" name="requiresSecondApproval" ${pay.requiresSecondApproval ? "checked" : ""} />
                <span class="switch-track"></span>
                <span>Large payments need a second approval</span>
              </label>
            </label>
            <label class="field full"><span>Second approval above (MWK)</span>
              <input class="input" type="number" name="thresholdAmount" min="0" step="1000"
                value="${esc(pay.thresholdAmount ?? 0)}" />
            </label>
          </div>
        `
      })}

      ${panel({
        span: 6,
        eyebrow: "Cards",
        title: "Producing a card",
        body: html`
          <div class="form-grid" data-form="wf-card">
            <label class="field full">
              <label class="switch">
                <input type="checkbox" name="printOnce" ${card.printOnce !== false ? "checked" : ""} />
                <span class="switch-track"></span>
                <span>A card may only be printed once</span>
              </label>
              <span class="hint">Turning this off is not recommended.</span>
            </label>
            <label class="field full"><span>Who may authorise a reprint</span>
              <select class="select" name="reprintRole">
                ${["operations", "tenant_admin", "finance"]
                  .map((r) => `<option value="${r}" ${(card.reprintRole || "operations") === r ? "selected" : ""}>${r.replace(/_/g, " ")}</option>`)
                  .join("")}
              </select>
            </label>
            <label class="field full"><span>Sort the print queue by</span>
              <select class="select" name="sortBy">
                <option value="district_area_clerk" ${(card.sortBy || "district_area_clerk") === "district_area_clerk" ? "selected" : ""}>District, area, then clerk</option>
                <option value="clerk" ${card.sortBy === "clerk" ? "selected" : ""}>Filing clerk</option>
                <option value="created" ${card.sortBy === "created" ? "selected" : ""}>Order registered</option>
              </select>
            </label>
          </div>
        `
      })}

      ${panel({
        span: 6,
        eyebrow: "Remittances",
        title: "Clearing a clerk",
        body: html`
          <div class="form-grid" data-form="wf-remittance">
            <label class="field full">
              <label class="switch">
                <input type="checkbox" name="allowSelfVerify" ${rem.allowSelfVerify ? "checked" : ""} />
                <span class="switch-track"></span>
                <span>A clerk may verify their own remittance</span>
              </label>
              <span class="hint">Leave off so a second person always checks the money.</span>
            </label>
            <label class="field full"><span>Variance tolerated without query (MWK)</span>
              <input class="input" type="number" name="varianceToleranceAmount" min="0" step="100"
                value="${esc(rem.varianceToleranceAmount ?? 0)}" />
            </label>
          </div>
        `
      })}
    </div>

    <div class="form-actions" style="margin-top:16px">
      <span class="spacer"></span>
      <button class="btn btn-primary" data-act="save-workflow">${icon("check")} Save workflow rules</button>
    </div>
  `;
}

/* ---------------- Interaction ---------------- */

export function bind(root, rerender) {
  root.addEventListener("input", (e) => {
    const well = e.target.closest("[data-colour-for]");
    if (well) {
      const field = root.querySelector(`[name="${well.dataset.colourFor}"]`);
      if (field) field.value = well.value;
      previewBranding(root);
      return;
    }
    if (e.target.closest("[data-colour]")) {
      previewBranding(root);
      return;
    }
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
    if (e.target.closest('[data-act="preview-branding"]')) return previewBranding(root);
    if (e.target.closest('[data-act="save-branding"]')) return saveBranding(root, rerender);
    if (e.target.closest('[data-act="save-terms"]')) return saveTerms(root, rerender);
    if (e.target.closest('[data-act="save-fields"]')) return saveFields(root, rerender);
    if (e.target.closest('[data-act="save-workflow"]')) return saveWorkflow(root, rerender);
    if (e.target.closest('[data-act="new-custom-field"]')) return newCustomField(rerender);

    const retire = e.target.closest("[data-retire-field]")?.dataset.retireField;
    if (retire) return retireField(retire, rerender);
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


/* ---------------- Branding handlers ---------------- */

function brandingFromForm(root) {
  const v = formData(root.querySelector('[data-form="branding"]'));
  return {
    displayName: v.displayName?.trim() || "",
    shortName: v.shortName?.trim() || "",
    tagline: v.tagline?.trim() || "",
    logoUrl: v.logoUrl?.trim() || "",
    primary: v.primary?.trim() || "",
    accent: v.accent?.trim() || "",
    ink: v.ink?.trim() || ""
  };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function previewBranding(root) {
  const b = brandingFromForm(root);
  for (const key of ["primary", "accent", "ink"]) {
    if (!HEX.test(b[key])) continue;
    const swatch = root.querySelector(`[data-swatch="${key}"]`);
    if (swatch) swatch.style.background = b[key];
  }
  // Apply live so the whole interface shows the change.
  tenant.applyBranding({ ...api.state.tenant, branding: b });
  const nameEl = root.querySelector(".bp-bar strong");
  if (nameEl) nameEl.textContent = b.displayName || "Organisation";
  const tagEl = root.querySelector(".bp-eyebrow");
  if (tagEl) tagEl.textContent = b.tagline || "Tagline";
}

async function saveBranding(root, rerender) {
  const b = brandingFromForm(root);
  for (const key of ["primary", "accent", "ink"]) {
    if (b[key] && !HEX.test(b[key])) {
      notify.err(`${key} must be a six digit hex colour, for example #0a5236.`);
      return;
    }
  }
  if (!b.displayName) return notify.err("A display name is required.");
  try {
    await api.saveBranding(b);
    await api.refreshTailoring();
    notify.ok("Branding saved. It applies everywhere immediately.");
    rerender();
  } catch (error) {
    notify.err(error.message);
  }
}

/* ---------------- Terminology handlers ---------------- */

async function saveTerms(root, rerender) {
  const rows = new Map();
  root.querySelectorAll("[data-term]").forEach((el) => {
    const key = el.dataset.term;
    if (!rows.has(key)) rows.set(key, {});
    rows.get(key)[el.dataset.part] = el.value.trim();
  });

  try {
    for (const [termKey, parts] of rows) {
      const singular = parts.singular;
      const plural = parts.plural || (singular ? `${singular}s` : "");
      // Blank means "use the default", so skip rather than storing empties.
      if (!singular) continue;
      await api.saveTerm({ termKey, singular, plural });
    }
    await api.refreshTailoring();
    terminology = await api.listTerminology();
    notify.ok("Vocabulary saved.");
    rerender();
  } catch (error) {
    notify.err(error.message);
  }
}

/* ---------------- Field handlers ---------------- */

async function saveFields(root, rerender) {
  try {
    for (const [key, fallback] of CONFIGURABLE_FIELDS) {
      const visibility = root.querySelector(`[data-fieldcfg="${key}"]`)?.value;
      const label = root.querySelector(`[data-fieldlabel="${key}"]`)?.value.trim();
      if (!visibility) continue;
      await api.saveFieldConfig({
        entity: "member",
        fieldKey: key,
        visibility,
        label: label || fallback,
        helpText: null,
        sortOrder: 0
      });
    }
    await api.refreshTailoring();
    fieldConfig = await api.listFieldConfig("member");
    notify.ok("Field settings saved. The registration form follows them now.");
    rerender();
  } catch (error) {
    notify.err(error.message);
  }
}

async function newCustomField(rerender) {
  const m = modal({
    title: "Add a field",
    body: html`
      <p class="hint" style="margin-top:0">
        This appears on the registration form and against every member record.
      </p>
      <div class="form-grid" data-form="cf">
        <label class="field full"><span>Label shown to the clerk *</span>
          <input class="input" name="label" placeholder="For example, SACCO branch" />
        </label>
        <label class="field"><span>Type</span>
          <select class="select" name="data_type">
            ${["text", "number", "date", "boolean", "select", "phone", "email"]
              .map((t) => `<option value="${t}">${t}</option>`)
              .join("")}
          </select>
        </label>
        <label class="field"><span>Required</span>
          <label class="switch" style="margin-top:10px">
            <input type="checkbox" name="required" />
            <span class="switch-track"></span><span>Must be filled in</span>
          </label>
        </label>
        <label class="field full" data-options-row hidden><span>Options, one per line</span>
          <textarea class="textarea" name="options" placeholder="Blantyre&#10;Lilongwe&#10;Mzuzu"></textarea>
        </label>
        <label class="field full"><span>Help text</span>
          <input class="input" name="help_text" />
        </label>
      </div>
    `,
    footer: html`
      <button class="btn btn-ghost" type="button" data-close>Cancel</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" type="button" data-save>Add field</button>
    `
  });

  m.querySelector('[name="data_type"]').addEventListener("change", (e) => {
    m.querySelector("[data-options-row]").hidden = e.target.value !== "select";
  });

  m.querySelector("[data-save]").onclick = async () => {
    const v = formData(m.querySelector('[data-form="cf"]'));
    const label = v.label?.trim();
    if (!label) return notify.err("Give the field a label.");

    // Derive a stable key from the label; the database constrains its shape.
    const fieldKey = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(fieldKey)) {
      return notify.err("That label cannot be turned into a field name. Use letters and numbers.");
    }
    if (customFields.some((c) => c.field_key === fieldKey && c.is_active !== false)) {
      return notify.err("A field with that name already exists.");
    }

    const options =
      v.data_type === "select"
        ? String(v.options || "").split("\n").map((o) => o.trim()).filter(Boolean)
        : [];
    if (v.data_type === "select" && !options.length) {
      return notify.err("A select field needs at least one option.");
    }

    try {
      await api.createCustomField({
        entity: "member",
        field_key: fieldKey,
        label,
        help_text: v.help_text?.trim() || null,
        data_type: v.data_type,
        options,
        required: Boolean(v.required),
        sort_order: customFields.length + 1
      });
      await api.refreshTailoring();
      customFields = await api.listCustomFields("member");
      closeModal();
      notify.ok(`"${label}" added. It is on the registration form now.`);
      rerender();
    } catch (error) {
      notify.err(error.message);
    }
  };
}

async function retireField(id, rerender) {
  const field = customFields.find((c) => c.id === id);
  const ok = await confirmDialog({
    title: "Retire this field?",
    message: `"${field?.label}" will stop appearing on new registrations. Values already recorded against it are kept and remain visible.`,
    confirmLabel: "Retire field"
  });
  if (!ok) return;
  try {
    await api.retireCustomField(id);
    await api.refreshTailoring();
    customFields = await api.listCustomFields("member");
    notify.ok("Field retired. Existing values are unchanged.");
    rerender();
  } catch (error) {
    notify.err(error.message);
  }
}

/* ---------------- Workflow handlers ---------------- */

async function saveWorkflow(root, rerender) {
  const pay = formData(root.querySelector('[data-form="wf-payment"]'));
  const card = formData(root.querySelector('[data-form="wf-card"]'));
  const rem = formData(root.querySelector('[data-form="wf-remittance"]'));

  const payForm = root.querySelector('[data-form="wf-payment"]');
  const cardForm = root.querySelector('[data-form="wf-card"]');
  const remForm = root.querySelector('[data-form="wf-remittance"]');
  const checked = (form, name) => Boolean(form.querySelector(`[name="${name}"]`)?.checked);

  if (checked(payForm, "allowSelfConfirm") || checked(remForm, "allowSelfVerify")) {
    const ok = await confirmDialog({
      title: "Weaken a money control?",
      message:
        "You are allowing one person to both collect and clear money. This removes a protection against loss and error. The change is recorded against your name.",
      confirmLabel: "I accept the risk",
      danger: true
    });
    if (!ok) return;
  }

  try {
    await api.saveWorkflow("payment_confirmation", {
      allowSelfConfirm: checked(payForm, "allowSelfConfirm"),
      requiresSecondApproval: checked(payForm, "requiresSecondApproval"),
      thresholdAmount: Number(pay.thresholdAmount || 0)
    });
    await api.saveWorkflow("card_printing", {
      printOnce: checked(cardForm, "printOnce"),
      reprintRole: card.reprintRole,
      sortBy: card.sortBy
    });
    await api.saveWorkflow("remittance", {
      allowSelfVerify: checked(remForm, "allowSelfVerify"),
      varianceToleranceAmount: Number(rem.varianceToleranceAmount || 0)
    });
    await api.refreshTailoring();
    workflows = await api.listWorkflows();
    notify.ok("Workflow rules saved.");
    rerender();
  } catch (error) {
    notify.err(error.message);
  }
}
