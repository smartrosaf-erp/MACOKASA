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

/* ---------------- Public website ---------------- */

console.log("\nPublic website");

const site = read("screens/site.js");

test("the site renders before any authentication", () => {
  assert.match(app, /let view = "site"/);
  assert.match(app, /if \(view === "site"\) return showSite\(\)/);
});

test("view is declared before init runs", () => {
  // A temporal dead zone here crashes the whole app on load.
  const declIndex = app.indexOf('let view = "site"');
  const initCall = app.indexOf("\ninit();");
  assert.ok(declIndex > -1, "view is not declared");
  assert.ok(initCall === -1 || declIndex < initCall, "view must be declared before init() is called");
});

test("the site offers a portal route and a verification route", () => {
  assert.match(site, /data-open-portal/);
  assert.match(site, /data-verify-form/);
});

test("pricing is driven by configured fees, never hardcoded", () => {
  assert.ok(!/\b(15000|7500|25000|45000)\b/.test(site), "site must not hardcode fee amounts");
  assert.match(app, /function publicTiers/);
});

test("the site never claims figures it cannot prove", () => {
  // Guard against invented member counts in marketing copy.
  assert.ok(!/[0-9],[0-9]{3}\+? (members|operators|riders)/i.test(site));
});

test("hidden beats display so only one fee panel shows", () => {
  assert.match(css, /\[hidden\] \{ display: none !important; \}/);
});

test("the burger only appears once the nav collapses", () => {
  assert.match(css, /\.burger \{ display: none !important; \}/);
  assert.match(css, /\.burger \{ display: inline-flex !important; \}/);
});

test("every nav link resolves to a real page", () => {
  // Each header link must be a routable page, not a scroll anchor.
  const declared = [...site.matchAll(/data-page="(\w+)"/g)].map((m) => m[1]);
  const pages = ["home", "about", "membership", "owners", "fees", "verify", "contact"];
  for (const target of new Set(declared)) {
    assert.ok(pages.includes(target), `nav points at unknown page: ${target}`);
  }
  assert.match(site, /export const PAGES = \[/);
});

test("navigation opens pages rather than scrolling to anchors", () => {
  // A jump-link implementation would call scrollIntoView on nav click.
  assert.ok(!/onNavigate[\s\S]{0,200}scrollIntoView/.test(app),
    "navigation must not scroll to an anchor");
  assert.match(app, /function goToPage/);
  assert.match(app, /window\.history\.pushState/);
});

test("each page has its own document title", () => {
  assert.match(site, /export function pageTitle/);
  assert.match(app, /document\.title = pageTitle\(sitePage\)/);
});

test("browser back and forward move between pages", () => {
  assert.match(app, /addEventListener\("popstate"/);
  assert.match(app, /function pageFromHash/);
});

test("changing page resets the scroll position", () => {
  const fn = app.slice(app.indexOf("function goToPage"));
  assert.match(fn.slice(0, 500), /window\.scrollTo\(\{ top: 0/);
});

test("the display face is an editorial serif", () => {
  assert.match(css, /--display: "Source Serif 4"/);
  assert.match(css, /--sans: "Inter"/);
});

/* ---------------- Multi-tenant adoption ---------------- */

console.log("\nAdoption into the shared project");

const preflight = readFileSync(new URL("../supabase/migrations/0000_preflight_inspect.sql", import.meta.url), "utf8");
const adopt = readFileSync(new URL("../supabase/migrations/0001a_adopt_existing_profiles.sql", import.meta.url), "utf8");
const workflow2 = readFileSync(new URL("../supabase/migrations/0004_workflow_and_config.sql", import.meta.url), "utf8");

test("preflight only reads, never writes", () => {
  for (const verb of ["insert into", "update ", "delete from", "drop ", "alter table", "create table"]) {
    assert.ok(!new RegExp(`\\n\\s*${verb}`, "i").test(preflight),
      `preflight must not contain "${verb.trim()}"`);
  }
});

test("adoption extends profiles instead of replacing it", () => {
  assert.ok(!/drop table[^\n]*profiles/i.test(adopt), "must never drop profiles");
  assert.match(adopt, /alter table public\.profiles\s+add column if not exists tenant_id/);
  assert.match(adopt, /add column if not exists platform_role/);
});

test("adoption keeps the platform role separate from any existing role column", () => {
  assert.match(adopt, /platform_role public\.platform_role/);
  // It must not redefine or overwrite a pre-existing `role` column.
  assert.ok(!/alter table public\.profiles[\s\S]{0,80}add column if not exists role\b/.test(adopt));
});

test("existing users are assigned to the ROSAF tenant, not orphaned", () => {
  assert.match(adopt, /update public\.profiles[\s\S]{0,160}slug = 'smartrosaf'/);
});

test("adoption never enables RLS on a table it did not create", () => {
  const created = [...adopt.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  const rlsOn = [...adopt.matchAll(/alter table public\.(\w+) enable row level security/g)].map((m) => m[1]);
  for (const t of rlsOn) {
    // profiles is the one exception: policies are additive and named distinctly.
    if (t === "profiles") continue;
    assert.ok(created.includes(t), `enables RLS on ${t}, which it did not create`);
  }
});

test("shared infrastructure is namespaced to avoid ROSAF collisions", () => {
  assert.match(adopt, /create table if not exists public\.platform_audit_log/);
  assert.match(adopt, /create table if not exists public\.platform_notifications/);
});

test("notifications route to whichever table exists", () => {
  assert.match(workflow2, /function public\.queue_notification/);
  assert.match(workflow2, /to_regclass\('public\.platform_notifications'\)/);
  // Only the router itself may touch a bare notifications table; the
  // workflow functions must go through queue_notification().
  const router = workflow2.slice(
    workflow2.indexOf("function public.queue_notification"),
    workflow2.indexOf("function public.confirm_payment")
  );
  const outside = workflow2.replace(router, "");
  assert.ok(!/insert into public\.notifications/.test(outside),
    "a workflow function inserts directly instead of using queue_notification()");
  assert.match(workflow2, /perform public\.queue_notification/);
});

test("the client reads platform_role with a fallback to role", () => {
  assert.match(api, /platform_role/);
  assert.match(api, /role: adopted\.data\.platform_role/);
});

test("both tenants are seeded", () => {
  assert.match(adopt, /'smartrosaf'/);
  assert.match(adopt, /'macokasa'/);
});


const verifier = readFileSync(new URL("../supabase/migrations/0000b_verify_rosaf_untouched.sql", import.meta.url), "utf8");

test("the post-migration verifier is read-only", () => {
  for (const verb of ["insert into", "update ", "delete from", "drop ", "alter table", "create table", "truncate"]) {
    assert.ok(!new RegExp(`\\n\\s*${verb}`, "i").test(verifier),
      `verifier must not contain "${verb.trim()}"`);
  }
});

test("the verifier checks RLS was not enabled on ROSAF tables", () => {
  assert.match(verifier, /RLS enabled on a table MACOKASA did not create/);
  assert.match(verifier, /rowsecurity = true/);
});

test("the verifier proves the ledger stays append-only", () => {
  assert.match(verifier, /has_table_privilege\('authenticated'/);
  assert.match(verifier, /ledger is append-only/);
});

test("the verifier proves the photo bucket is private", () => {
  assert.match(verifier, /member-photos bucket is private/);
});

test("every check reports PASS or FAIL", () => {
  const checks = (verifier.match(/as result/g) || []).length;
  assert.ok(checks >= 8, `expected at least 8 checks, found ${checks}`);
});

test("the go-live guide rehearses on staging before production", () => {
  const guide = readFileSync(new URL("../docs/GO-LIVE.md", import.meta.url), "utf8");
  const staging = guide.indexOf("Phase 0");
  const prod = guide.indexOf("Phase 5");
  assert.ok(staging > -1 && prod > staging, "staging rehearsal must come before production");
  assert.match(guide, /pg_restore/, "guide must document the rollback");
  assert.match(guide, /Rehearse the rollback/, "the rollback itself must be rehearsed");
});

console.log(`\n${passed} assertion group(s) passed.\n`);
