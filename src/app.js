/**
 * MACOKASA operations platform — application shell.
 *
 * Tenant #2 on the Quick-Think multi-tenant platform. Staff-only:
 * there is no public self-registration, by design.
 */

import { esc, html, $ } from "./lib/dom.js";
import { icon } from "./ui/icons.js";
import { notify, banner, loading, closeModal } from "./ui/components.js";
import { configureFormatting, initials } from "./lib/format.js";
import { stopCamera } from "./ui/photo.js";
import * as api from "./lib/api.js";

import * as dashboard from "./screens/dashboard.js";
import * as register from "./screens/register.js";
import * as members from "./screens/members.js";
import * as cards from "./screens/cards.js";
import * as finance from "./screens/finance.js";
import * as fleet from "./screens/fleet.js";
import * as settings from "./screens/settings.js";

const root = document.querySelector("#app");

const SCREENS = {
  dashboard: {
    label: "Dashboard",
    icon: "dashboard",
    module: null,
    roles: ["platform_admin", "tenant_admin", "operations", "finance", "clerk", "printing", "viewer"],
    mod: dashboard,
    title: "Dashboard",
    sub: "Membership and operations at a glance"
  },
  register: {
    label: "Register member",
    icon: "userPlus",
    module: "registration",
    roles: ["platform_admin", "tenant_admin", "operations", "clerk"],
    mod: register,
    title: "Register a member",
    sub: "Capture, confirm, then save"
  },
  members: {
    label: "Members",
    icon: "users",
    module: "members",
    roles: ["platform_admin", "tenant_admin", "operations", "finance", "clerk", "printing", "viewer"],
    mod: members,
    title: "Members",
    sub: "Search the national Kabaza register"
  },
  cards: {
    label: "Card production",
    icon: "printer",
    module: "cards",
    roles: ["platform_admin", "tenant_admin", "operations", "printing"],
    mod: cards,
    title: "Card production",
    sub: "Sorted by district, area and filing clerk"
  },
  finance: {
    label: "Finance",
    icon: "wallet",
    module: "finance",
    roles: ["platform_admin", "tenant_admin", "operations", "finance", "clerk"],
    mod: finance,
    title: "Finance",
    sub: "Balances, custody, remittances and settlements"
  },
  fleet: {
    label: "Fleet and owners",
    icon: "motorcycle",
    module: "fleet",
    roles: ["platform_admin", "tenant_admin", "operations", "clerk", "viewer"],
    mod: fleet,
    title: "Fleet and owners",
    sub: "Vehicles, assignments and trusted operators"
  },
  settings: {
    label: "Settings",
    icon: "settings",
    module: "settings",
    roles: ["platform_admin", "tenant_admin"],
    mod: settings,
    title: "Settings",
    sub: "Packages, fees, revenue split and configuration"
  }
};

const NAV_GROUPS = [
  { title: "Operations", keys: ["dashboard", "register", "members", "cards"] },
  { title: "Business", keys: ["finance", "fleet"] },
  { title: "Administration", keys: ["settings"] }
];

let current = "dashboard";
let sidebarOpen = false;
let booting = true;

/* ---------------- Boot ---------------- */

init();

async function init() {
  installErrorHandling();
  paint(shell(loading("Starting MACOKASA…")));

  // Public card verification runs before any authentication.
  const token = new URLSearchParams(window.location.search).get("verify");
  if (token) return renderVerification(token);

  if (!api.isConfigured()) {
    paint(notConfigured());
    booting = false;
    return;
  }

  try {
    await api.initClient();
    await api.restoreSession();
  } catch (error) {
    console.error(error);
  }

  booting = false;
  applyTenantFormatting();
  await route();
}

function applyTenantFormatting() {
  configureFormatting({
    currency: api.state.tenant?.currency || "MWK",
    locale: api.state.tenant?.locale || "en-MW"
  });
}

/* ---------------- Routing ---------------- */

function allowedScreens() {
  return Object.entries(SCREENS).filter(
    ([key, s]) => s.roles.includes(api.role()) && (!s.module || api.moduleEnabled(s.module))
  );
}

async function route(opts = {}) {
  if (!api.state.profile) return paint(signInScreen());

  const allowed = allowedScreens().map(([k]) => k);
  if (!allowed.includes(current)) current = allowed[0] || "dashboard";

  const screen = SCREENS[current];
  paint(shell(loading()));

  try {
    if (screen.mod.load) await screen.mod.load();
    const body = await screen.mod.render();
    paint(shell(body));
    const host = $("[data-screen]");
    screen.mod.bind?.(host, (o) => route(o));
    if (opts.preserveFocus) {
      const el = $(opts.preserveFocus);
      if (el) {
        el.focus();
        el.setSelectionRange?.(el.value.length, el.value.length);
      }
    }
  } catch (error) {
    console.error(error);
    paint(shell(banner("danger", "This screen could not load", error.message || "Unknown error")));
  }
}

function go(key) {
  if (current === key) return;
  stopCamera();
  closeModal();
  current = key;
  sidebarOpen = false;
  void route();
}

/* ---------------- Shell ---------------- */

function shell(body) {
  const screen = SCREENS[current] || SCREENS.dashboard;
  const p = api.state.profile;
  const t = api.state.tenant;

  return html`
    <a class="skip-link" href="#main">Skip to content</a>
    <div class="shell">
      <aside class="sidebar ${sidebarOpen ? "open" : ""}" data-sidebar>
        <div class="sidebar-brand">
          <img src="./assets/macokasa-logo-square.png" alt="" />
          <div>
            <strong>${esc(t?.name || "MACOKASA")}</strong>
            <span>OPERATIONS PLATFORM</span>
          </div>
        </div>

        <nav class="sidebar-nav" aria-label="Main">
          ${NAV_GROUPS.map((group) => {
            const items = group.keys.filter(
              (k) => SCREENS[k].roles.includes(api.role()) && (!SCREENS[k].module || api.moduleEnabled(SCREENS[k].module))
            );
            if (!items.length) return "";
            return html`
              <div class="nav-section">${esc(group.title)}</div>
              ${items
                .map(
                  (k) => html`
                    <button class="nav-btn ${current === k ? "active" : ""}" data-go="${k}" type="button">
                      ${icon(SCREENS[k].icon)}<span>${esc(SCREENS[k].label)}</span>
                    </button>
                  `
                )
                .join("")}
            `;
          }).join("")}
        </nav>

        <div class="sidebar-foot">
          <div class="user-chip">
            <span class="avatar">${esc(initialsOf(p?.full_name))}</span>
            <div>
              <strong>${esc(p?.full_name || "User")}</strong>
              <span>${esc(String(p?.role || "").replace(/_/g, " "))}</span>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm btn-block" data-act="signout" type="button">
            ${icon("logout")} Sign out
          </button>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <button class="btn btn-icon btn-ghost menu-toggle" data-act="menu" type="button" aria-label="Menu">
            ${icon("menu")}
          </button>
          <div>
            <h1>${esc(screen.title)}</h1>
            <div class="topbar-sub">${esc(screen.sub)}</div>
          </div>
          <div class="topbar-actions">
            ${tenantStatusChip()}
          </div>
        </header>

        <main class="content" id="main" data-screen>
          ${tenantBanner()}
          ${body}
        </main>
      </div>
    </div>
    ${api.DEMO ? `<div class="demo-ribbon"><i></i>Demonstration data</div>` : ""}
  `;
}

function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function tenantStatusChip() {
  const s = api.state.tenant?.status;
  if (!s || s === "active") return "";
  const tone = s === "grace" ? "amber" : "red";
  return `<span class="badge badge-${tone}">${esc(String(s).replace(/_/g, " "))}</span>`;
}

function tenantBanner() {
  const s = api.state.tenant?.status;
  if (s === "grace") {
    return banner(
      "warn",
      "Payment due",
      "This workspace is in its grace period. Settle the outstanding invoice to avoid interruption."
    );
  }
  if (s === "read_only") {
    return banner(
      "danger",
      "Read only",
      "This workspace is read-only pending payment. Records remain safe and visible but cannot be changed."
    );
  }
  if (s === "suspended") {
    return banner(
      "danger",
      "Suspended",
      "This workspace is suspended. Your data is retained. Contact Quick-Think Solution to reactivate."
    );
  }
  return "";
}

/* ---------------- Sign in ---------------- */

let signingIn = false;

function signInScreen() {
  return html`
    <div class="auth-screen">
      <div class="auth-art">
        <div class="art-brand">
          <img src="./assets/macokasa-logo-square.png" alt="" />
          <div>
            <strong>MACOKASA</strong>
            <span>Malawi Coalition for Kabaza Stakeholders Association</span>
          </div>
        </div>
        <h2>The national Kabaza register</h2>
        <p>
          Membership, identity cards, fleet management and finance for pedal and motorcycle taxi
          operators across Malawi.
        </p>
      </div>

      <form class="auth-form" data-form="signin">
        <div>
          <h1>Staff sign in</h1>
          <p class="sub">Accounts are issued by MACOKASA administrators.</p>
        </div>

        ${
          api.state.session && !api.state.profile
            ? banner(
                "warn",
                "No workspace linked",
                "This account is not attached to a tenant. An administrator must assign your role."
              )
            : ""
        }

        <label class="field"><span>Work email</span>
          <input class="input" type="email" name="email" required autocomplete="username"
            autocapitalize="none" spellcheck="false" />
        </label>
        <label class="field"><span>Password</span>
          <input class="input" type="password" name="password" required autocomplete="current-password" />
        </label>

        <button class="btn btn-primary btn-block" type="submit" ${signingIn ? "disabled" : ""}>
          ${signingIn ? "Signing in…" : "Sign in"}
        </button>
        <button class="btn btn-ghost btn-block" type="button" data-act="reset">Forgot password</button>

        ${api.DEMO ? demoRoleChooser() : ""}

        <p class="hint" style="text-align:center">
          Access is logged and audited. There is no public self-registration.
        </p>
      </form>
    </div>
  `;
}

const DEMO_ROLES = [
  ["admin@macokasa.org", "Ruth Mbewe", "Administrator", "Everything, including settings and fees"],
  ["clerk@macokasa.org", "Patrick Mvula", "Data clerk", "Register members and take payment"],
  ["finance@macokasa.org", "Esther Nyirenda", "Finance", "Confirm payments, verify remittances, settle"],
  ["printing@macokasa.org", "Samuel Nyasulu", "Printing", "Work the card queue"],
  ["operations@macokasa.org", "Daniel Kaunda", "Operations", "Approve reprints and oversee dispatch"],
  ["billing@quickthinks.com", "Quick-Think", "Platform", "Raise settlement invoices"]
];

function demoRoleChooser() {
  return html`
    <div class="demo-panel">
      <div class="demo-panel-head">
        ${icon("info")}
        <div>
          <strong>Demonstration mode</strong>
          <span>Sample data, no database. Sign in as any role to explore.</span>
        </div>
      </div>
      <div class="demo-roles">
        ${DEMO_ROLES.map(
          ([email, name, role, note]) => html`
            <button class="demo-role" type="button" data-demo-login="${esc(email)}">
              <strong>${esc(role)}</strong>
              <span>${esc(name)}</span>
              <small>${esc(note)}</small>
            </button>
          `
        ).join("")}
      </div>
    </div>
  `;
}

function notConfigured() {
  return html`
    <div class="auth-screen">
      <div class="auth-art">
        <div class="art-brand">
          <img src="./assets/macokasa-logo-square.png" alt="" />
          <div><strong>MACOKASA</strong><span>Operations platform</span></div>
        </div>
        <h2>Not connected</h2>
        <p>This build has no database configured.</p>
      </div>
      <div class="auth-form">
        <h1>Configuration needed</h1>
        ${banner(
          "warn",
          "No Supabase connection",
          "Set SUPABASE_URL and SUPABASE_ANON_KEY, then run npm run build. The platform cannot operate on local data — membership, money and cards all live in the database."
        )}
        <p class="hint">See docs/DEPLOYMENT.md for the full runbook.</p>
      </div>
    </div>
  `;
}

/* ---------------- Public verification ---------------- */

async function renderVerification(token) {
  paint(`<div class="verify-page">${loading("Checking this card…")}</div>`);
  try {
    if (!api.state.client) await api.initClient();
    const result = await api.verifyCard(token);
    if (!result) {
      paint(verificationCard(null));
      return;
    }
    paint(verificationCard(result));
  } catch (error) {
    console.error(error);
    paint(verificationCard(null, error.message));
  }
}

function verificationCard(r, errorMessage) {
  if (!r) {
    return html`
      <div class="verify-page">
        <div class="verify-card">
          <div class="verify-mark bad">${icon("xCircle")}</div>
          <h1>Card not recognised</h1>
          <p style="color:var(--muted)">
            ${esc(errorMessage || "This QR code does not match any MACOKASA membership card.")}
          </p>
        </div>
      </div>
    `;
  }

  const valid = r.valid === true;
  return html`
    <div class="verify-page">
      <div class="verify-card">
        <div class="verify-mark ${valid ? "ok" : "bad"}">${icon(valid ? "checkCircle" : "xCircle")}</div>
        <h1>${valid ? "Valid membership" : "Not currently valid"}</h1>
        <p style="color:var(--muted);margin-bottom:20px">
          ${valid
            ? "This member is registered with MACOKASA and their membership is current."
            : `This card exists but the membership status is ${esc(String(r.status).replace(/_/g, " "))}.`}
        </p>
        <dl class="kv" style="text-align:left">
          <dt>Name</dt><dd>${esc(r.member_name)}</dd>
          <dt>Membership no.</dt><dd>${esc(r.membership_no || "—")}</dd>
          <dt>Type</dt><dd>${esc(r.operator_type === "pedalist" ? "Pedal taxi" : "Motorcycle taxi")}</dd>
          <dt>Package</dt><dd>${esc(r.package_name || "—")}</dd>
          <dt>District</dt><dd>${esc(r.district || "—")}</dd>
          <dt>Valid to</dt><dd>${esc(r.expires_on || "—")}</dd>
        </dl>
        <p class="hint" style="margin-top:20px">
          Verified against the MACOKASA national register.
        </p>
      </div>
    </div>
  `;
}

/* ---------------- Paint and global events ---------------- */

function paint(markup) {
  root.innerHTML = markup;
}

document.addEventListener("click", async (event) => {
  const goKey = event.target.closest("[data-go]")?.dataset.go;
  if (goKey) return go(goKey);

  // Demo role buttons carry no data-act, so they must be handled
  // before the guard below.
  const demoEmail = event.target.closest("[data-demo-login]")?.dataset.demoLogin;
  if (demoEmail) {
    try {
      await api.signIn(demoEmail, "demo");
      applyTenantFormatting();
      notify.ok(`Signed in as ${api.state.profile.full_name}.`);
      current = "dashboard";
      await route();
    } catch (error) {
      notify.err(error.message);
    }
    return;
  }

  const act = event.target.closest("[data-act]")?.dataset.act;
  if (!act) return;

  if (act === "menu") {
    sidebarOpen = !sidebarOpen;
    $("[data-sidebar]")?.classList.toggle("open", sidebarOpen);
    return;
  }

  if (act === "signout") {
    await api.signOut();
    current = "dashboard";
    notify.info("Signed out.");
    void route();
    return;
  }

  if (act === "reset") {
    const email = window.prompt("Enter your work email to receive a reset link:");
    if (!email) return;
    await api.requestPasswordReset(email);
    // Deliberately identical whether or not the account exists.
    notify.info("If that account exists, a reset link has been sent.");
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest('[data-form="signin"]');
  if (!form) return;
  event.preventDefault();
  if (signingIn) return;

  const email = form.email.value;
  const password = form.password.value;

  signingIn = true;
  paint(signInScreen());

  try {
    const profile = await api.signIn(email, password);
    if (!profile) {
      notify.err("No MACOKASA profile is linked to this account.");
      await api.signOut();
    } else if (!profile.is_active) {
      notify.err("This account has been deactivated.");
      await api.signOut();
    } else if (!profile.tenant_id) {
      notify.err("Your account is not attached to a workspace.");
    } else {
      applyTenantFormatting();
      notify.ok(`Welcome back, ${profile.full_name || "colleague"}.`);
    }
  } catch (error) {
    console.error(error);
    // Generic on purpose: never reveal whether an email exists.
    notify.err("Sign-in failed. Check your email and password.");
  } finally {
    signingIn = false;
    await route();
  }
});

window.addEventListener("online", () => {
  api.state.online = true;
  notify.ok("Back online.");
});

window.addEventListener("offline", () => {
  api.state.online = false;
  notify.warn("You are offline. Saving will fail until the connection returns.");
});

/* ---------------- Error handling ---------------- */

function installErrorHandling() {
  window.addEventListener("error", (e) => report(e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => report(e.reason));
}

function report(error) {
  console.error("[MACOKASA]", error);
  if (booting || !root.innerHTML.trim()) {
    root.innerHTML = html`
      <div class="verify-page">
        <div class="verify-card">
          <div class="verify-mark bad">${icon("alert")}</div>
          <h1>Something went wrong</h1>
          <p style="color:var(--muted)">
            The platform could not finish loading. No data has been changed.
          </p>
          <button class="btn btn-primary" onclick="window.location.reload()">Reload</button>
          <details style="margin-top:16px;text-align:left">
            <summary class="hint">Technical detail</summary>
            <pre style="overflow:auto;font-size:0.72rem;background:#0f1b28;color:#9fe8ad;padding:10px;border-radius:8px">${esc(
              String(error?.stack || error || "Unknown")
            ).slice(0, 800)}</pre>
          </details>
        </div>
      </div>
    `;
  } else {
    notify.err("Something went wrong. Your last action may not have been saved.");
  }
}
