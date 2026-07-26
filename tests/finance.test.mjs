/**
 * Finance logic tests.
 *
 * These reimplement the SQL arithmetic in JavaScript and assert the
 * behaviour the business requires. They are a specification, not a
 * substitute for running the migrations on staging.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

const round2 = (n) => Math.round(n * 100) / 100;

/** Mirrors post_payment_to_ledger(). */
function postPayment({ amount, purpose, split = { macokasa: 0.8, quickthink: 0.2 } }) {
  const splittable = ["registration", "renewal"].includes(purpose);
  const qts = splittable ? round2(amount * split.quickthink) : 0;
  const mck = round2(amount - qts); // remainder, so rounding never leaks
  return { revenue: amount, macokasa: mck, quickthink: qts };
}

console.log("\nRevenue split");

test("80/20 split on a registration", () => {
  const r = postPayment({ amount: 15000, purpose: "registration" });
  assert.equal(r.revenue, 15000);
  assert.equal(r.macokasa, 12000);
  assert.equal(r.quickthink, 3000);
});

test("shares always reconstruct the total exactly", () => {
  for (const amount of [15000, 7500, 27500, 45000, 90000, 120000, 333.33, 1, 0.01, 99999.99]) {
    const r = postPayment({ amount, purpose: "renewal" });
    assert.equal(
      round2(r.macokasa + r.quickthink),
      round2(amount),
      `shares do not sum to ${amount}`
    );
  }
});

test("rounding never leaks value to Quick-Think", () => {
  // 0.01 * 0.2 = 0.002 -> rounds to 0.00, MACOKASA keeps the cent.
  const r = postPayment({ amount: 0.01, purpose: "registration" });
  assert.equal(r.quickthink, 0);
  assert.equal(r.macokasa, 0.01);
});

test("card and replacement fees are not split", () => {
  for (const purpose of ["card", "replacement", "donation", "other"]) {
    const r = postPayment({ amount: 10000, purpose });
    assert.equal(r.quickthink, 0, `${purpose} must not be split`);
    assert.equal(r.macokasa, 10000);
  }
});

test("split ratio is configurable, not fixed", () => {
  const r = postPayment({
    amount: 10000,
    purpose: "registration",
    split: { macokasa: 0.7, quickthink: 0.3 }
  });
  assert.equal(r.quickthink, 3000);
  assert.equal(r.macokasa, 7000);
});

console.log("\nBalances");

/** Mirrors v_balances. */
function balances(entries) {
  const sum = (codes) =>
    round2(entries.filter((e) => codes.includes(e.code)).reduce((t, e) => t + e.amount, 0));
  return {
    actual: sum(["REV-MEMBERSHIP"]),
    available: sum(["SHARE-MACOKASA", "MACOKASA-DRAW"]),
    quickthink: sum(["SHARE-QTS", "QTS-SETTLEMENT"]),
    custody: sum(["CUSTODY-CLERK", "CUSTODY-REMIT"])
  };
}

function ledgerFor(payments) {
  const entries = [];
  for (const p of payments) {
    const r = postPayment(p);
    entries.push({ code: "REV-MEMBERSHIP", amount: r.revenue });
    entries.push({ code: "SHARE-MACOKASA", amount: r.macokasa });
    entries.push({ code: "CUSTODY-CLERK", amount: r.revenue });
    if (r.quickthink > 0) entries.push({ code: "SHARE-QTS", amount: r.quickthink });
  }
  return entries;
}

test("actual is 100 percent, available is MACOKASA's share", () => {
  const l = ledgerFor([
    { amount: 15000, purpose: "registration" },
    { amount: 7500, purpose: "registration" }
  ]);
  const b = balances(l);
  assert.equal(b.actual, 22500, "actual must be the full amount collected");
  assert.equal(b.available, 18000, "available must be MACOKASA's 80 percent");
  assert.equal(b.quickthink, 4500);
});

test("paying Quick-Think does NOT reduce MACOKASA available", () => {
  const l = ledgerFor([{ amount: 100000, purpose: "registration" }]);
  const before = balances(l);
  assert.equal(before.available, 80000);
  assert.equal(before.quickthink, 20000);

  // Settlement: reduces QTS, books a MACOKASA expense that is NOT in
  // the available calculation.
  l.push({ code: "QTS-SETTLEMENT", amount: -20000 });
  l.push({ code: "EXP-PLATFORM-FEE", amount: -20000 });

  const after = balances(l);
  assert.equal(after.available, 80000, "MACOKASA available must be unchanged by a QTS payout");
  assert.equal(after.quickthink, 0, "QTS balance must be drawn down");
  assert.equal(after.actual, 100000, "actual revenue is historical and must not move");
});

test("MACOKASA withdrawals reduce available but not actual", () => {
  const l = ledgerFor([{ amount: 100000, purpose: "registration" }]);
  l.push({ code: "MACOKASA-DRAW", amount: -50000 });
  const b = balances(l);
  assert.equal(b.available, 30000);
  assert.equal(b.actual, 100000);
});

console.log("\nClerk custody");

test("every payment enters the collector's custody", () => {
  const l = ledgerFor([
    { amount: 15000, purpose: "registration" },
    { amount: 10000, purpose: "card" }
  ]);
  assert.equal(balances(l).custody, 25000, "all methods create a custody liability");
});

test("verified remittance clears custody", () => {
  const l = ledgerFor([{ amount: 15000, purpose: "registration" }]);
  l.push({ code: "CUSTODY-REMIT", amount: -15000 });
  assert.equal(balances(l).custody, 0);
});

console.log("\nSchema guarantees");

const core = readFileSync(new URL("../supabase/migrations/0001_platform_core.sql", import.meta.url), "utf8");
const members = readFileSync(new URL("../supabase/migrations/0002_macokasa_membership.sql", import.meta.url), "utf8");
const finance = readFileSync(new URL("../supabase/migrations/0003_finance.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../supabase/migrations/0004_workflow_and_config.sql", import.meta.url), "utf8");
const all = core + members + finance + workflow;

test("the ledger cannot be edited by any client role", () => {
  assert.match(finance, /revoke insert, update, delete on public\.ledger_entries from anon, authenticated/);
});

test("the audit log cannot be edited by any client role", () => {
  assert.match(core, /revoke insert, update, delete on public\.audit_log from anon, authenticated/);
});

test("a card cannot be printed twice without approval", () => {
  assert.match(members, /has already been printed/);
  assert.match(members, /reprint_approved_by is null/);
});

test("a card cannot be queued before payment", () => {
  assert.match(members, /cannot be queued before the membership fee is paid/);
});

test("Quick-Think cannot request more than is available", () => {
  assert.match(finance, /exceeds the available Quick-Think balance/);
});

test("a clerk cannot verify their own remittance", () => {
  assert.match(finance, /clerk_id <> auth\.uid\(\)/);
  assert.match(workflow, /A clerk may not verify their own remittance/);
});

test("a clerk cannot confirm a payment they collected", () => {
  assert.match(workflow, /Only finance or operations may confirm a payment/);
});

test("only operations may approve a reprint", () => {
  assert.match(workflow, /Only the operations manager may approve a reprint/);
});

test("fees are versioned, never overwritten", () => {
  assert.match(members, /effective_from date not null/);
  assert.match(members, /effective_to date/);
  assert.match(members, /function public\.current_fee/);
});

test("package benefits are rows, not code", () => {
  assert.match(members, /create table if not exists public\.package_benefits/);
});

test("revenue split is configuration", () => {
  assert.match(finance, /function public\.split_ratio/);
  assert.match(workflow, /'revenue_split'/);
});

test("configuration changes are versioned", () => {
  assert.match(core, /create table if not exists public\.tenant_settings_history/);
});

test("public verification exposes no sensitive data", () => {
  const fn = workflow.slice(workflow.indexOf("function public.verify_card"));
  const body = fn.slice(0, 2000);
  for (const field of ["phone", "national_id", "photo_path", "date_of_birth", "kin_"]) {
    assert.ok(!body.includes(field), `verify_card must not expose ${field}`);
  }
});

test("every business table is tenant scoped", () => {
  const tables = [
    "members", "vehicles", "memberships", "id_cards", "payments",
    "ledger_entries", "custody_records", "remittances", "qts_settlements", "expenses"
  ];
  for (const t of tables) {
    const re = new RegExp(`create table if not exists public\\.${t}[\\s\\S]*?\\n\\);`);
    const ddl = all.match(re);
    assert.ok(ddl, `${t} not found`);
    assert.match(ddl[0], /tenant_id uuid not null references public\.tenants/, `${t} missing tenant_id`);
  }
});

test("one person can be operator and owner at once", () => {
  assert.match(members, /is_operator boolean not null default true/);
  assert.match(members, /is_owner boolean not null default false/);
  assert.match(members, /constraint member_has_a_role check \(is_operator or is_owner\)/);
});

test("pedalist and motorist cards differ", () => {
  assert.match(members, /create type public\.operator_type as enum \('pedalist', 'motorist'\)/);
  assert.match(members, /design_variant/);
  assert.match(workflow, /case mem\.operator_type when 'motorist' then 'M' else 'P' end/);
});

test("membership numbers cannot collide across type or district", () => {
  const fn = members.slice(members.indexOf("function public.next_membership_no"));
  assert.match(fn.slice(0, 1200), /and m\.operator_type = p_type/);
  assert.match(fn.slice(0, 1200), /and m\.district_id = p_district/);
});

test("no self-registration path exists", () => {
  // Members may only be created by staff roles.
  const policy = members.slice(members.indexOf('create policy "Clerk create members"'));
  assert.match(policy.slice(0, 400), /platform_admin','tenant_admin','operations','clerk'/);
  assert.ok(!/to anon/.test(policy.slice(0, 400)), "anon must not create members");
});

console.log(`\n${passed} assertion group(s) passed.\n`);
