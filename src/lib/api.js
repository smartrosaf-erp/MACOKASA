/**
 * Data access layer.
 *
 * Every read and write goes through here. Row-level security does the
 * real enforcement in the database; this layer must never be trusted as
 * a security boundary, only as a convenience.
 */

import * as demo from "./demo.js";

const config = window.MACOKASA_CONFIG || {};

/**
 * Demo mode lets the whole product be explored without a database.
 * It enforces the same business rules but is not a security boundary.
 * Enabled when no Supabase project is configured, or with ?demo=1.
 */
export const DEMO =
  new URLSearchParams(window.location.search).get("demo") === "1" ||
  !(config.supabaseUrl && config.supabaseAnonKey);

export const state = {
  client: null,
  ready: false,
  session: null,
  profile: null,
  tenant: null,
  modules: new Set(),
  settings: {},
  online: navigator.onLine
};

export function isConfigured() {
  return DEMO || Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

export async function initClient() {
  if (DEMO) {
    demo.seed();
    state.ready = true;
    return null;
  }
  if (!isConfigured()) return null;
  const { createClient } = await import(
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
  );
  state.client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return state.client;
}

/* ---------------- Authentication ---------------- */

export async function signIn(email, password) {
  if (DEMO) {
    const user = demo.db.users.find((u) => u.email === String(email).trim().toLowerCase());
    if (!user) throw new Error("No such demo account.");
    demo.db.session = user;
    state.session = { user: { id: user.id, email: user.email } };
    state.profile = { ...user };
    state.tenant = demo.db.tenant;
    state.modules = new Set(demo.db.modules);
    state.settings = { ...demo.db.settings };
    return state.profile;
  }
  const { data, error } = await state.client.auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password
  });
  if (error) throw error;
  state.session = data.session;
  await loadContext();
  return state.profile;
}

export async function signOut() {
  if (DEMO) {
    demo.db.session = null;
    state.session = null;
    state.profile = null;
    state.tenant = null;
    state.modules = new Set();
    state.settings = {};
    return;
  }
  await state.client?.auth.signOut();
  state.session = null;
  state.profile = null;
  state.tenant = null;
  state.modules = new Set();
  state.settings = {};
}

export async function requestPasswordReset(email) {
  if (DEMO) return;
  const redirectTo =
    config.publicBaseUrl && config.publicBaseUrl !== "__origin__"
      ? config.publicBaseUrl
      : window.location.origin;
  await state.client?.auth.resetPasswordForEmail(String(email).trim().toLowerCase(), {
    redirectTo
  });
}

export async function restoreSession() {
  if (DEMO) return state.profile;
  if (!state.client) return null;
  const { data } = await state.client.auth.getSession();
  state.session = data?.session || null;
  if (state.session) await loadContext();
  return state.profile;
}

/** Load profile, tenant, modules and settings in one pass. */
export async function loadContext() {
  if (DEMO) return;
  state.profile = null;
  state.tenant = null;
  state.modules = new Set();
  state.settings = {};
  if (!state.session?.user?.id) return;

  const { data: profile, error } = await state.client
    .from("profiles")
    .select("id, tenant_id, full_name, phone, role, district, is_active")
    .eq("id", state.session.user.id)
    .maybeSingle();
  if (error || !profile) return;
  state.profile = profile;
  if (!profile.tenant_id) return;

  const [{ data: tenant }, { data: modules }, { data: settings }] = await Promise.all([
    state.client
      .from("tenants")
      .select("id, slug, name, status, currency, locale, branding, settings")
      .eq("id", profile.tenant_id)
      .maybeSingle(),
    state.client.from("tenant_modules").select("module_key, enabled").eq("tenant_id", profile.tenant_id),
    state.client.from("tenant_settings").select("key, value").eq("tenant_id", profile.tenant_id)
  ]);

  state.tenant = tenant || null;
  if (modules) state.modules = new Set(modules.filter((m) => m.enabled).map((m) => m.module_key));
  if (settings) state.settings = Object.fromEntries(settings.map((s) => [s.key, s.value]));
}

/* ---------------- Access helpers ---------------- */

export function role() {
  return state.profile?.role || "none";
}

export function hasRole(...allowed) {
  return allowed.flat().includes(role());
}

export function isAdmin() {
  return hasRole("platform_admin", "tenant_admin");
}

export function canWrite() {
  if (!state.tenant) return false;
  return ["active", "grace"].includes(state.tenant.status);
}

export function moduleEnabled(key) {
  if (!state.modules.size) return true;
  return state.modules.has(key);
}

export function setting(key, fallback = null) {
  const v = state.settings[key];
  return v === undefined || v === null ? fallback : v;
}

/* ---------------- Generic query helpers ---------------- */

function table(name) {
  return state.client.from(name);
}

async function run(query, label) {
  const { data, error } = await query;
  if (error) {
    console.error(`[api] ${label}`, error);
    throw new Error(friendlyError(error, label));
  }
  return data;
}

/**
 * Postgres errors are precise but unfriendly. Our triggers raise
 * business-readable messages; surface those verbatim and translate the
 * rest.
 */
function friendlyError(error, label) {
  const raw = error.message || "";
  // Messages raised deliberately by our own triggers and functions.
  if (/already been printed|requires operations approval|cannot be queued|exceeds the available|may not verify their own|Only /i.test(raw)) {
    return raw.replace(/^.*?ERROR:\s*/i, "");
  }
  if (error.code === "23505") return "That record already exists.";
  if (error.code === "23503") return "A linked record is missing.";
  if (error.code === "42501" || /row-level security/i.test(raw)) {
    return "You do not have permission to do that.";
  }
  if (/JWT|token/i.test(raw)) return "Your session expired. Please sign in again.";
  return `${label} failed. ${raw}`.trim();
}

/* ---------------- Reference data ---------------- */

export async function listDistricts() {
  if (DEMO) return demo.db.districts.filter((d) => d.is_active);
  return run(
    table("districts").select("id, name, code, region").eq("is_active", true).order("name"),
    "Loading districts"
  );
}

export async function listAreas(districtId) {
  if (DEMO) return demo.db.areas.filter((a) => a.is_active && (!districtId || a.district_id === districtId));
  let q = table("areas").select("id, district_id, name, rank_name").eq("is_active", true).order("name");
  if (districtId) q = q.eq("district_id", districtId);
  return run(q, "Loading areas");
}

export async function createArea(payload) {
  if (DEMO) {
    const row = { id: demo.uid("a"), is_active: true, ...payload };
    demo.db.areas.push(row);
    return row;
  }
  return run(table("areas").insert(payload).select().single(), "Creating area");
}

export async function listPackages({ appliesTo, operatorType } = {}) {
  if (DEMO) {
    let rows = demo.db.packages.filter((p) => p.is_active);
    if (appliesTo) rows = rows.filter((p) => p.applies_to === appliesTo || p.applies_to === "both");
    if (operatorType) rows = rows.filter((p) => !p.operator_type || p.operator_type === operatorType);
    return rows.sort((a, b) => a.rank - b.rank);
  }
  let q = table("packages")
    .select("id, code, name, applies_to, operator_type, rank, colour, is_active")
    .eq("is_active", true)
    .order("rank");
  if (appliesTo) q = q.in("applies_to", [appliesTo, "both"]);
  const rows = await run(q, "Loading packages");
  if (!operatorType) return rows;
  return rows.filter((p) => !p.operator_type || p.operator_type === operatorType);
}

export async function listPackageFees() {
  if (DEMO) return demo.db.fees.filter((f) => !f.effective_to);
  return run(
    table("package_fees")
      .select("id, package_id, fee_type, amount, currency, effective_from, effective_to")
      .is("effective_to", null),
    "Loading fees"
  );
}

export async function listPackageBenefits(packageId) {
  if (DEMO) return demo.db.benefits.filter((b) => b.package_id === packageId && b.is_active);
  return run(
    table("package_benefits")
      .select("id, package_id, benefit, detail, sort_order")
      .eq("package_id", packageId)
      .eq("is_active", true)
      .order("sort_order"),
    "Loading benefits"
  );
}

export async function upsertPackage(payload) {
  if (DEMO) {
    const existing = demo.db.packages.find((p) => p.id === payload.id);
    if (existing) Object.assign(existing, payload);
    else demo.db.packages.push({ id: demo.uid("p"), is_active: true, ...payload });
    return payload;
  }
  return run(table("packages").upsert(payload).select().single(), "Saving package");
}

export async function addBenefit(payload) {
  if (DEMO) {
    const row = { id: demo.uid("b"), is_active: true, ...payload };
    demo.db.benefits.push(row);
    return row;
  }
  return run(table("package_benefits").insert(payload).select().single(), "Adding benefit");
}

export async function removeBenefit(id) {
  if (DEMO) {
    demo.db.benefits = demo.db.benefits.filter((b) => b.id !== id);
    return null;
  }
  return run(table("package_benefits").delete().eq("id", id), "Removing benefit");
}

/**
 * Repricing never overwrites. The old fee is closed off with an end
 * date and a new row opens, so historical invoices still reconcile.
 */
export async function repriceFee({ tenantId, packageId, feeType, amount }) {
  if (DEMO) {
    demo.db.fees
      .filter((f) => f.package_id === packageId && f.fee_type === feeType && !f.effective_to)
      .forEach((f) => {
        f.effective_to = demo.today();
      });
    const row = {
      id: demo.uid("f"),
      package_id: packageId,
      fee_type: feeType,
      amount,
      currency: "MWK",
      effective_from: demo.today(),
      effective_to: null
    };
    demo.db.fees.push(row);
    return row;
  }
  const today = new Date().toISOString().slice(0, 10);
  await run(
    table("package_fees")
      .update({ effective_to: today })
      .eq("package_id", packageId)
      .eq("fee_type", feeType)
      .is("effective_to", null),
    "Closing previous fee"
  );
  return run(
    table("package_fees")
      .insert({
        tenant_id: tenantId,
        package_id: packageId,
        fee_type: feeType,
        amount,
        effective_from: today
      })
      .select()
      .single(),
    "Setting new fee"
  );
}

/* ---------------- Settings ---------------- */

export async function saveSetting(key, value, description) {
  if (DEMO) {
    demo.db.settings[key] = value;
    state.settings[key] = value;
    return { key, value };
  }
  const payload = {
    tenant_id: state.profile.tenant_id,
    key,
    value,
    description,
    updated_by: state.profile.id,
    updated_at: new Date().toISOString()
  };
  const row = await run(table("tenant_settings").upsert(payload).select().single(), "Saving setting");
  state.settings[key] = value;
  return row;
}

/* ---------------- Members ---------------- */

const MEMBER_COLUMNS = `
  id, tenant_id, membership_no, first_name, last_name, other_names, sex,
  date_of_birth, national_id, phone, alt_phone, email,
  is_operator, is_owner, operator_type,
  district_id, area_id, physical_address,
  kin_name, kin_phone, kin_relationship,
  has_licence, licence_no, licence_expiry, training_ref,
  photo_path, photo_captured_at,
  package_id, status, joined_on, period_start, period_end,
  registered_by, notes, created_at
`;

export async function searchMembers({ term = "", status, districtId, operatorType, limit = 50 } = {}) {
  if (DEMO) {
    let rows = [...demo.db.members];
    if (status) rows = rows.filter((m) => m.status === status);
    if (districtId) rows = rows.filter((m) => m.district_id === districtId);
    if (operatorType) rows = rows.filter((m) => m.operator_type === operatorType);
    if (term && term.trim()) {
      const t = term.trim().toLowerCase();
      rows = rows.filter((m) =>
        [m.first_name, m.last_name, m.membership_no, m.phone, m.national_id]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(t))
      );
    }
    return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit);
  }
  let q = table("members").select(MEMBER_COLUMNS).order("created_at", { ascending: false }).limit(limit);
  if (status) q = q.eq("status", status);
  if (districtId) q = q.eq("district_id", districtId);
  if (operatorType) q = q.eq("operator_type", operatorType);
  if (term && term.trim()) {
    const t = term.trim().replace(/[%,]/g, "");
    q = q.or(
      `first_name.ilike.%${t}%,last_name.ilike.%${t}%,membership_no.ilike.%${t}%,phone.ilike.%${t}%,national_id.ilike.%${t}%`
    );
  }
  return run(q, "Searching members");
}

export async function getMember(id) {
  if (DEMO) return demo.db.members.find((m) => m.id === id);
  return run(table("members").select(MEMBER_COLUMNS).eq("id", id).single(), "Loading member");
}

export async function createMember(payload) {
  if (DEMO) {
    const row = { id: demo.uid("m"), created_at: demo.nowIso(), membership_no: null, ...payload };
    demo.db.members.unshift(row);
    return row;
  }
  return run(table("members").insert(payload).select(MEMBER_COLUMNS).single(), "Registering member");
}

export async function updateMember(id, payload) {
  if (DEMO) {
    const row = demo.db.members.find((m) => m.id === id);
    Object.assign(row, payload);
    return row;
  }
  return run(
    table("members").update(payload).eq("id", id).select(MEMBER_COLUMNS).single(),
    "Updating member"
  );
}

export async function countMembers(filters = {}) {
  if (DEMO) {
    return demo.db.members.filter((m) =>
      Object.entries(filters).every(([k, v]) => v === undefined || v === null || m[k] === v)
    ).length;
  }
  let q = table("members").select("id", { count: "exact", head: true });
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null) q = q.eq(k, v);
  });
  const { count, error } = await q;
  if (error) throw new Error(friendlyError(error, "Counting members"));
  return count || 0;
}

/* ---------------- Memberships and payments ---------------- */

export async function createMembership(payload) {
  if (DEMO) {
    const row = { id: demo.uid("ms"), created_at: demo.nowIso(), ...payload };
    demo.db.memberships.push(row);
    return row;
  }
  return run(table("memberships").insert(payload).select().single(), "Creating membership");
}

export async function listMemberships(memberId) {
  if (DEMO) return demo.db.memberships.filter((m) => m.member_id === memberId);
  return run(
    table("memberships")
      .select("id, kind, package_id, period_start, period_end, fee_amount, card_fee, status, paid_at, created_at")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false }),
    "Loading memberships"
  );
}

export async function createPayment(payload) {
  if (DEMO) {
    const row = { id: demo.uid("pay"), created_at: demo.nowIso(), ...payload };
    demo.db.payments.unshift(row);
    return row;
  }
  return run(table("payments").insert(payload).select().single(), "Recording payment");
}

export async function confirmPayment(paymentId) {
  if (DEMO) return demo.confirmPayment(paymentId);
  const { error } = await state.client.rpc("confirm_payment", { p_payment: paymentId });
  if (error) throw new Error(friendlyError(error, "Confirming payment"));
}

export async function listPayments({ status, collectedBy, limit = 100 } = {}) {
  if (DEMO) {
    let rows = [...demo.db.payments];
    if (status) rows = rows.filter((p) => p.status === status);
    if (collectedBy) rows = rows.filter((p) => p.collected_by === collectedBy);
    return rows
      .sort((a, b) => String(b.collected_at).localeCompare(String(a.collected_at)))
      .slice(0, limit);
  }
  let q = table("payments")
    .select(
      "id, receipt_no, member_id, membership_id, purpose, method, amount, currency, collected_by, collected_at, status, confirmed_at, provider_ref, notes"
    )
    .order("collected_at", { ascending: false })
    .limit(limit);
  if (status) q = q.eq("status", status);
  if (collectedBy) q = q.eq("collected_by", collectedBy);
  return run(q, "Loading payments");
}

/* ---------------- Cards ---------------- */

export async function listPrintQueue({ districtId, areaId } = {}) {
  if (DEMO) {
    return demo.printQueue().filter(
      (r) => (!districtId || r.district_id === districtId) && (!areaId || r.area_id === areaId)
    );
  }
  let q = table("v_print_queue").select("*");
  if (districtId) q = q.eq("district_id", districtId);
  if (areaId) q = q.eq("area_id", areaId);
  return run(q, "Loading print queue");
}

export async function listCards({ memberId, status, limit = 100 } = {}) {
  if (DEMO) {
    let rows = [...demo.db.cards];
    if (memberId) rows = rows.filter((c) => c.member_id === memberId);
    if (status) rows = rows.filter((c) => c.status === status);
    return rows
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, limit);
  }
  let q = table("id_cards")
    .select(
      "id, member_id, membership_id, card_no, operator_type, design_variant, qr_token, status, print_count, printed_at, dispatch_to_clerk, dispatched_at, collected_at, expires_on, reprint_reason, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (memberId) q = q.eq("member_id", memberId);
  if (status) q = q.eq("status", status);
  return run(q, "Loading cards");
}

export async function markCardPrinted(cardId) {
  if (DEMO) return demo.markCardPrinted(cardId);
  const { error } = await state.client.rpc("mark_card_printed", { p_card: cardId });
  if (error) throw new Error(friendlyError(error, "Marking card printed"));
}

export async function approveReprint(cardId, reason) {
  if (DEMO) return demo.approveReprint(cardId, reason);
  const { error } = await state.client.rpc("approve_reprint", { p_card: cardId, p_reason: reason });
  if (error) throw new Error(friendlyError(error, "Approving reprint"));
}

export async function updateCard(id, payload) {
  if (DEMO) {
    const row = demo.db.cards.find((c) => c.id === id);
    Object.assign(row, payload);
    return row;
  }
  return run(table("id_cards").update(payload).eq("id", id).select().single(), "Updating card");
}

/* ---------------- Fleet ---------------- */

export async function listVehicles(ownerId) {
  if (DEMO) return demo.db.vehicles.filter((v) => !ownerId || v.owner_member_id === ownerId);
  let q = table("vehicles")
    .select(
      "id, owner_member_id, vehicle_type, identifier, make, model, year_of_make, colour, has_tracker, helmet_count, has_reflector, condition, is_active"
    )
    .order("created_at", { ascending: false });
  if (ownerId) q = q.eq("owner_member_id", ownerId);
  return run(q, "Loading vehicles");
}

export async function createVehicle(payload) {
  if (DEMO) {
    const row = { id: demo.uid("v"), is_active: true, created_at: demo.nowIso(), ...payload };
    demo.db.vehicles.unshift(row);
    return row;
  }
  return run(table("vehicles").insert(payload).select().single(), "Adding vehicle");
}

export async function listAssignments(vehicleId) {
  if (DEMO) return demo.db.assignments.filter((a) => !vehicleId || a.vehicle_id === vehicleId);
  let q = table("vehicle_assignments")
    .select(
      "id, vehicle_id, operator_member_id, agreement_type, agreed_amount, starts_on, ends_on, status, notes"
    )
    .order("starts_on", { ascending: false });
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  return run(q, "Loading assignments");
}

export async function createAssignment(payload) {
  if (DEMO) {
    const op = demo.db.members.find((m) => m.id === payload.operator_member_id);
    const row = {
      id: demo.uid("as"),
      status: "active",
      ends_on: null,
      _operator_name: op ? `${op.first_name} ${op.last_name}` : "",
      ...payload
    };
    demo.db.assignments.push(row);
    return row;
  }
  return run(table("vehicle_assignments").insert(payload).select().single(), "Assigning operator");
}

export async function endAssignment(id) {
  if (DEMO) {
    const row = demo.db.assignments.find((a) => a.id === id);
    row.status = "ended";
    row.ends_on = demo.today();
    return row;
  }
  return run(
    table("vehicle_assignments")
      .update({ status: "ended", ends_on: new Date().toISOString().slice(0, 10) })
      .eq("id", id),
    "Ending assignment"
  );
}

/* ---------------- Finance ---------------- */

export async function getBalances() {
  if (DEMO) return demo.balances();
  const rows = await run(table("v_balances").select("*"), "Loading balances");
  return rows?.[0] || { actual_revenue: 0, macokasa_available: 0, quickthink_balance: 0, clerk_custody: 0 };
}

export async function getClerkCustody() {
  if (DEMO) return demo.clerkCustody().sort((a, b) => b.held_amount - a.held_amount);
  return run(table("v_clerk_custody").select("*").order("held_amount", { ascending: false }), "Loading custody");
}

export async function listLedger({ limit = 200 } = {}) {
  if (DEMO) {
    return [...demo.db.ledger]
      .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))
      .slice(0, limit);
  }
  return run(
    table("ledger_entries")
      .select("id, account_id, party, clerk_id, payment_id, amount, description, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(limit),
    "Loading ledger"
  );
}

export async function listLedgerAccounts() {
  if (DEMO) return demo.db.accounts;
  return run(table("ledger_accounts").select("id, code, name, kind, party"), "Loading accounts");
}

export async function listRemittances({ status } = {}) {
  if (DEMO) {
    let rows = [...demo.db.remittances];
    if (status) rows = rows.filter((r) => r.status === status);
    return rows.sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)));
  }
  let q = table("remittances")
    .select(
      "id, reference, clerk_id, declared_amount, expected_amount, variance, method, deposit_ref, status, submitted_at, verified_at, notes"
    )
    .order("submitted_at", { ascending: false });
  if (status) q = q.eq("status", status);
  return run(q, "Loading remittances");
}

export async function createRemittance(payload) {
  if (DEMO) {
    const row = {
      id: demo.uid("rmt"),
      status: "submitted",
      submitted_at: demo.nowIso(),
      verified_at: null,
      variance: demo.round2(Number(payload.declared_amount) - Number(payload.expected_amount)),
      ...payload
    };
    demo.db.remittances.unshift(row);
    return row;
  }
  return run(table("remittances").insert(payload).select().single(), "Submitting remittance");
}

export async function verifyRemittance(id) {
  if (DEMO) return demo.verifyRemittance(id);
  const { error } = await state.client.rpc("verify_remittance", { p_remittance: id });
  if (error) throw new Error(friendlyError(error, "Verifying remittance"));
}

export async function listSettlements() {
  if (DEMO) return demo.db.settlements;
  return run(
    table("qts_settlements")
      .select(
        "id, invoice_no, period_start, period_end, amount_requested, amount_available_at_request, amount_paid, status, requested_at, approved_at, paid_at, payment_ref, rejection_reason, notes"
      )
      .order("requested_at", { ascending: false }),
    "Loading settlements"
  );
}

export async function createSettlement(payload) {
  if (DEMO) return demo.createSettlement(payload);
  return run(table("qts_settlements").insert(payload).select().single(), "Raising invoice");
}

export async function updateSettlement(id, payload) {
  if (DEMO) {
    const row = demo.db.settlements.find((s) => s.id === id);
    Object.assign(row, payload);
    return row;
  }
  return run(table("qts_settlements").update(payload).eq("id", id).select().single(), "Updating invoice");
}

export async function paySettlement({ id, amount, method, ref }) {
  if (DEMO) return demo.paySettlement({ id, amount, method, ref });
  const { error } = await state.client.rpc("pay_qts_settlement", {
    p_settlement: id,
    p_amount: amount,
    p_method: method,
    p_ref: ref
  });
  if (error) throw new Error(friendlyError(error, "Paying settlement"));
}

export async function listExpenses() {
  if (DEMO) return demo.db.expenses;
  return run(
    table("expenses")
      .select("id, reference, category, description, amount, incurred_on, method, payee, status")
      .order("incurred_on", { ascending: false })
      .limit(200),
    "Loading expenses"
  );
}

export async function createExpense(payload) {
  if (DEMO) {
    const row = { id: demo.uid("exp"), status: "recorded", created_at: demo.nowIso(), ...payload };
    demo.db.expenses.unshift(row);
    return row;
  }
  return run(table("expenses").insert(payload).select().single(), "Recording expense");
}

/* ---------------- Notifications ---------------- */

export async function listNotifications({ limit = 50 } = {}) {
  if (DEMO) return demo.db.notifications.slice(0, limit);
  return run(
    table("notifications")
      .select("id, channel, recipient, subject, body, status, created_at, sent_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    "Loading notifications"
  );
}

/* ---------------- Staff directory ---------------- */

export async function listStaff() {
  if (DEMO) return demo.db.users;
  return run(
    table("profiles").select("id, full_name, phone, role, district, is_active").order("full_name"),
    "Loading staff"
  );
}

/* ---------------- Photos (private bucket, signed URLs) ---------------- */

const signedCache = new Map();

export async function uploadMemberPhoto(memberId, blob) {
  if (DEMO) {
    const url = URL.createObjectURL(blob);
    demo._photos = demo._photos || {};
    const path = `demo/${memberId}/photo.jpg`;
    demo._photos[path] = url;
    return path;
  }
  const tenant = state.profile?.tenant_id;
  const path = `${tenant}/${memberId}/photo.jpg`;
  const { error } = await state.client.storage
    .from("member-photos")
    .upload(path, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
  if (error) throw new Error(friendlyError(error, "Uploading photo"));
  signedCache.delete(path);
  return path;
}

export async function signedPhotoUrl(path) {
  if (DEMO) return (demo._photos && demo._photos[path]) || "";
  if (!path) return "";
  if (signedCache.has(path)) return signedCache.get(path);
  const { data, error } = await state.client.storage.from("member-photos").createSignedUrl(path, 300);
  if (error) {
    console.error(error);
    return "";
  }
  signedCache.set(path, data.signedUrl);
  window.setTimeout(() => signedCache.delete(path), 270000);
  return data.signedUrl;
}

/* ---------------- Public verification ---------------- */

export async function verifyCard(token) {
  if (DEMO) return demo.verifyCard(token);
  const { data, error } = await state.client.rpc("verify_card", { p_token: token });
  if (error) throw new Error(friendlyError(error, "Verifying card"));
  return data?.[0] || null;
}

/* ---------------- Sequence helpers ---------------- */

/** Receipts and references are per tenant and readable by humans. */
export async function nextReference(prefix, tableName, column) {
  if (DEMO) {
    const key = prefix.toLowerCase();
    demo.db.seq[key] = (demo.db.seq[key] || 0) + 1;
    return `${prefix}-${new Date().getFullYear()}-${String(demo.db.seq[key]).padStart(5, "0")}`;
  }
  const { count } = await state.client.from(tableName).select("id", { count: "exact", head: true });
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String((count || 0) + 1).padStart(5, "0")}`;
}
