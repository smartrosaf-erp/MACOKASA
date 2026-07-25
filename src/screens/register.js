/**
 * Clerk registration wizard.
 *
 * Requirement: registration is visual, and each entry is confirmed after
 * entering so wrong data does not reach the database. Every step must be
 * explicitly confirmed before the next unlocks, and the final review
 * shows everything back before saving.
 *
 * Payment is optional at registration. If unpaid, the member is saved as
 * pending_payment and can be found later when they pay.
 */

import { esc, html, formData, $ } from "../lib/dom.js";
import { icon } from "./../ui/icons.js";
import {
  notify,
  panel,
  banner,
  badge,
  typeBadge,
  selectOptions,
  loading,
  confirmDialog
} from "../ui/components.js";
import { photoCaptureMarkup, bindPhotoCapture, stopCamera, dataUrlToBlob } from "../ui/photo.js";
import { money, isValidPhone, normalisePhone, fullName } from "../lib/format.js";
import * as api from "../lib/api.js";

const STEPS = [
  { key: "type", label: "Operator type" },
  { key: "identity", label: "Personal details" },
  { key: "photo", label: "Face photo" },
  { key: "location", label: "District and rank" },
  { key: "package", label: "Package" },
  { key: "review", label: "Review and save" }
];

let draft = null;
let confirmed = new Set();
let step = 0;
let refs = { districts: [], areas: [], packages: [], fees: [] };
let saving = false;

function blankDraft() {
  return {
    is_operator: true,
    is_owner: false,
    operator_type: "motorist",
    first_name: "",
    last_name: "",
    other_names: "",
    sex: "",
    date_of_birth: "",
    national_id: "",
    phone: "",
    alt_phone: "",
    email: "",
    kin_name: "",
    kin_phone: "",
    kin_relationship: "",
    has_licence: false,
    licence_no: "",
    licence_expiry: "",
    training_ref: "",
    photo_data: "",
    district_id: "",
    area_id: "",
    physical_address: "",
    package_id: "",
    paid_now: false,
    payment_method: "cash",
    payment_ref: "",
    notes: ""
  };
}

export function resetWizard() {
  draft = blankDraft();
  confirmed = new Set();
  step = 0;
}

export async function loadRefs() {
  const [districts, packages, fees] = await Promise.all([
    api.listDistricts(),
    api.listPackages(),
    api.listPackageFees()
  ]);
  refs = { districts, packages, fees, areas: [] };
}

export async function render() {
  if (!draft) resetWizard();
  if (!refs.districts.length) {
    try {
      await loadRefs();
    } catch (error) {
      return banner("danger", "Could not load reference data", error.message);
    }
  }
  return html`
    <div class="wizard">
      <nav class="steps" aria-label="Registration steps">
        ${STEPS.map(
          (s, i) => html`
            <button
              class="step ${i === step ? "active" : ""} ${confirmed.has(s.key) ? "done" : ""}"
              type="button"
              data-goto-step="${i}"
              ${i > 0 && !confirmed.has(STEPS[i - 1].key) ? "disabled" : ""}
            >
              <span class="step-num"><span>${i + 1}</span></span>
              ${esc(s.label)}
            </button>
          `
        ).join("")}
      </nav>
      <div data-step-body>${stepBody()}</div>
    </div>
  `;
}

function stepBody() {
  switch (STEPS[step].key) {
    case "type":
      return stepType();
    case "identity":
      return stepIdentity();
    case "photo":
      return stepPhoto();
    case "location":
      return stepLocation();
    case "package":
      return stepPackage();
    case "review":
      return stepReview();
    default:
      return "";
  }
}

/* ---------------- Step 1: type ---------------- */

function stepType() {
  const pedal = draft.operator_type === "pedalist";
  return panel({
    eyebrow: "Step 1",
    title: "What kind of member is this?",
    body: html`
      <p class="hint" style="margin-top:0">
        This sets the fees, the details collected, and the design of the ID card.
      </p>

      <div class="choice-grid" style="margin-bottom:18px">
        <button class="choice ${!pedal ? "sel-motor" : ""}" type="button" data-set-type="motorist">
          <span class="choice-icon">${icon("motorcycle")}</span>
          <span>
            <strong>Motorist</strong>
            <small>Motorcycle Kabaza. Licence, plate and helmets recorded.</small>
          </span>
        </button>
        <button class="choice ${pedal ? "sel-pedal" : ""}" type="button" data-set-type="pedalist">
          <span class="choice-icon">${icon("bicycle")}</span>
          <span>
            <strong>Pedalist</strong>
            <small>Bicycle Kabaza. Bicycle ID and reflector recorded.</small>
          </span>
        </button>
      </div>

      <fieldset>
        <legend>Role in the trade</legend>
        <p class="hint" style="margin-top:0">
          A person may ride, may own bicycles or motorcycles and rent them out, or may do both.
          One person is one member record.
        </p>
        <div style="display:grid;gap:12px">
          <label class="switch">
            <input type="checkbox" data-flag="is_operator" ${draft.is_operator ? "checked" : ""} />
            <span class="switch-track"></span>
            <span><strong>Operator</strong> — rides and carries passengers</span>
          </label>
          <label class="switch">
            <input type="checkbox" data-flag="is_owner" ${draft.is_owner ? "checked" : ""} />
            <span class="switch-track"></span>
            <span><strong>Owner</strong> — owns vehicles and rents them out</span>
          </label>
        </div>
      </fieldset>

      ${confirmBar("type", "Confirm the member type and role")}
    `
  });
}

/* ---------------- Step 2: identity ---------------- */

function stepIdentity() {
  const pedal = draft.operator_type === "pedalist";
  return panel({
    eyebrow: "Step 2",
    title: "Personal details",
    body: html`
      <form class="form-grid" data-form="identity">
        <label class="field"><span>First name *</span>
          <input class="input" name="first_name" value="${esc(draft.first_name)}" required autocomplete="off" />
        </label>
        <label class="field"><span>Surname *</span>
          <input class="input" name="last_name" value="${esc(draft.last_name)}" required autocomplete="off" />
        </label>
        <label class="field"><span>Other names</span>
          <input class="input" name="other_names" value="${esc(draft.other_names)}" autocomplete="off" />
        </label>
        <label class="field"><span>Sex *</span>
          <select class="select" name="sex" required>
            <option value="">Select…</option>
            <option value="male" ${draft.sex === "male" ? "selected" : ""}>Male</option>
            <option value="female" ${draft.sex === "female" ? "selected" : ""}>Female</option>
          </select>
        </label>
        <label class="field"><span>Date of birth</span>
          <input class="input" type="date" name="date_of_birth" value="${esc(draft.date_of_birth)}" />
        </label>
        <label class="field"><span>National ID</span>
          <input class="input" name="national_id" value="${esc(draft.national_id)}" autocomplete="off" />
        </label>
        <label class="field"><span>Phone *</span>
          <input class="input" name="phone" value="${esc(draft.phone)}" required placeholder="0991 234 567" inputmode="tel" />
          <span class="hint">Malawi mobile. Saved as +265…</span>
        </label>
        <label class="field"><span>Alternative phone</span>
          <input class="input" name="alt_phone" value="${esc(draft.alt_phone)}" inputmode="tel" />
        </label>
        <label class="field full"><span>Email</span>
          <input class="input" type="email" name="email" value="${esc(draft.email)}" />
        </label>

        <fieldset class="field full">
          <legend>Next of kin</legend>
          <div class="form-grid">
            <label class="field"><span>Name</span>
              <input class="input" name="kin_name" value="${esc(draft.kin_name)}" />
            </label>
            <label class="field"><span>Phone</span>
              <input class="input" name="kin_phone" value="${esc(draft.kin_phone)}" inputmode="tel" />
            </label>
            <label class="field full"><span>Relationship</span>
              <input class="input" name="kin_relationship" value="${esc(draft.kin_relationship)}" />
            </label>
          </div>
        </fieldset>

        <fieldset class="field full">
          <legend>${pedal ? "Training" : "Licensing"}</legend>
          <div class="form-grid">
            <label class="field full">
              <label class="switch">
                <input type="checkbox" name="has_licence" ${draft.has_licence ? "checked" : ""} />
                <span class="switch-track"></span>
                <span>${pedal ? "Has completed road safety training" : "Holds a valid driving licence"}</span>
              </label>
            </label>
            ${
              pedal
                ? `<label class="field full"><span>Training reference</span>
                     <input class="input" name="training_ref" value="${esc(draft.training_ref)}" placeholder="Certificate reference" />
                   </label>`
                : `<label class="field"><span>Licence number</span>
                     <input class="input" name="licence_no" value="${esc(draft.licence_no)}" placeholder="DL-…" />
                   </label>
                   <label class="field"><span>Licence expiry</span>
                     <input class="input" type="date" name="licence_expiry" value="${esc(draft.licence_expiry)}" />
                   </label>`
            }
          </div>
        </fieldset>
      </form>
      ${confirmBar("identity", "I have read these details back to the member")}
    `
  });
}

/* ---------------- Step 3: photo ---------------- */

function stepPhoto() {
  const required = api.setting("require_photo_on_registration", true);
  return panel({
    eyebrow: "Step 3",
    title: "Face photo",
    body: html`
      ${
        required
          ? banner("info", "A photo is required", "This member cannot be saved without a face photo.")
          : ""
      }
      ${photoCaptureMarkup(draft.photo_data)}
      ${confirmBar("photo", "The photo is clear and shows this member")}
    `
  });
}

/* ---------------- Step 4: location ---------------- */

function stepLocation() {
  return panel({
    eyebrow: "Step 4",
    title: "District and operating rank",
    body: html`
      <p class="hint" style="margin-top:0">
        Printed cards are sorted by district and area and returned to the clerk who filed the member,
        so this must be right.
      </p>
      <form class="form-grid" data-form="location">
        <label class="field"><span>District *</span>
          <select class="select" name="district_id" required data-district>
            ${selectOptions(refs.districts, draft.district_id, { placeholder: "Select district…" })}
          </select>
        </label>
        <label class="field"><span>Operating area / rank *</span>
          <div class="input-group">
            <select class="select" name="area_id" required data-area ${refs.areas.length ? "" : "disabled"}>
              ${
                refs.areas.length
                  ? selectOptions(refs.areas, draft.area_id, { placeholder: "Select area…" })
                  : `<option value="">Choose a district first</option>`
              }
            </select>
            <button class="btn btn-ghost btn-icon" type="button" data-act="add-area" title="Add a new area"
              ${draft.district_id ? "" : "disabled"}>${icon("plus")}</button>
          </div>
        </label>
        <label class="field full"><span>Physical address or landmark</span>
          <input class="input" name="physical_address" value="${esc(draft.physical_address)}" />
        </label>
      </form>
      ${confirmBar("location", "The district and rank are correct")}
    `
  });
}

/* ---------------- Step 5: package ---------------- */

function feeFor(packageId, feeType) {
  const f = refs.fees.find((x) => x.package_id === packageId && x.fee_type === feeType);
  return f ? Number(f.amount) : 0;
}

function eligiblePackages() {
  const wanted = draft.is_owner && !draft.is_operator ? "owner" : "operator";
  return refs.packages.filter(
    (p) =>
      (p.applies_to === wanted || p.applies_to === "both") &&
      (!p.operator_type || p.operator_type === draft.operator_type)
  );
}

function stepPackage() {
  const list = eligiblePackages();
  const chosen = list.find((p) => p.id === draft.package_id);
  const reg = chosen ? feeFor(chosen.id, "registration") : 0;
  const cardFee = chosen ? feeFor(chosen.id, "card") : 0;
  const total = reg + cardFee;

  return panel({
    eyebrow: "Step 5",
    title: "Membership package and payment",
    body: html`
      ${
        list.length
          ? html`
              <div class="choice-grid" style="margin-bottom:16px">
                ${list
                  .map(
                    (p) => html`
                      <button class="choice ${draft.package_id === p.id ? "sel" : ""}" type="button" data-set-package="${esc(p.id)}">
                        <span class="choice-icon" style="background:${esc(p.colour || "#eef2f7")}22;color:${esc(p.colour || "#33475e")}">
                          ${icon("package")}
                        </span>
                        <span>
                          <strong>${esc(p.name)}</strong>
                          <small>${money(feeFor(p.id, "registration"))} registration</small>
                        </span>
                      </button>
                    `
                  )
                  .join("")}
              </div>
            `
          : banner("warn", "No packages configured", "An administrator must set up packages before members can be registered.")
      }

      ${
        chosen
          ? html`
              <div class="panel" style="box-shadow:none;margin-bottom:16px">
                <div class="panel-body">
                  <dl class="kv">
                    <dt>Registration fee</dt><dd>${money(reg)}</dd>
                    <dt>Card fee</dt><dd>${money(cardFee)}</dd>
                    <dt style="font-weight:800;color:var(--ink)">Total due</dt>
                    <dd style="font-weight:800;font-size:1.05rem">${money(total)}</dd>
                  </dl>
                  <div id="benefits-slot"></div>
                </div>
              </div>

              <fieldset>
                <legend>Payment</legend>
                <label class="switch" style="margin-bottom:12px">
                  <input type="checkbox" data-flag="paid_now" ${draft.paid_now ? "checked" : ""} />
                  <span class="switch-track"></span>
                  <span><strong>The member is paying now</strong></span>
                </label>

                ${
                  draft.paid_now
                    ? html`
                        <div class="form-grid" data-form="payment">
                          <label class="field"><span>Method</span>
                            <select class="select" name="payment_method">
                              ${["cash", "airtel_money", "mpamba", "bank_transfer"]
                                .map(
                                  (m) =>
                                    `<option value="${m}" ${draft.payment_method === m ? "selected" : ""}>${m
                                      .replace(/_/g, " ")
                                      .replace(/\b\w/g, (c) => c.toUpperCase())}</option>`
                                )
                                .join("")}
                            </select>
                          </label>
                          <label class="field"><span>Reference / receipt</span>
                            <input class="input" name="payment_ref" value="${esc(draft.payment_ref)}" />
                          </label>
                        </div>
                        ${banner(
                          "info",
                          "This money enters your custody",
                          `${money(total)} will be recorded against your name until you remit it and finance reconciles.`
                        )}
                      `
                    : banner(
                        "warn",
                        "Saving as pending payment",
                        "The member will be searchable and can be marked paid later. No card is prepared until the fee is confirmed."
                      )
                }
              </fieldset>
            `
          : ""
      }
      ${confirmBar("package", "The package and payment position are correct")}
    `
  });
}

/* ---------------- Step 6: review ---------------- */

function row(label, value, missing = false) {
  return html`
    <div class="review-row">
      <dt>${esc(label)}</dt>
      <dd class="${missing ? "missing" : ""}">${missing ? "Not provided" : value}</dd>
    </div>
  `;
}

function stepReview() {
  const district = refs.districts.find((d) => d.id === draft.district_id);
  const area = refs.areas.find((a) => a.id === draft.area_id);
  const pkg = refs.packages.find((p) => p.id === draft.package_id);
  const reg = pkg ? feeFor(pkg.id, "registration") : 0;
  const cardFee = pkg ? feeFor(pkg.id, "card") : 0;
  const pedal = draft.operator_type === "pedalist";

  const roles = [draft.is_operator && "Operator", draft.is_owner && "Owner"].filter(Boolean).join(" and ");

  return panel({
    eyebrow: "Step 6",
    title: "Review before saving",
    body: html`
      ${banner(
        "warn",
        "Read this back to the member",
        "Once saved, corrections require an operations manager. Check every line."
      )}

      <dl class="review">
        <div class="review-group">Member type</div>
        ${row("Type", typeBadge(draft.operator_type))}
        ${row("Role", esc(roles))}

        <div class="review-group">Personal</div>
        ${row("Full name", esc([draft.first_name, draft.other_names, draft.last_name].filter(Boolean).join(" ")))}
        ${row("Sex", esc(draft.sex || ""), !draft.sex)}
        ${row("Date of birth", esc(draft.date_of_birth || ""), !draft.date_of_birth)}
        ${row("National ID", esc(draft.national_id || ""), !draft.national_id)}
        ${row("Phone", esc(normalisePhone(draft.phone)))}
        ${row("Alternative phone", esc(draft.alt_phone || ""), !draft.alt_phone)}
        ${row("Email", esc(draft.email || ""), !draft.email)}

        <div class="review-group">Next of kin</div>
        ${row("Name", esc(draft.kin_name || ""), !draft.kin_name)}
        ${row("Phone", esc(draft.kin_phone || ""), !draft.kin_phone)}
        ${row("Relationship", esc(draft.kin_relationship || ""), !draft.kin_relationship)}

        <div class="review-group">${pedal ? "Training" : "Licensing"}</div>
        ${row(pedal ? "Trained" : "Licensed", draft.has_licence ? badge("Yes", "green") : badge("No", "amber"))}
        ${
          pedal
            ? row("Training reference", esc(draft.training_ref || ""), !draft.training_ref)
            : row("Licence number", esc(draft.licence_no || ""), !draft.licence_no)
        }

        <div class="review-group">Location</div>
        ${row("District", esc(district?.name || ""), !district)}
        ${row("Area / rank", esc(area?.name || ""), !area)}
        ${row("Address", esc(draft.physical_address || ""), !draft.physical_address)}

        <div class="review-group">Membership</div>
        ${row("Package", esc(pkg?.name || ""), !pkg)}
        ${row("Registration fee", money(reg))}
        ${row("Card fee", money(cardFee))}
        ${row("Total", `<strong>${money(reg + cardFee)}</strong>`)}
        ${row(
          "Payment",
          draft.paid_now
            ? badge(`Paying now — ${String(draft.payment_method).replace(/_/g, " ")}`, "green")
            : badge("Pending payment", "amber")
        )}

        <div class="review-group">Photo</div>
        <div class="review-row">
          <dt>Face photo</dt>
          <dd>
            ${
              draft.photo_data
                ? `<img src="${esc(draft.photo_data)}" alt="Face photo" style="width:78px;border-radius:8px;border:1px solid var(--line)" />`
                : `<span class="missing">Not captured</span>`
            }
          </dd>
        </div>
      </dl>

      <div class="form-actions">
        <button class="btn btn-ghost" type="button" data-act="back">${icon("arrowLeft")} Back</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" type="button" data-act="save" ${saving ? "disabled" : ""}>
          ${icon("check")} ${saving ? "Saving…" : "Save member"}
        </button>
      </div>
    `
  });
}

/* ---------------- Confirm bar ---------------- */

function confirmBar(key, label) {
  const done = confirmed.has(key);
  const isLast = STEPS[step].key === "package";
  return html`
    <div class="confirm-bar ${done ? "confirmed" : ""}">
      ${done ? icon("checkCircle") : icon("alert")}
      <p>${esc(label)}</p>
      <span class="spacer"></span>
      ${step > 0 ? `<button class="btn btn-ghost btn-sm" type="button" data-act="back">Back</button>` : ""}
      <button class="btn ${done ? "btn-ghost" : "btn-primary"}" type="button" data-act="confirm-step" data-step-key="${esc(key)}">
        ${done ? "Confirmed" : "Confirm and continue"} ${done ? "" : icon("arrowRight")}
      </button>
    </div>
  `;
}

/* ---------------- Interaction ---------------- */

export function bind(root, rerender) {
  // Photo controls need binding whenever the photo step is showing.
  if (STEPS[step].key === "photo") {
    bindPhotoCapture(root, (dataUrl) => {
      draft.photo_data = dataUrl;
    });
  }

  if (STEPS[step].key === "package" && draft.package_id) {
    void showBenefits(root);
  }

  root.addEventListener("click", async (event) => {
    const typeBtn = event.target.closest("[data-set-type]");
    if (typeBtn) {
      draft.operator_type = typeBtn.dataset.setType;
      draft.package_id = "";
      confirmed.delete("package");
      rerender();
      return;
    }

    const pkgBtn = event.target.closest("[data-set-package]");
    if (pkgBtn) {
      draft.package_id = pkgBtn.dataset.setPackage;
      rerender();
      return;
    }

    const gotoStep = event.target.closest("[data-goto-step]");
    if (gotoStep && !gotoStep.disabled) {
      captureCurrentStep(root);
      step = Number(gotoStep.dataset.gotoStep);
      stopCamera();
      rerender();
      return;
    }

    const act = event.target.closest("[data-act]")?.dataset.act;
    if (!act) return;

    if (act === "back") {
      captureCurrentStep(root);
      step = Math.max(0, step - 1);
      stopCamera();
      rerender();
      return;
    }

    if (act === "confirm-step") {
      const key = event.target.closest("[data-step-key]").dataset.stepKey;
      captureCurrentStep(root);
      const problem = validateStep(key);
      if (problem) {
        notify.err(problem);
        return;
      }
      confirmed.add(key);
      stopCamera();
      step = Math.min(STEPS.length - 1, step + 1);
      rerender();
      return;
    }

    if (act === "add-area") {
      await promptNewArea(rerender);
      return;
    }

    if (act === "save") {
      await save(rerender);
    }
  });

  root.addEventListener("change", async (event) => {
    const flag = event.target.closest("[data-flag]");
    if (flag) {
      draft[flag.dataset.flag] = flag.checked;
      // Role changes alter which packages apply.
      if (flag.dataset.flag !== "paid_now") {
        draft.package_id = "";
        confirmed.delete("package");
      }
      rerender();
      return;
    }

    const districtSel = event.target.closest("[data-district]");
    if (districtSel) {
      draft.district_id = districtSel.value;
      draft.area_id = "";
      refs.areas = draft.district_id ? await api.listAreas(draft.district_id) : [];
      rerender();
    }
  });
}

async function showBenefits(root) {
  const slot = root.querySelector("#benefits-slot");
  if (!slot || !draft.package_id) return;
  try {
    const benefits = await api.listPackageBenefits(draft.package_id);
    if (!benefits.length) return;
    slot.innerHTML = html`
      <div class="divider"></div>
      <p class="label" style="margin-bottom:8px">Included benefits</p>
      <ul class="list-plain">
        ${benefits
          .map((b) => `<li>${icon("check")}<span>${esc(b.benefit)}${b.detail ? ` — ${esc(b.detail)}` : ""}</span></li>`)
          .join("")}
      </ul>
    `;
  } catch {
    /* benefits are decorative; ignore failures */
  }
}

function captureCurrentStep(root) {
  const key = STEPS[step].key;
  if (key === "identity") {
    const form = root.querySelector('[data-form="identity"]');
    if (form) {
      Object.assign(draft, formData(form));
      draft.has_licence = Boolean(form.querySelector('[name="has_licence"]')?.checked);
    }
  }
  if (key === "location") {
    const form = root.querySelector('[data-form="location"]');
    if (form) Object.assign(draft, formData(form));
  }
  if (key === "package") {
    const form = root.querySelector('[data-form="payment"]');
    if (form) Object.assign(draft, formData(form));
  }
  if (key === "photo") {
    const hidden = root.querySelector("[data-photo-data]");
    if (hidden) draft.photo_data = hidden.value;
  }
}

function validateStep(key) {
  if (key === "type") {
    if (!draft.is_operator && !draft.is_owner) return "Select at least one role: operator, owner, or both.";
    return null;
  }
  if (key === "identity") {
    if (!draft.first_name?.trim()) return "First name is required.";
    if (!draft.last_name?.trim()) return "Surname is required.";
    if (!draft.sex) return "Select the member's sex.";
    if (!draft.phone?.trim()) return "A phone number is required.";
    if (!isValidPhone(draft.phone)) return "That phone number does not look like a Malawi mobile number.";
    if (draft.alt_phone && !isValidPhone(draft.alt_phone)) return "The alternative phone number is not valid.";
    if (draft.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email)) return "That email address is not valid.";
    return null;
  }
  if (key === "photo") {
    if (api.setting("require_photo_on_registration", true) && !draft.photo_data) {
      return "Capture or upload a face photo before continuing.";
    }
    return null;
  }
  if (key === "location") {
    if (!draft.district_id) return "Select a district.";
    if (!draft.area_id) return "Select an operating area or rank.";
    return null;
  }
  if (key === "package") {
    if (!draft.package_id) return "Select a membership package.";
    return null;
  }
  return null;
}

async function promptNewArea(rerender) {
  const district = refs.districts.find((d) => d.id === draft.district_id);
  if (!district) return;
  const { modal, closeModal } = await import("../ui/components.js");
  const m = modal({
    title: `New area in ${district.name}`,
    body: html`
      <div class="form-grid">
        <label class="field full"><span>Area name *</span>
          <input class="input" data-new-area-name placeholder="e.g. Limbe Rank" />
        </label>
        <label class="field full"><span>Rank name</span>
          <input class="input" data-new-area-rank />
        </label>
      </div>
    `,
    footer: html`
      <button class="btn btn-ghost" type="button" data-close>Cancel</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" type="button" data-save-area>Add area</button>
    `
  });
  m.querySelector("[data-save-area]").onclick = async () => {
    const name = m.querySelector("[data-new-area-name]").value.trim();
    if (!name) return notify.err("Enter an area name.");
    try {
      const area = await api.createArea({
        tenant_id: api.state.profile.tenant_id,
        district_id: district.id,
        name,
        rank_name: m.querySelector("[data-new-area-rank]").value.trim() || null
      });
      refs.areas = await api.listAreas(district.id);
      draft.area_id = area.id;
      closeModal();
      notify.ok(`Added ${name}.`);
      rerender();
    } catch (error) {
      notify.err(error.message);
    }
  };
}

/* ---------------- Save ---------------- */

async function save(rerender) {
  const problems = ["type", "identity", "photo", "location", "package"].map(validateStep).filter(Boolean);
  if (problems.length) {
    notify.err(problems[0]);
    return;
  }

  const proceed = await confirmDialog({
    title: "Save this member?",
    message: draft.paid_now
      ? "The member will be registered and the payment recorded in your custody."
      : "The member will be saved as pending payment. No card is prepared until the fee is confirmed.",
    confirmLabel: "Save member"
  });
  if (!proceed) return;

  saving = true;
  rerender();

  try {
    const tenantId = api.state.profile.tenant_id;
    const pkg = refs.packages.find((p) => p.id === draft.package_id);
    const regFee = feeFor(pkg.id, "registration");
    const cardFee = feeFor(pkg.id, "card");

    const member = await api.createMember({
      tenant_id: tenantId,
      first_name: draft.first_name.trim(),
      last_name: draft.last_name.trim(),
      other_names: draft.other_names?.trim() || null,
      sex: draft.sex,
      date_of_birth: draft.date_of_birth || null,
      national_id: draft.national_id?.trim() || null,
      phone: normalisePhone(draft.phone),
      alt_phone: draft.alt_phone ? normalisePhone(draft.alt_phone) : null,
      email: draft.email?.trim() || null,
      is_operator: draft.is_operator,
      is_owner: draft.is_owner,
      operator_type: draft.is_operator ? draft.operator_type : draft.operator_type,
      district_id: draft.district_id,
      area_id: draft.area_id,
      physical_address: draft.physical_address?.trim() || null,
      kin_name: draft.kin_name?.trim() || null,
      kin_phone: draft.kin_phone ? normalisePhone(draft.kin_phone) : null,
      kin_relationship: draft.kin_relationship?.trim() || null,
      has_licence: Boolean(draft.has_licence),
      licence_no: draft.licence_no?.trim() || null,
      licence_expiry: draft.licence_expiry || null,
      training_ref: draft.training_ref?.trim() || null,
      package_id: draft.package_id,
      status: "pending_payment",
      registered_by: api.state.profile.id,
      notes: draft.notes?.trim() || null
    });

    // Photo upload is best effort: a failed upload must not lose the member.
    if (draft.photo_data) {
      try {
        const blob = await dataUrlToBlob(draft.photo_data);
        const path = await api.uploadMemberPhoto(member.id, blob);
        await api.updateMember(member.id, {
          photo_path: path,
          photo_captured_at: new Date().toISOString()
        });
      } catch (error) {
        console.error(error);
        notify.warn("Member saved, but the photo did not upload. Add it from the member record.");
      }
    }

    const today = new Date();
    const term = Number(api.setting("membership_term_months", 12));
    const end = new Date(today);
    end.setMonth(end.getMonth() + term);

    const membership = await api.createMembership({
      tenant_id: tenantId,
      member_id: member.id,
      package_id: draft.package_id,
      kind: "registration",
      period_start: today.toISOString().slice(0, 10),
      period_end: end.toISOString().slice(0, 10),
      fee_amount: regFee,
      card_fee: cardFee,
      status: "pending_payment"
    });

    if (draft.paid_now) {
      const receiptNo = await api.nextReference("RCT", "payments");
      const payment = await api.createPayment({
        tenant_id: tenantId,
        receipt_no: receiptNo,
        member_id: member.id,
        membership_id: membership.id,
        purpose: "registration",
        method: draft.payment_method,
        amount: regFee + cardFee,
        collected_by: api.state.profile.id,
        status: "pending",
        provider_ref: draft.payment_ref?.trim() || null,
        payer_phone: normalisePhone(draft.phone)
      });
      notify.ok(
        `${fullName(member)} registered. Receipt ${receiptNo} for ${money(regFee + cardFee)} is awaiting finance confirmation.`
      );
    } else {
      notify.ok(`${fullName(member)} saved as pending payment. Find them in Members when they pay.`);
    }

    resetWizard();
    rerender();
  } catch (error) {
    console.error(error);
    notify.err(error.message || "The member could not be saved.");
  } finally {
    saving = false;
    rerender();
  }
}
