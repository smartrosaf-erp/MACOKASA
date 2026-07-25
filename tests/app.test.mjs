/**
 * Application tests.
 *
 * Modules that touch only logic are imported and exercised for real.
 * Modules that need a DOM are checked structurally. This is not a
 * substitute for clicking through the app on staging, but it catches
 * broken imports, bad escaping and drifted business rules.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

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

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

const src = new URL("../src/", import.meta.url);
const read = (p) => readFileSync(new URL(p, src), "utf8");

/* ---------------- Pure logic, imported for real ---------------- */

console.log("\nFormatting and validation");

const fmt = await import("../src/lib/format.js");
const dom = await import("../src/lib/dom.js");

test("escapes every HTML metacharacter", () => {
  assert.equal(dom.esc(`<script>alert("x")&'`), "&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;");
  assert.equal(dom.esc(null), "");
  assert.equal(dom.esc(undefined), "");
  assert.equal(dom.esc(0), "0");
});

test("normalises Malawi phone numbers", () => {
  assert.equal(fmt.normalisePhone("0991234567"), "+265991234567");
  assert.equal(fmt.normalisePhone("265991234567"), "+265991234567");
  assert.equal(fmt.normalisePhone("+265 991 234 567"), "+265991234567");
  assert.equal(fmt.normalisePhone(""), "");
});

test("validates Malawi mobile numbers", () => {
  assert.ok(fmt.isValidPhone("0991234567"), "Airtel 099 should pass");
  assert.ok(fmt.isValidPhone("0881234567"), "TNM 088 should pass");
  assert.ok(fmt.isValidPhone("+265991234567"));
  assert.ok(!fmt.isValidPhone("12345"), "too short must fail");
  assert.ok(!fmt.isValidPhone("+44 7700 900000"), "non-Malawi must fail");
  assert.ok(!fmt.isValidPhone(""), "empty must fail");
});

test("formats currency from tenant configuration", () => {
  fmt.configureFormatting({ currency: "MWK", locale: "en-MW" });
  assert.match(fmt.money(15000), /MWK/);
  assert.match(fmt.money(15000), /15,000/);
  fmt.configureFormatting({ currency: "USD" });
  assert.match(fmt.money(10), /USD/);
  fmt.configureFormatting({ currency: "MWK" });
});

test("builds a full name without stray spaces", () => {
  assert.equal(fmt.fullName({ first_name: "Joseph", last_name: "Banda" }), "Joseph Banda");
  assert.equal(
    fmt.fullName({ first_name: "Joseph", other_names: "K", last_name: "Banda" }),
    "Joseph K Banda"
  );
  assert.equal(fmt.fullName(null), "");
});

test("relativeDays is signed around today", () => {
  const future = new Date(Date.now() + 5 * 86400000).toISOString();
  const past = new Date(Date.now() - 5 * 86400000).toISOString();
  assert.ok(fmt.relativeDays(future) > 0);
  assert.ok(fmt.relativeDays(past) < 0);
  assert.equal(fmt.relativeDays(null), null);
});

/* ---------------- Module wiring ---------------- */

console.log("\nModule structure");

const modules = [
  "app.js",
  "lib/api.js",
  "lib/dom.js",
  "lib/format.js",
  "ui/components.js",
  "ui/icons.js",
  "ui/idcard.js",
  "ui/photo.js",
  "screens/dashboard.js",
  "screens/register.js",
  "screens/members.js",
  "screens/cards.js",
  "screens/finance.js",
  "screens/fleet.js",
  "screens/settings.js"
];

test("every module exists", () => {
  for (const m of modules) {
    assert.ok(existsSync(new URL(m, src)), `${m} missing`);
  }
});

test("no module imports a path that does not exist", () => {
  for (const m of modules) {
    const body = read(m);
    const imports = [...body.matchAll(/from\s+"(\.[^"]+)"/g)].map((x) => x[1]);
    for (const imp of imports) {
      const base = new URL(m, src);
      const resolved = new URL(imp, base);
      assert.ok(existsSync(resolved), `${m} imports missing ${imp}`);
    }
  }
});

test("screens expose the expected interface", () => {
  for (const s of ["dashboard", "register", "members", "cards", "finance", "fleet", "settings"]) {
    const body = read(`screens/${s}.js`);
    assert.match(body, /export (async )?function render/, `${s} has no render`);
  }
});

/* ---------------- Security properties ---------------- */

console.log("\nSecurity");

const api = read("lib/api.js");
const app = read("app.js");
const register = read("screens/register.js");

test("no hardcoded credentials anywhere in src", () => {
  for (const m of modules) {
    const body = read(m);
    assert.ok(!/password\s*[:=]\s*["'][^"']{6,}/i.test(body), `${m} contains a literal password`);
    assert.ok(!/portalPasswords/.test(body), `${m} references portalPasswords`);
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}\./.test(body), `${m} contains an embedded JWT`);
  }
});

test("sign-in failure never reveals whether an account exists", () => {
  assert.match(app, /Sign-in failed\. Check your email and password\./);
  assert.match(app, /If that account exists, a reset link has been sent\./);
});

test("photos are fetched through short-lived signed URLs", () => {
  assert.match(api, /createSignedUrl\([^)]*300\)/);
  assert.ok(!/getPublicUrl/.test(api), "must not use public storage URLs for member photos");
});

test("photo paths are tenant partitioned", () => {
  assert.match(api, /\$\{tenant\}\/\$\{memberId\}\/photo\.jpg/);
});

test("privileged actions go through database functions, not table writes", () => {
  for (const rpc of ["confirm_payment", "mark_card_printed", "approve_reprint", "verify_remittance", "pay_qts_settlement"]) {
    assert.ok(api.includes(rpc), `${rpc} is not called`);
  }
});

test("the client never writes to the ledger directly", () => {
  assert.ok(!/from\("ledger_entries"\)\s*\.\s*(insert|update|delete)/.test(api));
  assert.ok(!/from\("audit_log"\)\s*\.\s*(insert|update|delete)/.test(api));
});

/* ---------------- Business rules in the UI ---------------- */

console.log("\nBusiness rules");

const finance = read("screens/finance.js");
const cards = read("screens/cards.js");
const settings = read("screens/settings.js");
const fleet = read("screens/fleet.js");

test("registration confirms every step before saving", () => {
  assert.match(register, /confirmed\.add\(key\)/);
  assert.match(register, /function validateStep/);
  // Every step key must be validated at save time.
  assert.match(register, /\["type", "identity", "photo", "location", "package"\]\.map\(validateStep\)/);
});

test("registration can save without payment as pending_payment", () => {
  assert.match(register, /status: "pending_payment"/);
  assert.match(register, /Saving as pending payment/);
});

test("a member saved with payment enters the collector's custody", () => {
  assert.match(register, /collected_by: api\.state\.profile\.id/);
  assert.match(register, /This money enters your custody/);
});

test("payment confirmation is blocked for the collector by default", () => {
  assert.match(finance, /allow_clerk_self_confirm_payment/);
  assert.match(finance, /Another officer must confirm/);
});

test("a clerk cannot verify their own remittance in the UI either", () => {
  assert.match(finance, /r\.clerk_id === api\.state\.profile\.id/);
  assert.match(finance, /Another officer must verify/);
});

test("finance states that paying Quick-Think does not reduce Available", () => {
  assert.match(finance, /does not reduce MACOKASA Available/i);
  assert.match(finance, /split already happened/i);
});

test("settlements are capped at the available balance in the UI", () => {
  assert.match(finance, /Only \$\{money\(available\)\} is available|amount > available/);
});

test("printing warns that a card prints once", () => {
  assert.match(cards, /can only be printed once/i);
  assert.match(cards, /operations manager/i);
});

test("reprint approval is restricted to operations", () => {
  assert.match(cards, /hasRole\("platform_admin", "tenant_admin", "operations"\)/);
});

test("the print queue groups by district, area and clerk", () => {
  assert.match(cards, /grouping === "district"/);
  assert.match(cards, /clerk_name/);
});

test("fees are repriced by versioning, never overwritten", () => {
  assert.match(api, /effective_to: today/);
  assert.match(settings, /Fees are versioned, never overwritten/);
});

test("the revenue split must total exactly 100", () => {
  assert.match(settings, /must total exactly 100%/);
  assert.match(settings, /mck \+ qts !== 100/);
});

test("benefits are data, added without a deploy", () => {
  assert.match(settings, /Benefits are data, not code/);
  assert.match(api, /function addBenefit/);
});

test("fleet refuses to pair a vehicle with the wrong operator type", () => {
  assert.match(fleet, /operatorType: vehicle\.vehicle_type/);
  assert.match(fleet, /MACOKASA-verified operators only/);
});

test("fleet only offers active members as operators", () => {
  assert.match(fleet, /status: "active"/);
});

/* ---------------- ID cards ---------------- */

console.log("\nID cards");

const idcard = read("ui/idcard.js");
const css = read("styles.css");

test("pedalist and motorist cards carry different bands", () => {
  assert.match(idcard, /PEDAL TAXI/);
  assert.match(idcard, /MOTORCYCLE TAXI/);
});

test("card styling differs by type", () => {
  assert.match(css, /\.id-card\.motorist/);
  assert.match(css, /\.id-card\.pedalist/);
  assert.match(css, /--cat: var\(--motor\)/);
  assert.match(css, /--cat: var\(--pedal\)/);
});

test("card colours survive printing", () => {
  assert.match(css, /print-color-adjust: exact/);
});

test("the card shows the correct vehicle label per type", () => {
  assert.match(idcard, /pedal \? "Bicycle ID" : "Plate"/);
});

/* ---------------- Accessibility ---------------- */

console.log("\nAccessibility");

test("a skip link and focus styling exist", () => {
  assert.match(app, /class="skip-link"/);
  assert.match(css, /\.skip-link/);
  assert.match(css, /focus-visible/);
});

test("motion is disabled when the user asks for that", () => {
  assert.match(css, /prefers-reduced-motion/);
});

test("modals declare a dialog role", () => {
  const comp = read("ui/components.js");
  assert.match(comp, /role="dialog"/);
  assert.match(comp, /aria-modal="true"/);
});

test("toasts announce politely", () => {
  const comp = read("ui/components.js");
  assert.match(comp, /aria-live", "polite/);
});

console.log(`\n${passed} assertion group(s) passed.\n`);
