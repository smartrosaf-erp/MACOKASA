/**
 * Fleet management for owners.
 *
 * An owner registers, renews, and gets a business tool: which vehicles
 * they hold, who is riding them, and on what terms. Operators are sourced
 * from MACOKASA-verified members, and the system refuses to pair a
 * bicycle with a motorist or a motorcycle with a pedalist.
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
  stat,
  notify,
  modal,
  closeModal,
  confirmDialog,
  selectOptions
} from "../ui/components.js";
import { money, date, fullName } from "../lib/format.js";
import * as api from "../lib/api.js";

let owners = [];
let vehicles = [];
let assignments = [];
let selectedOwner = "";

export async function load() {
  const [allMembers, v, a] = await Promise.all([
    api.searchMembers({ limit: 300 }),
    api.listVehicles(),
    api.listAssignments()
  ]);
  owners = allMembers.filter((m) => m.is_owner);
  vehicles = v;
  assignments = a;
}

function memberById(id) {
  return owners.find((o) => o.id === id);
}

function activeAssignment(vehicleId) {
  return assignments.find((a) => a.vehicle_id === vehicleId && a.status === "active");
}

export function render() {
  const shown = selectedOwner ? vehicles.filter((v) => v.owner_member_id === selectedOwner) : vehicles;
  const motorbikes = vehicles.filter((v) => v.vehicle_type === "motorist").length;
  const bicycles = vehicles.filter((v) => v.vehicle_type === "pedalist").length;
  const assigned = vehicles.filter((v) => activeAssignment(v.id)).length;

  return html`
    <div class="grid" style="margin-bottom:18px">
      ${stat({ label: "Registered owners", value: owners.length, tone: "stat-accent", span: 3 })}
      ${stat({ label: "Motorcycles", value: motorbikes, tone: "stat-motor", span: 3 })}
      ${stat({ label: "Bicycles", value: bicycles, tone: "stat-pedal", span: 3 })}
      ${stat({ label: "Currently assigned", value: `${assigned} of ${vehicles.length}`, span: 3 })}
    </div>

    <div class="toolbar no-print">
      <select class="select" data-owner-filter aria-label="Filter by owner">
        <option value="">All owners</option>
        ${owners
          .map(
            (o) =>
              `<option value="${esc(o.id)}" ${selectedOwner === o.id ? "selected" : ""}>${esc(
                fullName(o)
              )}</option>`
          )
          .join("")}
      </select>
      <span class="spacer"></span>
      <button class="btn btn-primary btn-sm" data-act="add-vehicle" ${owners.length ? "" : "disabled"}>
        ${icon("plus")} Add vehicle
      </button>
    </div>

    ${
      owners.length === 0
        ? banner(
            "info",
            "No owners registered yet",
            "Register a member and tick the Owner role to start recording their fleet."
          )
        : ""
    }

    ${panel({
      title: "Fleet",
      tight: true,
      body: table({
        columns: [
          {
            label: "Identifier",
            render: (r) => html`<div class="row-main">${esc(r.identifier)}</div>
              <div class="row-sub">${esc([r.make, r.model].filter(Boolean).join(" ") || "—")}</div>`
          },
          { label: "Type", render: (r) => typeBadge(r.vehicle_type) },
          { label: "Owner", render: (r) => esc(fullName(memberById(r.owner_member_id)) || "—") },
          {
            label: "Assigned operator",
            render: (r) => {
              const a = activeAssignment(r.id);
              if (!a) return badge("Unassigned", "amber");
              return esc(a._operator_name || "Assigned");
            }
          },
          {
            label: "Agreement",
            render: (r) => {
              const a = activeAssignment(r.id);
              if (!a) return `<span class="na">—</span>`;
              return `${esc(String(a.agreement_type).replace(/_/g, " "))}<br><span class="row-sub">${money(
                a.agreed_amount
              )}</span>`;
            }
          },
          {
            label: "Safety",
            render: (r) =>
              r.vehicle_type === "pedalist"
                ? r.has_reflector
                  ? badge("Reflector", "green")
                  : badge("No reflector", "amber")
                : `${r.helmet_count || 0} helmet(s)${r.has_tracker ? " · " + badge("Tracker", "green") : ""}`
          },
          {
            label: "",
            align: "right",
            className: "actions",
            render: (r) => {
              const a = activeAssignment(r.id);
              return a
                ? `<button class="btn btn-ghost btn-sm" data-end="${esc(a.id)}">End assignment</button>`
                : `<button class="btn btn-primary btn-sm" data-assign="${esc(r.id)}">Assign operator</button>`;
            }
          }
        ],
        rows: shown.map((v) => ({ ...v, _id: v.id })),
        empty: selectedOwner ? "This owner has no vehicles recorded." : "No vehicles recorded yet."
      })
    })}
  `;
}

export function bind(root, rerender) {
  root.addEventListener("change", (e) => {
    const f = e.target.closest("[data-owner-filter]");
    if (f) {
      selectedOwner = f.value;
      rerender();
    }
  });

  root.addEventListener("click", async (e) => {
    if (e.target.closest('[data-act="add-vehicle"]')) return addVehicle(rerender);

    const assignId = e.target.closest("[data-assign]")?.dataset.assign;
    if (assignId) return assignOperator(assignId, rerender);

    const endId = e.target.closest("[data-end]")?.dataset.end;
    if (endId) {
      const ok = await confirmDialog({
        title: "End this assignment?",
        message: "The vehicle becomes unassigned and can be given to another operator.",
        confirmLabel: "End assignment"
      });
      if (!ok) return;
      try {
        await api.endAssignment(endId);
        notify.ok("Assignment ended.");
        await load();
        rerender();
      } catch (error) {
        notify.err(error.message);
      }
    }
  });
}

async function addVehicle(rerender) {
  let type = "motorist";

  const m = modal({
    title: "Add a vehicle",
    body: html`
      <div class="choice-grid" style="margin-bottom:16px">
        <button class="choice sel-motor" type="button" data-vtype="motorist">
          <span class="choice-icon">${icon("motorcycle")}</span>
          <span><strong>Motorcycle</strong><small>Plate, helmets, tracker</small></span>
        </button>
        <button class="choice" type="button" data-vtype="pedalist">
          <span class="choice-icon">${icon("bicycle")}</span>
          <span><strong>Bicycle</strong><small>Bicycle ID, reflector</small></span>
        </button>
      </div>
      <div class="form-grid" data-form="vehicle">
        <label class="field"><span>Owner *</span>
          <select class="select" name="owner_member_id" required>
            ${owners.map((o) => `<option value="${esc(o.id)}">${esc(fullName(o))}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span data-id-label>Plate number *</span>
          <input class="input" name="identifier" required placeholder="LL 0000" />
        </label>
        <label class="field"><span>Make</span><input class="input" name="make" /></label>
        <label class="field"><span>Model</span><input class="input" name="model" /></label>
        <div data-motor-fields style="display:contents">
          <label class="field"><span>Helmets carried</span>
            <input class="input" type="number" name="helmet_count" value="2" min="0" />
          </label>
          <label class="field full">
            <label class="switch"><input type="checkbox" name="has_tracker" />
              <span class="switch-track"></span><span>Tracker installed</span></label>
          </label>
        </div>
        <div data-pedal-fields style="display:none">
          <label class="field full">
            <label class="switch"><input type="checkbox" name="has_reflector" checked />
              <span class="switch-track"></span><span>Reflector fitted</span></label>
          </label>
        </div>
      </div>
    `,
    footer: html`
      <button class="btn btn-ghost" type="button" data-close>Cancel</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" type="button" data-save>Add vehicle</button>
    `
  });

  m.addEventListener("click", (e) => {
    const t = e.target.closest("[data-vtype]")?.dataset.vtype;
    if (!t) return;
    type = t;
    m.querySelectorAll("[data-vtype]").forEach((b) => {
      b.classList.toggle("sel-motor", b.dataset.vtype === "motorist" && t === "motorist");
      b.classList.toggle("sel-pedal", b.dataset.vtype === "pedalist" && t === "pedalist");
    });
    m.querySelector("[data-id-label]").textContent = t === "pedalist" ? "Bicycle ID *" : "Plate number *";
    m.querySelector('[name="identifier"]').placeholder = t === "pedalist" ? "BIC-BT-0000" : "LL 0000";
    m.querySelector("[data-motor-fields]").style.display = t === "motorist" ? "contents" : "none";
    m.querySelector("[data-pedal-fields]").style.display = t === "pedalist" ? "contents" : "none";
  });

  m.querySelector("[data-save]").onclick = async () => {
    const v = formData(m.querySelector('[data-form="vehicle"]'));
    if (!v.identifier?.trim()) return notify.err("Enter the vehicle identifier.");
    try {
      await api.createVehicle({
        tenant_id: api.state.profile.tenant_id,
        owner_member_id: v.owner_member_id,
        vehicle_type: type,
        identifier: v.identifier.trim(),
        make: v.make?.trim() || null,
        model: v.model?.trim() || null,
        helmet_count: type === "motorist" ? Number(v.helmet_count || 0) : 0,
        has_tracker: type === "motorist" && Boolean(v.has_tracker),
        has_reflector: type === "pedalist" && Boolean(v.has_reflector)
      });
      closeModal();
      notify.ok("Vehicle added.");
      await load();
      rerender();
    } catch (error) {
      notify.err(error.message);
    }
  };
}

async function assignOperator(vehicleId, rerender) {
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  // Only operators of the matching type, and only active members:
  // MACOKASA recommends verified people, not anyone in the database.
  const candidates = (await api.searchMembers({ operatorType: vehicle.vehicle_type, status: "active", limit: 200 }))
    .filter((m) => m.is_operator);

  const m = modal({
    title: `Assign an operator — ${vehicle.identifier}`,
    body: html`
      ${
        candidates.length
          ? banner(
              "info",
              "MACOKASA-verified operators only",
              `Showing active ${vehicle.vehicle_type === "pedalist" ? "pedalists" : "motorists"} with current membership.`
            )
          : banner(
              "warn",
              "No eligible operators",
              `No active ${vehicle.vehicle_type === "pedalist" ? "pedalist" : "motorist"} members are available to assign.`
            )
      }
      <div class="form-grid" data-form="assign">
        <label class="field full"><span>Operator *</span>
          <select class="select" name="operator_member_id" required ${candidates.length ? "" : "disabled"}>
            ${candidates
              .map(
                (c) =>
                  `<option value="${esc(c.id)}">${esc(fullName(c))} — ${esc(c.membership_no || "no number")}</option>`
              )
              .join("")}
          </select>
        </label>
        <label class="field"><span>Agreement *</span>
          <select class="select" name="agreement_type">
            <option value="daily_target">Daily target</option>
            <option value="weekly_target">Weekly target</option>
            <option value="monthly_target">Monthly target</option>
            <option value="monthly_hire">Monthly hire</option>
            <option value="commission">Commission</option>
          </select>
        </label>
        <label class="field"><span>Amount (MWK) *</span>
          <input class="input" type="number" name="agreed_amount" min="0" step="100"
            value="${vehicle.vehicle_type === "pedalist" ? 1500 : 6000}" required />
        </label>
        <label class="field full"><span>Starts on</span>
          <input class="input" type="date" name="starts_on" value="${new Date().toISOString().slice(0, 10)}" />
        </label>
        <label class="field full"><span>Notes</span><textarea class="textarea" name="notes"></textarea></label>
      </div>
    `,
    footer: html`
      <button class="btn btn-ghost" type="button" data-close>Cancel</button>
      <span class="spacer"></span>
      <button class="btn btn-primary" type="button" data-save ${candidates.length ? "" : "disabled"}>Assign</button>
    `
  });

  m.querySelector("[data-save]").onclick = async () => {
    const v = formData(m.querySelector('[data-form="assign"]'));
    try {
      await api.createAssignment({
        tenant_id: api.state.profile.tenant_id,
        vehicle_id: vehicleId,
        operator_member_id: v.operator_member_id,
        agreement_type: v.agreement_type,
        agreed_amount: Number(v.agreed_amount || 0),
        starts_on: v.starts_on,
        notes: v.notes?.trim() || null
      });
      closeModal();
      notify.ok("Operator assigned.");
      await load();
      rerender();
    } catch (error) {
      notify.err(error.message);
    }
  };
}
