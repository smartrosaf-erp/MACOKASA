import { affiliatedMembers, demoState, districts, membershipPlans, paymentMethods, publicSources, reminderDays, stakeholders } from "./data.js";

const config = window.MACOKASA_CONFIG || {};
const app = document.querySelector("#app");
const storageKey = "macokasa-kabaza-state-v2";
const collections = ["operators", "owners", "motorcycles", "payments", "cards", "cooperatives", "fundEntries", "donations", "financeEntries", "reminderLogs"];
let activeSection = "public";
let activeRole = "public";
let toastTimer = null;
let supabaseClient = null;
let supabaseEnabled = false;
let unlockedRoles = new Set(["public"]);
let pendingRole = "";
let ownerFundFilterId = "all";
let donationChoice = { method: "card", amount: "50000" };
let subscriptionChoice = { method: "airtel", amount: "15000" };
let state = loadState();

const navItems = [
  ["public", "Home", iconHome, ["public"]],
  ["registration", "Public registration", iconRegistry, ["public"]],
  ["staff", "Staff ERP dashboard", iconDashboard, ["staff"]],
  ["operators", "Operator database", iconRegistry, ["staff"]],
  ["membership", "Membership and reminders", iconBell, ["staff"]],
  ["payments", "Finance", iconPayment, ["staff"]],
  ["cards", "ID cards and QR", iconCard, ["staff", "printing"]],
  ["owners", "Owner portal", iconMotorcycle, ["owner", "staff"]],
  ["safety", "Licensing and safety", iconShield, ["staff"]],
  ["cooperatives", "Cooperative loans", iconCoop, ["staff"]],
  ["analytics", "Impact analytics", iconChart, ["public"]],
  ["operations", "Operations control", iconCloud, ["staff"]]
];

init();

function init() {
  render();
  void connectSupabase();
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("input", handleInput);
  document.addEventListener("submit", handleSubmit);
}

function loadState() {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      const normalized = normalizeState({ ...clone(demoState), ...JSON.parse(stored) });
      window.localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(collections.map((key) => [key, normalized[key] || []]))));
      return normalized;
    }
  } catch {
    return normalizeState(clone(demoState));
  }
  return normalizeState(clone(demoState));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeState(value) {
  const legacyGateway = ["Pay", "Changu"].join("");
  const scrubbed = JSON.stringify(value)
    .replace(new RegExp(`AirtelMoney via ${legacyGateway}`, "g"), "AirtelMoney")
    .replace(new RegExp(`Mpamba via ${legacyGateway}`, "g"), "Mpamba")
    .replace(new RegExp(`Bank Card via ${legacyGateway}`, "g"), "Bank Card")
    .replace(new RegExp(`Pending ${legacyGateway} checkout`, "g"), "Pending payment")
    .replace(new RegExp(`${legacyGateway} gateway`, "g"), "MACOKASA payment options")
    .replace(/through MACOKASA payment options/g, "using MACOKASA payment options")
    .replace(new RegExp(legacyGateway, "gi"), "MACOKASA payments");
  return JSON.parse(scrubbed);
}

function persist() {
  window.localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(collections.map((key) => [key, state[key] || []]))));
}

async function connectSupabase() {
  if (!config.supabaseUrl || !config.supabaseAnonKey || config.useDemoData) return;
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data, error } = await supabaseClient.from("macokasa_records").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    const grouped = {};
    (data || []).forEach((row) => {
      grouped[row.collection] = grouped[row.collection] || [];
      grouped[row.collection].push({ ...row.payload, _remoteId: row.id });
    });
    collections.forEach((collection) => {
      if (grouped[collection]?.length) state[collection] = grouped[collection];
    });
    supabaseEnabled = true;
    render();
    showToast("Live records loaded.");
  } catch (error) {
    console.error(error);
    showToast("Records are available on this device.");
  }
}

async function addRecord(collection, record) {
  state[collection] = [record, ...(state[collection] || [])];
  persist();
  render();
  if (supabaseEnabled && supabaseClient) {
    const { error } = await supabaseClient.from("macokasa_records").insert({ collection, payload: record });
    if (error) showToast(`Saved on this device. Live sync needs attention.`);
  }
}

async function updateRecord(collection, id, updates) {
  state[collection] = (state[collection] || []).map((record) => record.id === id ? { ...record, ...updates } : record);
  persist();
  render();
  const remote = state[collection].find((record) => record.id === id)?._remoteId;
  if (supabaseEnabled && supabaseClient && remote) {
    const payload = state[collection].find((record) => record.id === id);
    const { error } = await supabaseClient.from("macokasa_records").update({ payload }).eq("id", remote);
    if (error) showToast(`Updated on this device. Live sync needs attention.`);
  }
}

function render() {
  if (!navItems.some(([key, , , roles]) => key === activeSection && roles.includes(activeRole))) {
    activeSection = activeRole === "owner" ? "owners" : activeRole === "printing" ? "cards" : "public";
  }
  const roleUnlocked = unlockedRoles.has(activeRole);
  const showSidebar = activeRole !== "public" && roleUnlocked;
  const visibleNavItems = showSidebar ? navItems.filter(([, , , roles]) => roles.includes(activeRole)) : [];
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <img src="./assets/macokasa-logo.png" alt="MACOKASA logo" />
          <div class="brand-title">
            <strong>MACOKASA</strong>
            <span>Kabaza Operator and Stakeholder Information Management System</span>
          </div>
        </div>
        ${activeRole === "public" ? `
          <nav class="site-nav" aria-label="Website navigation">
            <button type="button" data-jump="catalogue">Catalogue</button>
            <button type="button" data-jump="about">About us</button>
            <button type="button" data-section="registration">Public registration</button>
            <button type="button" data-section="analytics">Impact analytics</button>
          </nav>
        ` : ""}
        <div class="top-actions">
          <select class="role-switcher" data-role-switcher aria-label="Current portal role">
            ${roleOption("public", "Public visitor")}
            ${roleOption("owner", "Motorcycle owner")}
            ${roleOption("staff", "MACOKASA staff")}
            ${roleOption("printing", "Printing authority")}
          </select>
          ${activeRole === "public" ? `<button class="secondary-btn" type="button" data-section="registration">Join MACOKASA</button>` : ""}
          ${activeRole !== "public" && roleUnlocked ? `<button class="quiet-btn" type="button" data-action="logout">Lock portal</button>` : ""}
        </div>
      </header>
      <div class="layout ${showSidebar ? "" : "no-sidebar"}">
        ${showSidebar ? `
          <aside class="sidebar">
            <nav class="nav-group" aria-label="MACOKASA modules">
              ${visibleNavItems
                .map(([key, label, icon]) => `
                  <button class="nav-button ${activeSection === key ? "active" : ""}" type="button" data-section="${key}">
                    ${icon()} <span>${label}</span>
                  </button>
                `).join("")}
            </nav>
          </aside>
        ` : ""}
        <main class="workspace">${roleUnlocked ? renderActiveSection() : renderPortalLogin()}</main>
      </div>
      <div class="toast" role="status" aria-live="polite"></div>
    </div>
  `;
  requestAnimationFrame(() => {
    renderQrCodes();
    updateCardPreviewFromForm();
  });
}

function roleOption(value, label) {
  return `<option value="${value}" ${activeRole === value ? "selected" : ""}>${label}</option>`;
}

function renderActiveSection() {
  const sections = {
    public: renderPublicWebsite,
    registration: renderRegistration,
    staff: renderStaffDashboard,
    operators: renderOperators,
    membership: renderMembership,
    payments: renderPayments,
    cards: renderCards,
    owners: renderOwners,
    safety: renderSafety,
    cooperatives: renderCooperatives,
    analytics: renderAnalytics,
    operations: renderOperations
  };
  return (sections[activeSection] || renderPublicWebsite)();
}

function renderPortalLogin() {
  return `
    <section class="grid">
      <div class="login-panel span-7">
        <div class="form-header">
          <div>
            <p class="eyebrow">Secure access</p>
            <h2>${escapeHtml(activeRoleLabel())} portal</h2>
          </div>
          <span class="status amber">Password required</span>
        </div>
        <form class="form-grid" data-form="portal-login">
          <label class="field full"><span>Password</span><input class="input-control" type="password" name="password" autocomplete="current-password" required /></label>
          <button class="primary-btn" type="submit">Enter portal</button>
          <button class="quiet-btn" type="button" data-role="public">Return to website</button>
        </form>
      </div>
      <div class="panel span-5">
        <h2>MACOKASA digital membership platform</h2>
        <div class="split-list">
          <div class="record-card"><strong>Members</strong><span>Register, renew, verify cards, and access safer-rider benefits.</span></div>
          <div class="record-card"><strong>Owners</strong><span>Track motorcycles, agreements, income, expenses, and assigned operators.</span></div>
          <div class="record-card"><strong>Staff</strong><span>Manage subscriptions, payments, cards, safety compliance, cooperatives, and reporting.</span></div>
        </div>
      </div>
    </section>
  `;
}

function verificationPanelFromQuery() {
  const token = parseVerificationToken(new URLSearchParams(window.location.search).get("verify") || "");
  if (!token) return "";
  const result = verifyCardToken(token);
  if (!result.card) {
    return `
      <section class="panel verification-panel">
        <div class="panel-header">
          <div><p class="eyebrow">Card verification</p><h2>Card not recognized</h2></div>
          <span class="status red">Fake or unknown</span>
        </div>
        <p class="footer-note">This QR token is not active in the MACOKASA IMS. Ask the operator to visit MACOKASA for verification.</p>
      </section>
    `;
  }
  const tone = result.card.status === "active" ? "green" : "red";
  return `
    <section class="panel verification-panel">
      <div class="panel-header">
        <div><p class="eyebrow">Card verification</p><h2>${escapeHtml(result.operator?.fullName || "MACOKASA member")}</h2></div>
        <span class="status ${tone}">${escapeHtml(result.card.status)}</span>
      </div>
      <div class="verification-grid">
        <div><span>Membership number</span><strong>${escapeHtml(result.operator?.membershipNumber || "")}</strong></div>
        <div><span>Membership class</span><strong>${escapeHtml(planByKey(result.card.membershipPlan)?.name || result.card.membershipPlan)}</strong></div>
        <div><span>District</span><strong>${escapeHtml(result.operator?.district || "")}</strong></div>
        <div><span>Operating area</span><strong>${escapeHtml(result.operator?.operatingArea || "")}</strong></div>
        <div><span>Plate</span><strong>${escapeHtml(result.operator?.licensePlate || "Not recorded")}</strong></div>
        <div><span>Card number</span><strong>${escapeHtml(result.card.cardNumber || "")}</strong></div>
      </div>
      ${result.card.replacedBy ? `<p class="footer-note">This card was replaced by ${escapeHtml(result.card.replacedBy)} and should not be accepted as active.</p>` : ""}
    </section>
  `;
}

function renderPublicWebsite() {
  const impact = state.impact;
  const verification = verificationPanelFromQuery();
  return `
    ${verification}
    <section class="hero">
      <div class="hero-main">
        <p class="eyebrow">Malawi Coalition for Kabaza Stakeholders Association</p>
        <h1>Formalizing Malawi's Kabaza economy with safer riders, verified members, and accountable ownership.</h1>
        <p>
          MACOKASA coordinates operators, motorcycle owners, cooperatives, safety partners, and public institutions through
          verified membership, safer-rider promotion, and digital card authentication. Report unsafe conduct toll free: 0000.
        </p>
        <div class="hero-actions">
          <button class="primary-btn" type="button" data-section="registration">Register membership</button>
          <button class="quiet-btn" type="button" data-section="analytics">Impact analytics</button>
          <button class="quiet-btn" type="button" data-action="donate">Donate to safety work</button>
        </div>
      </div>
      <aside class="hero-side">
        <h2>Sector evidence</h2>
        <div class="source-list">
          ${publicSources.map((source) => `
            <div class="source-item">
              <a href="${source.url}" target="_blank" rel="noreferrer">${escapeHtml(source.publisher)}</a>
              <p>${escapeHtml(source.fact)}</p>
            </div>
          `).join("")}
        </div>
      </aside>
    </section>
    <section class="grid">
      <div class="issue-strip span-12">
        <strong>Report an issue</strong>
        <span>Toll free line: 0000</span>
        <span>Use it for unsafe riding, fake cards, overloading, harassment, or rank security incidents.</span>
      </div>
      ${metric("Registered operators", compactNumber(impact.registeredOperators), "MACOKASA operator membership records", "span-4")}
      ${metric("Registered motorcycles", compactNumber(impact.registeredMotorcycles), "Motorcycles mapped into the MACOKASA IMS", "span-4")}
      ${metric("Subscribed owners", compactNumber(impact.subscribedOwners), "Motorcycle owners using MACOKASA IMS", "span-4")}
      <div class="panel span-12 moving-panel">
        <div class="panel-header">
          <div><p class="eyebrow">Impact stories</p><h2>What is changing through MACOKASA IMS</h2></div>
          <span class="status green">Live story board</span>
        </div>
        <div class="story-marquee">
          <div class="story-track">
            <article><strong>Verified rank identity</strong><span>Passengers can scan a card before boarding and confirm the operator belongs to MACOKASA.</span></article>
            <article><strong>Owner confidence</strong><span>Fleet owners can map motorcycles to operators and track behaviour before disputes grow.</span></article>
            <article><strong>ROSAF licensing pathway</strong><span>Unlicensed operators can be routed to training and licence facilitation support.</span></article>
            <article><strong>Safer public transport</strong><span>Helmet, passenger helmet, plate, and training records help promote safer riders at ranks.</span></article>
            <article><strong>Female participation</strong><span>Registration captures sex so MACOKASA can track and support women in the sector.</span></article>
            <article><strong>District coordination</strong><span>Government stakeholders can see registration progress and safety gaps by district.</span></article>
          </div>
        </div>
      </div>
      <div class="panel span-8" id="about">
        <div class="panel-header">
          <div>
            <p class="eyebrow">About us</p>
            <h2>MACOKASA national coordination</h2>
          </div>
          <span class="status green">Verified membership drive</span>
        </div>
        <div class="split-list">
          <div class="record-card"><strong>Livelihoods and formal work</strong><span>Kabaza supports youth employment and small-scale motorcycle ownership, but it needs verified membership and safer operating standards.</span></div>
          <div class="record-card"><strong>Safety and public health</strong><span>The portal tracks helmets, passenger helmets, licence status, licence plates, training history, and complaints so safer operators can be promoted at ranks.</span></div>
          <div class="record-card"><strong>Stakeholder coordination</strong><span>MACOKASA works with affiliated members and public stakeholders to improve safety, training, registration, licensing, and operator accountability.</span></div>
        </div>
      </div>
      <div class="panel span-4">
        <h2>Affiliated members</h2>
        <div class="chip-grid">${affiliatedMembers.map((name) => name === "ROSAF" ? `<a class="brand-chip" href="https://www.rosaf.org" target="_blank" rel="noreferrer">${escapeHtml(name)}</a>` : `<span class="brand-chip">${escapeHtml(name)}</span>`).join("")}</div>
        <h2 style="margin-top:18px">Stakeholders</h2>
        <div class="chip-grid">${stakeholders.map((name) => `<span class="brand-chip outline">${escapeHtml(name)}</span>`).join("")}</div>
      </div>
      <div class="panel span-12" id="catalogue">
        <div class="panel-header">
          <div><p class="eyebrow">Catalogue</p><h2>Services offered through MACOKASA IMS</h2></div>
          <span class="status">Member services</span>
        </div>
        <div class="catalogue-grid">
          <div class="record-card"><strong>Operator membership</strong><span>Regular, Silver, Gold, and Platinum annual memberships with digital reminders and QR card verification.</span></div>
          <div class="record-card"><strong>Owner subscription</strong><span>Motorcycle owners can subscribe, map motorcycles, find verified operators, and manage agreements from the owner portal.</span></div>
          <div class="record-card"><strong>Safety and licensing</strong><span>ROSAF-linked licence facilitation, refresher training support, helmets, plates, and safer-rank promotion.</span></div>
          <div class="record-card"><strong>Card verification</strong><span>QR cards can be scanned by police, passengers, rank chairs, owners, and MACOKASA staff to check live membership status.</span></div>
        </div>
      </div>
      <div class="panel span-8">
        <div class="panel-header">
          <div><p class="eyebrow">Impact story</p><h2>How owners benefit from MACOKASA IMS</h2></div>
          <span class="status green">Owner confidence</span>
        </div>
        <div class="split-list">
          <div class="record-card"><strong>Better operator matching</strong><span>Owners can identify verified operators, map bikes to riders, and reduce uncertainty when assigning motorcycles.</span></div>
          <div class="record-card"><strong>Clear agreements</strong><span>Monthly-pay and target-based arrangements are recorded in the owner portal so disputes can be handled with better evidence.</span></div>
          <div class="record-card"><strong>Business visibility</strong><span>Owners see motorcycle performance, complaints, safety status, and operator behavior patterns without MACOKASA holding their money.</span></div>
        </div>
      </div>
      <div class="panel span-4">
        <h2>Portal access</h2>
        <div class="split-list">
          <button class="secondary-btn" type="button" data-role="staff">MACOKASA staff</button>
          <button class="quiet-btn" type="button" data-role="owner">Motorcycle owner</button>
          <button class="quiet-btn" type="button" data-role="printing">Printing authority</button>
        </div>
      </div>
      <div class="panel span-8">
        <div class="panel-header">
          <div><p class="eyebrow">Stakeholder meetings</p><h2>Government and public safety coordination</h2></div>
          <span class="status">National engagement</span>
        </div>
        <div class="event-ticker">
          <div class="event-track">
            <span>DRTSS licence compliance clinic - Lilongwe</span>
            <span>Police card verification briefing - Blantyre</span>
            <span>Local government rank mapping - Mzuzu</span>
            <span>Ministry of Transport formalization dialogue - Salima</span>
            <span>ROSAF safe riding refresher intake - Zomba</span>
          </div>
        </div>
        <div class="meeting-grid">
          <div class="record-card"><strong>DRTSS road safety sessions</strong><span>Licence compliance, operator registration, roadworthiness, and safer-rank promotion.</span></div>
          <div class="record-card"><strong>Malawi Police Service engagement</strong><span>Card verification, complaint tracking, passenger security, and enforcement support at ranks.</span></div>
          <div class="record-card"><strong>Local government meetings</strong><span>District-level mapping, rank organization, motorcycle owner participation, and public awareness campaigns.</span></div>
          <div class="record-card"><strong>Ministry of Transport dialogue</strong><span>National formalization, training pathways, stakeholder accountability, and sector data reporting.</span></div>
        </div>
      </div>
      <div class="panel span-4">
        <h2>Donation window</h2>
        <p class="footer-note">Choose an amount and give by card, AirtelMoney, Mpamba, EFT, or cash office receipt.</p>
        ${paymentExperience("donation", donationChoice, {
          title: "Donation details",
          nameLabel: "Donor name",
          defaultName: "Road safety supporter",
          purpose: "Helmet safety campaign"
        })}
      </div>
    </section>
  `;
}

function renderRegistration() {
  return `
    <section class="grid">
      <div class="login-panel span-12">
        <div class="form-header">
          <div>
            <p class="eyebrow">Membership access</p>
            <h2>Member, owner, and staff entry points</h2>
          </div>
          <span class="status">${activeRoleLabel()}</span>
        </div>
        <div class="login-grid">
          <div class="login-card"><strong>Public member</strong><p class="footer-note">Operators register, choose Regular/Silver/Gold/Platinum, pay, and receive card status updates.</p><button class="quiet-btn" type="button" data-role="public">Use public view</button></div>
          <div class="login-card"><strong>Motorcycle owner</strong><p class="footer-note">Owners map motorcycles, agreements, operator income, expenses, and complaints feedback.</p><button class="quiet-btn" type="button" data-role="owner">Use owner portal</button></div>
          <div class="login-card"><strong>MACOKASA staff</strong><p class="footer-note">Authorized staff use the full ERP for verification, finance, safety, printing, and analytics.</p><button class="secondary-btn" type="button" data-role="staff">Use staff ERP</button></div>
        </div>
      </div>
      <div class="panel span-7">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Operator membership</p>
            <h2>Register a Kabaza operator</h2>
          </div>
          <span class="status green">Annual subscription</span>
        </div>
        ${operatorForm()}
      </div>
      <div class="panel span-5">
        <h2>Membership categories</h2>
        <div class="plan-grid">
          ${membershipPlans.filter((plan) => plan.audience === "Operator").map(planCard).join("")}
        </div>
      </div>
      <div class="panel span-12">
        <div class="table-header"><h2>Latest public registrations</h2></div>
        ${operatorTable(state.operators.slice(0, 5))}
      </div>
      <div class="panel span-12">
        <div class="table-header"><h2>Membership payment</h2><span class="status">Card, AirtelMoney, Mpamba, EFT, Cash</span></div>
        ${paymentExperience("subscription", subscriptionChoice, {
          title: "Subscription payment details",
          nameLabel: "Member name",
          defaultName: "New MACOKASA member",
          purpose: "MACOKASA annual membership subscription"
        })}
      </div>
    </section>
  `;
}

function renderStaffDashboard() {
  const due = dueReminders();
  const cashHeld = state.payments.filter((payment) => payment.method === "Cash" && payment.status !== "reconciled").reduce((sum, payment) => sum + numberValue(payment.amount), 0);
  const unlicensed = state.operators.filter((operator) => !operator.hasLicense).length;
  const activeCards = state.cards.filter((card) => card.status === "active").length;
  const femaleShare = participationShare("Female");
  return `
    <section class="grid">
      ${metric("Operators", state.operators.length, "Registered in the ERP")}
      ${metric("Owners", state.owners.length, "Owner portal accounts")}
      ${metric("Cash in custody", money(cashHeld), "Requires deposit and reconciliation")}
      ${metric("Female participation", `${femaleShare}%`, "Tracked from registration")}
      <div class="panel span-8">
        <div class="panel-header">
          <div>
            <p class="eyebrow">MACOKASA staff ERP</p>
            <h2>Command center</h2>
          </div>
          <span class="status green">Operational</span>
        </div>
        <div class="split-list">
          <div class="record-card"><strong>Finance control</strong><span>Finance tracks subscriptions, donations, EFT, mobile money, card, cash custody, deposits, expenses, balances, and reconciliation in one module.</span></div>
          <div class="record-card"><strong>Safety control</strong><span>${unlicensed} operator(s) still need licence support. Helmet, passenger helmet, plate, and tracker status are tracked.</span></div>
          <div class="record-card"><strong>Card control</strong><span>${activeCards} active card token(s). Replacement or membership upgrade invalidates old QR tokens and queues printing.</span></div>
        </div>
      </div>
      <div class="panel span-4">
        <h2>Quick actions</h2>
        <div class="split-list">
          <button class="primary-btn" type="button" data-section="operators">Add operator</button>
          <button class="quiet-btn" type="button" data-section="payments">Record payment</button>
          <button class="quiet-btn" type="button" data-section="cards">Issue card</button>
          <button class="quiet-btn" type="button" data-action="run-reminders">Run reminders</button>
          <button class="quiet-btn" type="button" data-section="operations">View reporting controls</button>
        </div>
      </div>
      <div class="panel span-12">
        <div class="table-header"><h2>Priority renewal reminders</h2><span class="status amber">${due.length} queued</span></div>
        ${reminderTable(due)}
      </div>
      <div class="panel span-12">
        <div class="table-header"><h2>Reminder dispatch log</h2><span class="status">${state.reminderLogs.length} sent</span></div>
        ${reminderLogTable(state.reminderLogs)}
      </div>
    </section>
  `;
}

function renderOperators() {
  return `
    <section class="grid">
      <div class="panel span-5">
        <div class="panel-header">
          <div><p class="eyebrow">National database</p><h2>Add operator</h2></div>
        </div>
        ${operatorForm()}
      </div>
      <div class="panel span-7">
        <div class="table-header">
          <div><p class="eyebrow">Registry</p><h2>Operator records</h2></div>
          <span class="status green">${state.operators.length} operators</span>
        </div>
        ${operatorTable(state.operators)}
      </div>
    </section>
  `;
}

function renderMembership() {
  const due = dueReminders();
  return `
    <section class="grid">
      <div class="panel span-12">
        <div class="panel-header">
          <div><p class="eyebrow">Configurable subscription rates</p><h2>Membership plans</h2></div>
          <span class="status">Annual billing</span>
        </div>
        <div class="plan-grid">${membershipPlans.map(planCard).join("")}</div>
      </div>
      <div class="panel span-8">
        <div class="table-header"><h2>Reminder queue</h2><span class="status amber">${due.length} due</span></div>
        ${reminderTable(due)}
      </div>
      <div class="panel span-4">
        <h2>Reminder channels</h2>
        <div class="split-list">
          ${reminderDays.map((day) => `<div class="record-card"><strong>${day} day${day === 1 ? "" : "s"} before expiry</strong><span>Email, WhatsApp, and SMS reminders are prepared for dispatch at this stage.</span></div>`).join("")}
        </div>
        <button class="primary-btn" type="button" data-action="run-reminders" style="margin-top:12px">Run reminder automation</button>
      </div>
      <div class="panel span-12">
        <div class="table-header"><h2>Reminder dispatch log</h2><span class="status">${state.reminderLogs.length} sent</span></div>
        ${reminderLogTable(state.reminderLogs)}
      </div>
    </section>
  `;
}

function renderPayments() {
  const unreconciled = state.payments.filter((payment) => payment.method === "Cash" && payment.status !== "reconciled");
  const summary = financeSummary();
  const ledger = financeLedgerRows();
  const methodRows = paymentMethodRows();
  const categoryRows = financeCategoryRows();
  return `
    <section class="grid">
      ${metric("Total inflows", money(summary.income), "Subscriptions, donations, and finance receipts", "span-3")}
      ${metric("Total expenses", money(summary.expense), "Operating and programme costs", "span-3")}
      ${metric("Net balance", money(summary.balance), summary.balance >= 0 ? "Positive finance position" : "Negative finance position", "span-3")}
      ${metric("Cash in custody", money(summary.cashHeld), "Awaiting deposit reconciliation", "span-3")}
      <div class="panel span-8">
        <div class="panel-header">
          <div><p class="eyebrow">Finance command center</p><h2>Funds flowing in and out</h2></div>
          <span class="status ${summary.balance >= 0 ? "green" : "red"}">${summary.balance >= 0 ? "Positive" : "Negative"} balance</span>
        </div>
        <div class="finance-flow-grid">
          <div class="record-card"><strong>Membership subscriptions</strong><span>${money(summary.subscriptionIncome)} recorded from operator and owner subscriptions.</span></div>
          <div class="record-card"><strong>Public donations</strong><span>${money(summary.donations)} recorded for safety campaigns and programme support.</span></div>
          <div class="record-card"><strong>Operational expenses</strong><span>${money(summary.expense)} spent on training support, card printing, operations, outreach, and administration.</span></div>
          <div class="record-card"><strong>Reconciliation</strong><span>${unreconciled.length} cash payment(s) still need deposit confirmation.</span></div>
        </div>
      </div>
      <div class="panel span-4">
        <h2>Record finance transaction</h2>
        <form class="form-grid" data-form="finance">
          <label class="field"><span>Date</span><input class="input-control" type="date" name="createdAt" value="${today()}" required /></label>
          <label class="field"><span>Type</span>${select("type", ["income", "expense"], "expense")}</label>
          <label class="field full"><span>Category</span>${select("category", ["Membership subscriptions", "Donations", "Training support", "Card printing", "Operations", "Stakeholder meetings", "Administration", "Loan guarantee support"], "Operations")}</label>
          <label class="field full"><span>Source / payee</span><input class="input-control" name="source" required value="MACOKASA operations" /></label>
          <label class="field"><span>Amount MWK</span><input class="input-control" type="number" min="1" name="amount" required value="50000" /></label>
          <label class="field"><span>Method</span>${select("method", paymentMethods, "Bank Transfer")}</label>
          <label class="field"><span>Reference</span><input class="input-control" name="reference" placeholder="Receipt, voucher, bank ref" /></label>
          <label class="field"><span>Recorded by</span><input class="input-control" name="recordedBy" value="Finance Officer" /></label>
          <label class="field full"><span>Notes</span><input class="input-control" name="notes" value="Finance transaction" /></label>
          <button class="primary-btn" type="submit">Save finance transaction</button>
        </form>
      </div>
      <div class="panel span-6">
        <div class="table-header"><h2>Funds by payment method</h2></div>
        ${barChart(methodRows)}
      </div>
      <div class="panel span-6">
        <div class="table-header"><h2>Expenses by category</h2></div>
        ${barChart(categoryRows)}
      </div>
      <div class="panel span-5">
        <div class="panel-header"><div><p class="eyebrow">Finance intake</p><h2>Record subscription payment</h2></div></div>
        <form class="form-grid" data-form="payment">
          <label class="field"><span>Date</span><input class="input-control" type="date" name="createdAt" value="${today()}" required /></label>
          <label class="field"><span>Payment method</span>${select("method", paymentMethods, "AirtelMoney")}</label>
          <label class="field full"><span>Payer name</span><input class="input-control" name="payerName" required /></label>
          <label class="field"><span>Payer type</span>${select("payerType", ["operator", "owner", "donor"], "operator")}</label>
          <label class="field"><span>Membership number</span><input class="input-control" name="membershipNumber" placeholder="MCK-..." /></label>
          <label class="field"><span>Amount MWK</span><input class="input-control" type="number" min="1" name="amount" required /></label>
          <label class="field"><span>Reference</span><input class="input-control" name="reference" placeholder="Transaction ID or receipt" /></label>
          <label class="field full"><span>Purpose</span><input class="input-control" name="purpose" value="Annual subscription" /></label>
          <label class="field full"><span>Cash collector name, required for Cash</span><input class="input-control" name="collectorName" placeholder="Name of collector holding cash" /></label>
          <button class="primary-btn" type="submit">Save payment</button>
        </form>
      </div>
      <div class="panel span-7">
        <div class="table-header"><h2>Payment records</h2><span class="status">${state.payments.length} payments</span></div>
        ${paymentTable(state.payments)}
      </div>
      <div class="panel span-12">
        <div class="table-header"><h2>Finance ledger</h2><span class="status">${ledger.length} ledger lines</span></div>
        ${financeLedgerTable(ledger)}
      </div>
      <div class="panel span-12">
        <div class="table-header">
          <h2>Cash accountability</h2>
          <div class="inline-actions">
            <span class="status amber">${unreconciled.length} unreconciled</span>
            ${unreconciled.length ? `<button class="quiet-btn" type="button" data-action="reconcile-sample">Mark all deposited</button>` : ""}
          </div>
        </div>
        ${unreconciled.length ? paymentTable(unreconciled, true) : `<div class="empty-state">No cash is currently waiting for bank deposit reconciliation.</div>`}
      </div>
      <div class="panel span-12">
        <div class="table-header"><h2>Quick subscription checkout preview</h2><span class="status">Card, AirtelMoney, Mpamba, EFT, Cash</span></div>
        ${paymentExperience("subscription", subscriptionChoice, {
          title: "Subscription details",
          nameLabel: "Payer name",
          defaultName: "MACOKASA member",
          purpose: "MACOKASA subscription payment"
        })}
      </div>
    </section>
  `;
}

function renderCards() {
  const selectedOperator = state.operators[0];
  const selectedCard = state.cards.find((card) => card.operatorId === selectedOperator?.id && card.status === "active") || state.cards[0];
  return `
    <section class="grid">
      <div class="panel span-12">
        <div class="panel-header">
          <div><p class="eyebrow">Digital member card</p><h2>Card printing and QR verification</h2></div>
          <span class="status ${activeRole === "printing" ? "green" : ""}">${activeRole === "printing" ? "Printing portal" : "Staff control"}</span>
        </div>
        ${selectedOperator ? `
          <div class="card-preview-layout">
            ${cardDesignerForm(selectedOperator, selectedCard)}
            ${cardPreview(selectedOperator, selectedCard)}
          </div>
        ` : `<div class="empty-state">No operator is available for card preview.</div>`}
      </div>
      <div class="panel span-5">
        <h2>Issue replacement or plan-change card</h2>
        <form class="form-grid" data-form="card">
          <label class="field full"><span>Operator</span>
            <select class="select-control" name="operatorId">
              ${state.operators.map((operator) => `<option value="${operator.id}">${escapeHtml(operator.fullName)} - ${escapeHtml(operator.membershipNumber)}</option>`).join("")}
            </select>
          </label>
          <label class="field full"><span>Reason</span>${select("reason", ["Lost card replacement", "Membership upgrade", "Membership downgrade", "Damaged card"], "Lost card replacement")}</label>
          <label class="field full"><span>New membership category</span>${planSelect("membershipPlan", selectedOperator?.membershipPlan || "regular", "Operator")}</label>
          <button class="primary-btn" type="submit">Invalidate old QR and queue card</button>
        </form>
        <p class="footer-note">Printed cards use live token validation, replacement invalidation, card serial control, and anti-copy print security. Replaced tokens are rejected during verification.</p>
      </div>
      <div class="panel span-7">
        <div class="table-header"><h2>Card register</h2><span class="status">${state.cards.length} cards</span></div>
        ${cardTable(state.cards)}
      </div>
      <div class="panel span-12">
        <h2>Verify a scanned QR token</h2>
        <form class="form-grid" data-form="verify">
          <label class="field full"><span>Paste scanned token or verification URL</span><input class="input-control" name="token" value="${escapeAttr(selectedCard?.qrToken || "")}" /></label>
          <button class="secondary-btn" type="submit">Verify card</button>
        </form>
        <div id="verification-result" class="footer-note">Scan should open this system and validate whether the card token is active, replaced, or fake.</div>
      </div>
    </section>
  `;
}

function renderOwners() {
  const rows = ownerFundRows(ownerFundFilterId);
  const totals = ownerFundTotals(rows);
  const fundEntries = filteredFundEntries(ownerFundFilterId);
  return `
    <section class="grid">
      <div class="panel span-12">
        <div class="panel-header">
          <div><p class="eyebrow">Motorcycle owner portal</p><h2>Map motorcycles, operators, agreements, earnings, and expenses</h2></div>
          <span class="status green">${state.motorcycles.length} motorcycles</span>
        </div>
        ${motorcycleTable(state.motorcycles)}
      </div>
      <div class="panel span-5">
        <h2>Add owner motorcycle</h2>
        <form class="form-grid" data-form="motorcycle">
          <label class="field"><span>Owner</span>${ownerSelect("ownerId")}</label>
          <label class="field"><span>Assigned operator</span>${operatorSelect("assignedOperatorId")}</label>
          <label class="field"><span>Plate number</span><input class="input-control" name="plateNumber" required /></label>
          <label class="field"><span>Make/model</span><input class="input-control" name="make" required value="Bajaj Boxer" /></label>
          <label class="field"><span>Agreement</span>${select("agreementType", ["Monthly pay", "Target based"], "Target based")}</label>
          <label class="field"><span>Monthly target MWK</span><input class="input-control" type="number" name="monthlyTarget" value="180000" /></label>
          <label class="field"><span>Monthly pay MWK</span><input class="input-control" type="number" name="monthlyPay" value="0" /></label>
          <label class="field"><span>Helmet count</span><input class="input-control" type="number" min="0" name="helmetCount" value="2" /></label>
          <button class="primary-btn" type="submit">Map motorcycle</button>
        </form>
      </div>
      <div class="panel span-7">
        <div class="table-header"><h2>Owner fund management</h2><span class="status">MACOKASA does not hold these funds</span></div>
        <div class="owner-balance-grid">
          <div class="record-card"><strong>Total income</strong><span>${money(totals.income)}</span></div>
          <div class="record-card"><strong>Total expenses</strong><span>${money(totals.expenses)}</span></div>
          <div class="record-card ${totals.net >= 0 ? "positive-card" : "negative-card"}"><strong>Balance</strong><span>${money(totals.net)} ${totals.net >= 0 ? "positive" : "negative"}</span></div>
        </div>
        <label class="field full owner-filter"><span>View motorcycle performance</span>${motorcycleFilterSelect("ownerFundFilter", ownerFundFilterId)}</label>
        <form class="form-grid" data-form="fund">
          <label class="field"><span>Owner</span>${ownerSelect("ownerId")}</label>
          <label class="field"><span>Motorcycle</span>${motorcycleSelect("motorcycleId")}</label>
          <label class="field"><span>Transaction date</span><input class="input-control" type="date" name="createdAt" value="${today()}" required /></label>
          <label class="field"><span>Type</span>${select("type", ["income", "expense"], "income")}</label>
          <label class="field"><span>Amount MWK</span><input class="input-control" type="number" min="1" name="amount" required /></label>
          <label class="field full"><span>Note</span><input class="input-control" name="note" value="Weekly target collection" /></label>
          <button class="primary-btn" type="submit">Record owner fund entry</button>
        </form>
        <div class="table-header" style="margin-top:16px"><h3>Progress by motorcycle</h3></div>
        ${fundTable(rows)}
        <div class="table-header" style="margin-top:16px"><h3>Transactions</h3></div>
        ${fundEntryTable(fundEntries)}
      </div>
    </section>
  `;
}

function renderSafety() {
  const unlicensed = state.operators.filter((operator) => !operator.hasLicense);
  const noPassengerHelmet = state.operators.filter((operator) => !operator.passengerHelmet);
  const trackerReady = state.operators.filter((operator) => planByKey(operator.membershipPlan)?.name === "Platinum");
  return `
    <section class="grid">
      ${metric("Without licence", unlicensed.length, "Eligible for ROSAF facilitation support")}
      ${metric("Passenger helmet gaps", noPassengerHelmet.length, "Important for safer rank promotion")}
      ${metric("Tracker eligible", trackerReady.length, "Highest category can install tracker")}
      ${metric("Registered plates", state.operators.filter((operator) => operator.licensePlate).length, "Quick facts for passenger security")}
      <div class="panel span-8">
        <div class="table-header"><h2>Licence, helmet, and plate status</h2></div>
        ${operatorSafetyTable(state.operators)}
      </div>
      <div class="panel span-4">
        <h2>ROSAF benefit logic</h2>
        <div class="split-list">
          <div class="record-card"><strong>Licence acquisition</strong><span>MACOKASA members without a motorcycle licence can be routed to ROSAF discounted licence facilitation.</span></div>
          <div class="record-card"><strong>Refresher training</strong><span>Active members can access reduced fees for safe riding refresher courses.</span></div>
          <div class="record-card"><strong>Safer operator promotion</strong><span>Verified licence, helmet compliance, plate record, and active membership can mark a rider as safer for public preference.</span></div>
        </div>
      </div>
    </section>
  `;
}

function renderCooperatives() {
  return `
    <section class="grid">
      <div class="panel span-5">
        <div class="panel-header"><div><p class="eyebrow">MACOKASA as guarantor</p><h2>Cooperative motorcycle loan request</h2></div></div>
        <form class="form-grid" data-form="cooperative">
          <label class="field full"><span>Cooperative name</span><input class="input-control" name="name" required /></label>
          <label class="field"><span>District</span>${select("district", districts, "Lilongwe")}</label>
          <label class="field"><span>Members</span><input class="input-control" type="number" min="1" name="members" value="25" /></label>
          <label class="field"><span>Motorcycles requested</span><input class="input-control" type="number" min="1" name="requestedMotorcycles" value="10" /></label>
          <label class="field"><span>Loan amount MWK</span><input class="input-control" type="number" min="1" name="loanAmount" value="15000000" /></label>
          <label class="field"><span>Bank partner</span><input class="input-control" name="bankPartner" value="Pending partner bank" /></label>
          <button class="primary-btn" type="submit">Submit cooperative request</button>
        </form>
      </div>
      <div class="panel span-7">
        <div class="table-header"><h2>Cooperative loan pipeline</h2><span class="status">${state.cooperatives.length} requests</span></div>
        ${cooperativeTable(state.cooperatives)}
      </div>
    </section>
  `;
}

function renderAnalytics() {
  const districtRows = districtCounts();
  const planRows = planCounts();
  const sexRows = sexCounts();
  const safetyScore = Math.round((state.operators.filter((operator) => operator.hasLicense && operator.helmetUse && operator.passengerHelmet && operator.licensePlate).length / Math.max(1, state.operators.length)) * 100);
  const ownerFundPanel = activeRole === "owner" || activeRole === "staff" ? `
      <div class="panel span-6">
        <div class="table-header"><h2>Owner fund progress</h2></div>
        ${barChart(ownerFundRows().map((row) => ({ label: row.motorcycle.split(" - ")[0], value: Math.max(0, row.net) })))}
      </div>
  ` : "";
  return `
    <section class="grid">
      ${metric("Operator safety score", `${safetyScore}%`, "Licence, helmet, passenger helmet, and plate")}
      ${metric("Membership revenue", money(state.payments.filter((payment) => payment.payerType !== "donor").reduce((sum, payment) => sum + numberValue(payment.amount), 0)), "Recorded subscriptions")}
      ${metric("Public donations", money(state.donations.reduce((sum, donation) => sum + numberValue(donation.amount), 0)), "Donation button intake")}
      ${metric("Female participation", `${participationShare("Female")}%`, "Women tracked in the operator sector")}
      <div class="panel span-6">
        <div class="table-header"><h2>Operators by district</h2></div>
        ${barChart(districtRows)}
      </div>
      <div class="panel span-6">
        <div class="table-header"><h2>Membership mix</h2></div>
        ${barChart(planRows)}
      </div>
      <div class="panel span-6">
        <div class="table-header"><h2>Participation by sex</h2></div>
        ${donutChart(sexRows, "Participation")}
      </div>
      ${ownerFundPanel}
      <div class="panel span-12">
        <div class="table-header"><h2>Impact analytics feed</h2><span class="status green">Shareable live figures</span></div>
        <p class="footer-note">These figures can power public stories, dashboards, donor reports, and district-level registration progress without manually copying numbers.</p>
      </div>
    </section>
  `;
}

function renderOperations() {
  return `
    <section class="grid">
      <div class="panel span-7">
        <div class="panel-header">
          <div><p class="eyebrow">Administration</p><h2>Operations control</h2></div>
          <span class="status green">Active</span>
        </div>
        <div class="split-list">
          <div class="record-card"><strong>Membership reminders</strong><span>Run subscription reminders for operators whose membership is approaching expiry.</span></div>
          <div class="record-card"><strong>Card security</strong><span>Verify card tokens, invalidate replaced cards, and queue new cards for printing.</span></div>
          <div class="record-card"><strong>Payment monitoring</strong><span>Track card, AirtelMoney, Mpamba, bank transfer, and cash accountability.</span></div>
          <div class="record-card"><strong>Stakeholder reporting</strong><span>Prepare district and safety summaries for MACOKASA leadership and partner institutions.</span></div>
        </div>
      </div>
      <div class="panel span-5">
        <h2>Automation center</h2>
        <div class="split-list">
          <button class="primary-btn" type="button" data-action="run-reminders">Run renewal reminders</button>
          <button class="quiet-btn" type="button" data-action="reconcile-sample">Reconcile deposited cash</button>
          <button class="quiet-btn" type="button" data-section="cards">Open card verification</button>
        </div>
      </div>
      <div class="panel span-12">
        <div class="table-header"><h2>Reminder dispatch log</h2><span class="status">${state.reminderLogs.length} sent</span></div>
        ${reminderLogTable(state.reminderLogs)}
      </div>
    </section>
  `;
}

function operatorForm() {
  return `
    <form class="form-grid" data-form="operator">
      <label class="field"><span>Full name</span><input class="input-control" name="fullName" required /></label>
      <label class="field"><span>Phone</span><input class="input-control" name="phone" required placeholder="+265..." /></label>
      <label class="field"><span>Email</span><input class="input-control" type="email" name="email" /></label>
      <label class="field"><span>National ID</span><input class="input-control" name="nationalId" /></label>
      <label class="field"><span>Sex</span>${select("sex", ["Male", "Female"], "Male")}</label>
      <label class="field"><span>District</span>${select("district", districts, "Lilongwe")}</label>
      <label class="field"><span>Operating area/rank</span><input class="input-control" name="operatingArea" required /></label>
      <label class="field"><span>Membership</span>${planSelect("membershipPlan", "regular", "Operator")}</label>
      <label class="field"><span>Owns or rents?</span>${select("ownershipStatus", ["Owns motorcycle", "Rents motorcycle"], "Rents motorcycle")}</label>
      <label class="field"><span>Has licence?</span>${select("hasLicense", ["Yes", "No"], "No")}</label>
      <label class="field"><span>Licence number</span><input class="input-control" name="licenseNumber" /></label>
      <label class="field"><span>Plate number</span><input class="input-control" name="licensePlate" placeholder="LL 0000" /></label>
      <label class="field"><span>Helmet use</span>${select("helmetUse", ["Yes", "No"], "Yes")}</label>
      <label class="field"><span>Passenger helmet</span>${select("passengerHelmet", ["Yes", "No"], "No")}</label>
      <label class="field"><span>Tracker installed</span>${select("trackerInstalled", ["Yes", "No"], "No")}</label>
      <button class="primary-btn" type="submit">Register operator</button>
    </form>
  `;
}

function handleClick(event) {
  const jump = event.target.closest("[data-jump]")?.dataset.jump;
  if (jump) {
    activeRole = "public";
    activeSection = "public";
    render();
    requestAnimationFrame(() => document.getElementById(jump)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return;
  }
  const section = event.target.closest("[data-section]")?.dataset.section;
  if (section) {
    activeSection = section;
    render();
    return;
  }
  const role = event.target.closest("[data-role]")?.dataset.role;
  if (role) {
    activeRole = role;
    render();
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  const paymentMethod = event.target.closest("[data-payment-method]");
  if (paymentMethod) {
    const context = paymentMethod.dataset.paymentContext;
    paymentStateFor(context).method = paymentMethod.dataset.paymentMethod;
    render();
    return;
  }
  const paymentAmount = event.target.closest("[data-payment-amount]");
  if (paymentAmount) {
    const context = paymentAmount.dataset.paymentContext;
    paymentStateFor(context).amount = paymentAmount.dataset.paymentAmount;
    render();
    return;
  }
  const reconcilePayment = event.target.closest("[data-reconcile-payment]");
  if (reconcilePayment) {
    void updateRecord("payments", reconcilePayment.dataset.reconcilePayment, { status: "reconciled", depositedAt: today() });
    showToast("Cash payment marked as deposited.");
    return;
  }
  if (action === "logout") {
    unlockedRoles.delete(activeRole);
    render();
    showToast("Portal locked.");
  }
  if (action === "run-reminders") runReminderAutomation();
  if (action === "reconcile-sample") reconcileCashPayments();
  if (action === "donate") {
    activeSection = "public";
    render();
    showToast("Donation form is ready on the public website panel.");
  }
}

function handleChange(event) {
  if (event.target.matches("[data-role-switcher]")) {
    activeRole = event.target.value;
    render();
  }
  if (event.target.matches("[data-card-photo]")) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const photo = document.querySelector("[data-card-photo-preview]");
      if (photo) {
        photo.style.backgroundImage = `url("${reader.result}")`;
        photo.classList.add("has-image");
      }
    };
    reader.readAsDataURL(file);
  }
  if (event.target.matches("[data-owner-bike-filter]")) {
    ownerFundFilterId = event.target.value;
    render();
  }
  if (event.target.closest("[data-card-designer]")) updateCardPreviewFromForm();
}

function handleInput(event) {
  if (event.target.closest("[data-card-designer]")) updateCardPreviewFromForm();
  if (event.target.matches("[data-custom-amount]")) {
    const context = event.target.dataset.paymentContext;
    const value = numberValue(event.target.value);
    if (value > 0) paymentStateFor(context).amount = String(value);
    const label = document.querySelector(`[data-payment-total="${context}"]`);
    if (label) label.textContent = money(paymentStateFor(context).amount);
    const widget = event.target.closest("[data-payment-widget]");
    const hiddenAmount = widget?.querySelector('input[name="amount"]');
    if (hiddenAmount) hiddenAmount.value = paymentStateFor(context).amount;
    const submit = widget?.querySelector('button[type="submit"]');
    if (submit) submit.textContent = `${context === "donation" ? "Record donation" : "Record payment"} ${money(paymentStateFor(context).amount)}`;
  }
  if (event.target.matches("[data-card-field]")) updatePaymentCardPreview(event.target.closest("[data-payment-widget]"));
}

async function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const values = formValues(form);
  const handlers = {
    "portal-login": submitPortalLogin,
    operator: submitOperator,
    payment: submitPayment,
    finance: submitFinance,
    donation: submitDonation,
    card: submitCard,
    verify: submitVerify,
    motorcycle: submitMotorcycle,
    fund: submitFund,
    cooperative: submitCooperative
  };
  await handlers[form.dataset.form]?.(values);
}

async function submitPortalLogin(values) {
  const expected = config.portalPasswords?.[activeRole] || "";
  if (!expected || values.password !== expected) {
    showToast("Incorrect password.");
    return;
  }
  unlockedRoles.add(activeRole);
  activeSection = activeRole === "owner" ? "owners" : activeRole === "printing" ? "cards" : "staff";
  render();
  showToast(`${activeRoleLabel()} portal unlocked.`);
}

async function submitOperator(values) {
  const plan = planByKey(values.membershipPlan);
  const id = newId("op");
  const districtCode = (values.district || "MW").slice(0, 2).toUpperCase();
  const operator = {
    id,
    membershipNumber: `MCK-${districtCode}-${new Date().getFullYear()}-${String(state.operators.length + 1).padStart(4, "0")}`,
    fullName: values.fullName,
    phone: values.phone,
    email: values.email,
    nationalId: values.nationalId,
    sex: values.sex,
    district: values.district,
    operatingArea: values.operatingArea,
    membershipPlan: values.membershipPlan,
    membershipType: "operator",
    expiresOn: addDays(new Date(), 365),
    hasLicense: values.hasLicense === "Yes",
    licenseNumber: values.licenseNumber,
    ownershipStatus: values.ownershipStatus,
    motorcycleId: "",
    helmetUse: values.helmetUse === "Yes",
    passengerHelmet: values.passengerHelmet === "Yes",
    licensePlate: values.licensePlate,
    trackerInstalled: values.trackerInstalled === "Yes",
    status: values.hasLicense === "Yes" ? "active" : "training due",
    photoData: "",
    createdAt: today()
  };
  await addRecord("operators", operator);
  await addRecord("payments", {
    id: newId("pay"),
    payerName: operator.fullName,
    payerType: "operator",
    membershipNumber: operator.membershipNumber,
    method: "AirtelMoney",
    amount: plan?.annualFee || 0,
    purpose: `${plan?.name || "Membership"} annual subscription`,
    collectorName: "",
    reference: "Pending payment",
    status: "pending",
    createdAt: today()
  });
  showToast("Operator registered and a pending subscription payment was created.");
}

async function submitPayment(values) {
  if (values.method === "Cash" && !values.collectorName.trim()) {
    showToast("Cash payment requires the name of the person who collected it.");
    return;
  }
  const payment = {
    id: newId("pay"),
    payerName: values.payerName,
    payerType: values.payerType,
    membershipNumber: values.membershipNumber,
    method: values.method,
    amount: numberValue(values.amount),
    purpose: values.purpose,
    collectorName: values.collectorName,
    reference: values.reference || "Manual entry",
    status: values.method === "Cash" ? "awaiting deposit" : "reconciled",
    createdAt: values.createdAt || today()
  };
  await addRecord("payments", payment);
  showToast("Payment saved.");
}

async function submitFinance(values) {
  await addRecord("financeEntries", {
    id: newId("fin"),
    type: values.type,
    category: values.category,
    source: values.source,
    amount: numberValue(values.amount),
    method: values.method,
    reference: values.reference || "Manual finance record",
    recordedBy: values.recordedBy,
    notes: values.notes,
    createdAt: values.createdAt || today()
  });
  showToast("Finance transaction saved.");
}

async function submitDonation(values) {
  const amount = numberValue(values.amount || paymentStateFor("donation").amount);
  const method = values.method || paymentMethodLabel(paymentStateFor("donation").method);
  await addRecord("donations", {
    id: newId("don"),
    donorName: values.donorName || values.payerName,
    amount,
    method,
    purpose: values.purpose,
    createdAt: today()
  });
  showToast("Donation recorded for public impact reporting.");
}

async function submitCard(values) {
  const operator = state.operators.find((item) => item.id === values.operatorId);
  if (!operator) return;
  const activeCard = state.cards.find((card) => card.operatorId === operator.id && card.status === "active");
  const newCardId = newId("card");
  if (activeCard) await updateRecord("cards", activeCard.id, { status: "invalidated", replacedBy: newCardId });
  await updateRecord("operators", operator.id, { membershipPlan: values.membershipPlan });
  await addRecord("cards", {
    id: newCardId,
    operatorId: operator.id,
    cardNumber: `CARD-MCK-${String(state.cards.length + 1).padStart(4, "0")}`,
    qrToken: `qr-${operator.id}-${Date.now()}`,
    status: "print queue",
    membershipPlan: values.membershipPlan,
    issuedAt: today(),
    replacedBy: ""
  });
  const plan = planByKey(values.membershipPlan);
  await addRecord("payments", {
    id: newId("pay"),
    payerName: operator.fullName,
    payerType: "operator",
    membershipNumber: operator.membershipNumber,
    method: "AirtelMoney",
    amount: (plan?.annualFee || 0) + 5000,
    purpose: `${values.reason} with card printing fee`,
    collectorName: "",
    reference: "Pending card payment",
    status: "pending",
    createdAt: today()
  });
  showToast("Old QR invalidated. New card queued and printing fee added.");
}

function submitVerify(values) {
  const token = parseVerificationToken(values.token);
  const resultData = verifyCardToken(token);
  const result = document.querySelector("#verification-result");
  if (!resultData.card) {
    result.innerHTML = `<span class="status red">Fake or unknown card</span> No active MACOKASA card token was found.`;
    return;
  }
  const tone = resultData.card.status === "active" ? "green" : "red";
  result.innerHTML = `<span class="status ${tone}">${escapeHtml(resultData.card.status)}</span> ${escapeHtml(resultData.operator?.fullName || "Unknown operator")} - ${escapeHtml(resultData.operator?.membershipNumber || "")}. ${resultData.card.replacedBy ? `Replaced by ${escapeHtml(resultData.card.replacedBy)}.` : ""}`;
}

async function submitMotorcycle(values) {
  await addRecord("motorcycles", {
    id: newId("bike"),
    ownerId: values.ownerId,
    plateNumber: values.plateNumber,
    make: values.make,
    trackerEligible: false,
    trackerInstalled: false,
    helmetCount: numberValue(values.helmetCount),
    assignedOperatorId: values.assignedOperatorId,
    agreementType: values.agreementType,
    monthlyTarget: numberValue(values.monthlyTarget),
    monthlyPay: numberValue(values.monthlyPay)
  });
  showToast("Motorcycle mapped to owner and operator.");
}

async function submitFund(values) {
  await addRecord("fundEntries", {
    id: newId("fund"),
    ownerId: values.ownerId,
    motorcycleId: values.motorcycleId,
    type: values.type,
    amount: numberValue(values.amount),
    note: values.note,
    createdAt: values.createdAt || today()
  });
  showToast("Owner fund entry saved.");
}

async function submitCooperative(values) {
  await addRecord("cooperatives", {
    id: newId("coop"),
    name: values.name,
    district: values.district,
    members: numberValue(values.members),
    requestedMotorcycles: numberValue(values.requestedMotorcycles),
    loanAmount: numberValue(values.loanAmount),
    guarantorStatus: "MACOKASA review",
    bankPartner: values.bankPartner
  });
  showToast("Cooperative loan request submitted.");
}

async function runReminderAutomation() {
  const due = dueReminders();
  if (!due.length) {
    showToast("No membership reminders are due today.");
    return;
  }
  const alreadySent = new Set(state.reminderLogs.map((log) => `${log.membershipNumber}-${log.daysLeft}-${today()}`));
  const logs = due
    .filter((operator) => !alreadySent.has(`${operator.membershipNumber}-${operator.daysLeft}-${today()}`))
    .flatMap((operator) => ["Email", "WhatsApp", "SMS"].map((channel) => ({
      id: newId("rem"),
      membershipNumber: operator.membershipNumber,
      fullName: operator.fullName,
      channel,
      daysLeft: operator.daysLeft,
      message: `Your MACOKASA ${planByKey(operator.membershipPlan)?.name || "membership"} membership expires in ${operator.daysLeft} day(s). Renew by AirtelMoney, Mpamba, bank card, EFT, cash office receipt, or visit a MACOKASA office.`,
      status: "sent",
      createdAt: new Date().toISOString()
    })));
  if (!logs.length) {
    showToast("Today's reminder batch was already sent.");
    return;
  }
  state.reminderLogs = [...logs, ...state.reminderLogs];
  persist();
  render();
  showToast(`${logs.length} reminder message(s) dispatched.`);
}

function reconcileCashPayments() {
  let count = 0;
  state.payments = state.payments.map((payment) => {
    if (payment.method === "Cash" && payment.status !== "reconciled") {
      count += 1;
      return { ...payment, status: "reconciled", reference: payment.reference || `DEP-${Date.now()}` };
    }
    return payment;
  });
  persist();
  render();
  showToast(count ? `${count} cash payment(s) reconciled.` : "No unreconciled cash payment found.");
}

function formValues(form) {
  return Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [key, String(value).trim()]));
}

function metric(label, value, note, spanClass = "span-3") {
  return `<article class="metric ${spanClass}"><div class="metric-icon">${iconForMetric(label)}</div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function planCard(plan) {
  return `
    <article class="plan-card" style="--plan-color:${plan.color}">
      <h3>${escapeHtml(plan.name)}</h3>
      <strong>${money(plan.annualFee)} / year</strong>
      <p class="microcopy">${escapeHtml(plan.audience)}</p>
      <ul>${plan.benefits.map((benefit) => `<li>${escapeHtml(benefit)}</li>`).join("")}</ul>
    </article>
  `;
}

function cardDesignerForm(operator, card) {
  return `
    <form class="form-grid card-designer" data-card-designer>
      <label class="field"><span>Name on card</span><input class="input-control" name="cardName" value="${escapeAttr(operator.fullName)}" /></label>
      <label class="field"><span>Membership class</span>${planSelect("cardPlan", card?.membershipPlan || operator.membershipPlan, "Operator")}</label>
      <label class="field"><span>Membership number</span><input class="input-control" name="cardNumber" value="${escapeAttr(operator.membershipNumber)}" /></label>
      <label class="field"><span>Sex</span>${select("cardSex", ["Male", "Female"], operator.sex || "Male")}</label>
      <label class="field"><span>Operating area</span><input class="input-control" name="cardArea" value="${escapeAttr(operator.operatingArea)}" /></label>
      <label class="field"><span>District</span>${select("cardDistrict", districts, operator.district)}</label>
      <label class="field"><span>Photo</span><input class="input-control" type="file" accept="image/*" data-card-photo /></label>
    </form>
  `;
}

function paymentExperience(context, choice, options) {
  const method = choice.method || "card";
  const amount = choice.amount || "50000";
  const formType = context === "donation" ? "donation" : "payment";
  const nameField = context === "donation" ? "donorName" : "payerName";
  const methodLabel = paymentMethodLabel(method);
  return `
    <div class="payment-widget" data-payment-widget="${context}">
      <div class="method-grid">
        ${paymentMethodCard(context, method, "card", "Bank Card", "Debit / Credit card", "Visa or Mastercard.")}
        ${paymentMethodCard(context, method, "airtel", "AirtelMoney", "AirtelMoney", "Mobile prompt.", "./assets/payment-airtel-official.svg")}
        ${paymentMethodCard(context, method, "mpamba", "TNM Mpamba", "Mpamba", "TNM transfer.", "./assets/payment-mpamba-official.svg")}
        ${paymentMethodCard(context, method, "eft", "Bank transfer", "EFT", "Full bank details.", "./assets/payment-eft-cash.svg")}
        ${paymentMethodCard(context, method, "cash", "Cash office", "Receipt", "Collector record.", "./assets/payment-eft-cash.svg")}
      </div>
      <form class="payment-panel" data-form="${formType}">
        <div class="payment-panel-head">
          <div>
            <p class="eyebrow">${escapeHtml(options.title)}</p>
            <h3>${escapeHtml(methodLabel)}</h3>
          </div>
          <strong data-payment-total="${context}">${money(amount)}</strong>
        </div>
        <div class="amount-grid">
          ${[25000, 50000, 100000].map((value) => `<button class="amount-button ${String(value) === String(amount) ? "active" : ""}" type="button" data-payment-context="${context}" data-payment-amount="${value}">${money(value)}</button>`).join("")}
        </div>
        <label class="field full"><span>Custom amount</span><input class="input-control" type="number" min="1000" step="1000" placeholder="Enter amount in MWK" data-custom-amount data-payment-context="${context}" /></label>
        <input type="hidden" name="amount" value="${escapeAttr(amount)}" />
        <input type="hidden" name="method" value="${escapeAttr(methodLabel)}" />
        <input type="hidden" name="purpose" value="${escapeAttr(options.purpose)}" />
        ${context === "donation" ? "" : `<input type="hidden" name="payerType" value="operator" /><input type="hidden" name="membershipNumber" value="" />`}
        <label class="field full"><span>${escapeHtml(options.nameLabel)}</span><input class="input-control" name="${nameField}" required value="${escapeAttr(options.defaultName)}" /></label>
        ${paymentFieldsFor(method, context)}
        <button class="primary-btn" type="submit">${context === "donation" ? "Record donation" : "Record payment"} ${money(amount)}</button>
      </form>
    </div>
  `;
}

function paymentMethodCard(context, activeMethod, method, title, label, description, image = "") {
  return `
    <button class="method-card ${activeMethod === method ? "active" : ""}" type="button" data-payment-context="${context}" data-payment-method="${method}">
      ${image ? `<img class="payment-logo" src="${image}" alt="${escapeAttr(title)}">` : `<span class="payment-icon card-icon" aria-hidden="true"></span>`}
      <small>${escapeHtml(label)}</small>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
    </button>
  `;
}

function paymentFieldsFor(method, context) {
  if (method === "card") {
    return `
      <div class="debit-card-preview" aria-label="Debit card preview">
        <div class="card-preview-top"><span class="card-chip" aria-hidden="true"></span><span class="card-brand">MACOKASA Payments</span></div>
        <strong class="card-preview-number" data-card-preview-number>0000 0000 0000 0000</strong>
        <div class="card-preview-bottom">
          <span><small>Card holder</small><b data-card-preview-name>FULL NAME</b></span>
          <span><small>Expires</small><b data-card-preview-expiry>MM/YY</b></span>
        </div>
      </div>
      <label class="field full"><span>Name on card</span><input class="input-control" type="text" placeholder="Full name" data-card-field="name"></label>
      <label class="field full"><span>Card number</span><input class="input-control" type="text" inputmode="numeric" placeholder="4242 4242 4242 4242" data-card-field="number"></label>
      <div class="field-row">
        <label class="field"><span>Expiry</span><input class="input-control" type="text" inputmode="numeric" placeholder="MM/YY" data-card-field="expiry"></label>
        <label class="field"><span>CVV</span><input class="input-control" type="text" inputmode="numeric" placeholder="123"></label>
      </div>
      <input type="hidden" name="reference" value="Card payment pending" />
      <input type="hidden" name="collectorName" value="" />
    `;
  }
  if (method === "airtel") {
    return `<div class="secure-note">Confirm the AirtelMoney prompt on the payer phone.</div><label class="field full"><span>AirtelMoney number</span><input class="input-control" name="reference" type="text" placeholder="+265 99X XXX XXX"></label><input type="hidden" name="collectorName" value="" />`;
  }
  if (method === "mpamba") {
    return `<div class="secure-note">Approve the TNM Mpamba prompt on the payer phone.</div><label class="field full"><span>Mpamba number</span><input class="input-control" name="reference" type="text" placeholder="+265 88X XXX XXX"></label><input type="hidden" name="collectorName" value="" />`;
  }
  if (method === "eft") {
    return `<div class="secure-note">Use reference: MACOKASA - Name - Amount.</div><div class="bank-details-inline"><strong>National Bank of Malawi</strong><span>MACOKASA Subscriptions and Donations</span><span>Account: 000000000000</span><span>Branch: Lilongwe</span></div><label class="field full"><span>Bank reference</span><input class="input-control" name="reference" type="text" placeholder="Bank transaction reference"></label><input type="hidden" name="collectorName" value="" />`;
  }
  return `<div class="secure-note">Cash must record the collector until it is deposited and reconciled by Finance.</div><label class="field full"><span>Collector name</span><input class="input-control" name="collectorName" type="text" placeholder="Name of person holding cash" ${context === "donation" ? "" : "required"}></label><label class="field full"><span>Receipt number</span><input class="input-control" name="reference" type="text" placeholder="Cash receipt number"></label>`;
}

function paymentStateFor(context) {
  return context === "donation" ? donationChoice : subscriptionChoice;
}

function paymentMethodLabel(method) {
  return {
    card: "Bank Card",
    airtel: "AirtelMoney",
    mpamba: "Mpamba",
    eft: "Bank Transfer",
    cash: "Cash"
  }[method] || method;
}

function updatePaymentCardPreview(widget) {
  if (!widget) return;
  const number = widget.querySelector('[data-card-field="number"]')?.value || "";
  const name = widget.querySelector('[data-card-field="name"]')?.value || "";
  const expiry = widget.querySelector('[data-card-field="expiry"]')?.value || "";
  const numberTarget = widget.querySelector("[data-card-preview-number]");
  const nameTarget = widget.querySelector("[data-card-preview-name]");
  const expiryTarget = widget.querySelector("[data-card-preview-expiry]");
  if (numberTarget) numberTarget.textContent = formatCardNumber(number);
  if (nameTarget) nameTarget.textContent = name.trim().toUpperCase() || "FULL NAME";
  if (expiryTarget) expiryTarget.textContent = expiry.trim() || "MM/YY";
}

function formatCardNumber(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 16).padEnd(16, "0");
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function operatorTable(rows) {
  if (!rows.length) return `<div class="empty-state">No operators yet.</div>`;
  return table(["Member", "Sex", "District", "Area", "Plan", "Licence", "Safety", "Expires"], rows.map((operator) => [
    `<strong>${escapeHtml(operator.fullName)}</strong><br><span class="microcopy">${escapeHtml(operator.membershipNumber)}</span>`,
    operator.sex || "Not recorded",
    operator.district,
    operator.operatingArea,
    planByKey(operator.membershipPlan)?.name || operator.membershipPlan,
    operator.hasLicense ? `<span class="status green">Licensed</span>` : `<span class="status amber">Needs ROSAF</span>`,
    safetyStatus(operator),
    compactDate(operator.expiresOn)
  ]));
}

function operatorSafetyTable(rows) {
  return table(["Operator", "Licence", "Plate", "Helmet", "Passenger helmet", "Tracker", "Public status"], rows.map((operator) => [
    operator.fullName,
    operator.hasLicense ? operator.licenseNumber || "Yes" : `<span class="status amber">No licence</span>`,
    operator.licensePlate || `<span class="status amber">Missing</span>`,
    operator.helmetUse ? "Yes" : `<span class="status red">No</span>`,
    operator.passengerHelmet ? "Yes" : `<span class="status amber">Missing</span>`,
    operator.trackerInstalled ? "Installed" : planByKey(operator.membershipPlan)?.name === "Platinum" ? "Eligible" : "Not eligible",
    safetyStatus(operator)
  ]));
}

function paymentTable(rows, showActions = false) {
  if (!rows.length) return `<div class="empty-state">No payments yet.</div>`;
  return table(["Date", "Payer", "Method", "Amount", "Purpose", "Cash collector", "Status"], rows.map((payment) => [
    compactDate(payment.createdAt),
    `${escapeHtml(payment.payerName)}<br><span class="microcopy">${escapeHtml(payment.membershipNumber || payment.payerType)}</span>`,
    payment.method,
    money(payment.amount),
    payment.purpose,
    payment.collectorName || "Not cash",
    statusPill(payment.status, payment.status === "reconciled" ? "green" : "amber") + (showActions ? `<br><button class="quiet-btn small-btn" type="button" data-reconcile-payment="${escapeAttr(payment.id)}">Mark deposited</button>` : "")
  ]));
}

function financeLedgerTable(rows) {
  if (!rows.length) return `<div class="empty-state">No finance ledger records yet.</div>`;
  return table(["Date", "Type", "Category", "Source / payee", "Method", "Amount", "Reference", "Notes"], rows.map((row) => [
    compactDate(row.date),
    statusPill(row.type, row.type === "income" ? "green" : "amber"),
    escapeHtml(row.category),
    escapeHtml(row.source),
    escapeHtml(row.method),
    `<strong class="${row.type === "income" ? "money-positive" : "money-negative"}">${row.type === "income" ? "+" : "-"} ${money(row.amount)}</strong>`,
    escapeHtml(row.reference || ""),
    escapeHtml(row.notes || "")
  ]));
}

function cardTable(rows) {
  if (!rows.length) return `<div class="empty-state">No cards yet.</div>`;
  return table(["Card", "Operator", "Plan", "QR token", "Status", "Replaced by"], rows.map((card) => {
    const operator = state.operators.find((item) => item.id === card.operatorId);
    return [
      card.cardNumber,
      operator?.fullName || "Unknown",
      planByKey(card.membershipPlan)?.name || card.membershipPlan,
      `<span class="microcopy">${escapeHtml(card.qrToken)}</span>`,
      statusPill(card.status, card.status === "active" ? "green" : card.status === "print queue" ? "amber" : "red"),
      card.replacedBy || ""
    ];
  }));
}

function motorcycleTable(rows) {
  if (!rows.length) return `<div class="empty-state">No motorcycles mapped yet.</div>`;
  return table(["Plate", "Owner", "Operator", "Agreement", "Target/pay", "Helmets", "Tracker"], rows.map((bike) => {
    const owner = state.owners.find((item) => item.id === bike.ownerId);
    const operator = state.operators.find((item) => item.id === bike.assignedOperatorId);
    return [
      `<strong>${escapeHtml(bike.plateNumber)}</strong><br><span class="microcopy">${escapeHtml(bike.make)}</span>`,
      owner?.fullName || "",
      operator?.fullName || "Unassigned",
      bike.agreementType,
      bike.agreementType === "Target based" ? money(bike.monthlyTarget) : money(bike.monthlyPay),
      String(bike.helmetCount),
      bike.trackerInstalled ? statusPill("Installed", "green") : bike.trackerEligible ? statusPill("Eligible", "amber") : "No"
    ];
  }));
}

function fundTable(rows) {
  if (!rows.length) return `<div class="empty-state">No owner fund entries yet.</div>`;
  return table(["Motorcycle", "Owner", "Income", "Expenses", "Net progress"], rows.map((row) => [
    row.motorcycle,
    row.owner,
    money(row.income),
    money(row.expenses),
    `<strong class="${row.net >= 0 ? "money-positive" : "money-negative"}">${money(row.net)}</strong>`
  ]));
}

function fundEntryTable(rows) {
  if (!rows.length) return `<div class="empty-state">No transactions for this motorcycle filter yet.</div>`;
  return table(["Date", "Motorcycle", "Owner", "Type", "Amount", "Note"], rows.map((entry) => {
    const bike = state.motorcycles.find((item) => item.id === entry.motorcycleId);
    const owner = state.owners.find((item) => item.id === entry.ownerId);
    return [
      compactDate(entry.createdAt),
      bike ? `${escapeHtml(bike.plateNumber)} - ${escapeHtml(bike.make)}` : "",
      owner?.fullName || "",
      statusPill(entry.type, entry.type === "income" ? "green" : "amber"),
      money(entry.amount),
      escapeHtml(entry.note || "")
    ];
  }));
}

function cooperativeTable(rows) {
  if (!rows.length) return `<div class="empty-state">No cooperative requests yet.</div>`;
  return table(["Cooperative", "District", "Members", "Bikes", "Loan amount", "Guarantor status"], rows.map((coop) => [
    coop.name,
    coop.district,
    String(coop.members),
    String(coop.requestedMotorcycles),
    money(coop.loanAmount),
    statusPill(coop.guarantorStatus, "amber")
  ]));
}

function reminderTable(rows) {
  if (!rows.length) return `<div class="empty-state">No reminders are due today.</div>`;
  return table(["Member", "Expires", "Days left", "Channel", "Message"], rows.map((item) => [
    `${escapeHtml(item.fullName)}<br><span class="microcopy">${escapeHtml(item.membershipNumber)}</span>`,
    compactDate(item.expiresOn),
    statusPill(`${item.daysLeft} day${item.daysLeft === 1 ? "" : "s"}`, item.daysLeft <= 3 ? "red" : "amber"),
    "Email, WhatsApp, SMS",
    `Your ${escapeHtml(planByKey(item.membershipPlan)?.name || item.membershipPlan)} membership expires soon. Renew through QR payment.`
  ]));
}

function reminderLogTable(rows) {
  if (!rows.length) return `<div class="empty-state">No reminder dispatch has been recorded yet.</div>`;
  return table(["Date", "Member", "Channel", "Days left", "Status", "Message"], rows.slice(0, 30).map((log) => [
    compactDate(log.createdAt),
    `${escapeHtml(log.fullName)}<br><span class="microcopy">${escapeHtml(log.membershipNumber)}</span>`,
    log.channel,
    `${log.daysLeft}`,
    statusPill(log.status, "green"),
    escapeHtml(log.message)
  ]));
}

function table(headers, rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function cardPreview(operator, card) {
  const plan = planByKey(card?.membershipPlan || operator.membershipPlan);
  const token = card?.qrToken || `qr-${operator.id}-preview`;
  const verifyUrl = `${appBaseUrl()}/?verify=${encodeURIComponent(token)}`;
  return `
    <div class="card-preview">
      <div class="card-stack">
        <div class="id-card id-card-front plan-${escapeAttr(plan?.key || "regular")}" data-id-card style="--card-color:${plan?.color || "#10b91f"}">
          <div class="id-card-top">
            <img src="./assets/macokasa-logo.png" alt="MACOKASA logo" />
            <div>
              <strong>MACOKASA MEMBER ID</strong>
              <small>Kabaza verified membership</small>
            </div>
            <span class="card-tier" data-card-plan-label>${escapeHtml(plan?.name || "Member")}</span>
          </div>
          <div class="id-card-body">
            <div class="member-photo has-image" data-card-photo-preview style="background-image:url('./assets/member-photo-placeholder.png')">
              <span>${initials(operator.fullName)}</span>
            </div>
            <div class="id-card-details">
              <h3 data-card-name>${escapeHtml(operator.fullName)}</h3>
              <div class="id-field"><span>Membership no.</span><strong data-card-number>${escapeHtml(operator.membershipNumber)}</strong></div>
              <div class="id-field"><span>Operating area</span><strong data-card-area>${escapeHtml(operator.operatingArea)}</strong></div>
              <div class="id-pair">
                <div class="id-field"><span>District</span><strong data-card-district>${escapeHtml(operator.district)}</strong></div>
                <div class="id-field"><span>Sex</span><strong data-card-sex>${escapeHtml(operator.sex || "Not recorded")}</strong></div>
              </div>
            </div>
            <a class="qr-link" href="${escapeAttr(verifyUrl)}" target="_blank" rel="noreferrer" aria-label="Scan MACOKASA card">
              <div class="qr-box" data-qr="${escapeAttr(verifyUrl)}">
                <span class="microcopy">QR</span>
              </div>
              <strong>SCAN ME</strong>
            </a>
          </div>
        </div>
        <div class="id-card id-card-back plan-${escapeAttr(plan?.key || "regular")}" style="--card-color:${plan?.color || "#10b91f"}">
          <div class="id-card-back-head">
            <img src="./assets/macokasa-logo.png" alt="MACOKASA logo" />
            <div>
              <strong>MACOKASA</strong>
              <span>Malawi Coalition for Kabaza Stakeholders Association</span>
            </div>
          </div>
          <div class="back-message">
            <strong>This card is the property of MACOKASA.</strong>
            <p>If lost and found, return it to the nearest MACOKASA office, the chairperson of the Kabaza rank, or the nearest police unit.</p>
          </div>
          <div class="back-strip">
            <span>${escapeHtml(operator.membershipNumber)}</span>
            <span>${escapeHtml(card?.cardNumber || "PREVIEW CARD")}</span>
          </div>
        </div>
      </div>
      <div class="card-preview-info">
        <div><strong>Verification</strong><span>${escapeHtml(card?.status || "preview only")}</span></div>
        <div><strong>URL</strong><span>${escapeHtml(verifyUrl)}</span></div>
      </div>
    </div>
  `;
}

function renderQrCodes() {
  document.querySelectorAll("[data-qr]").forEach((box) => {
    const value = box.dataset.qr;
    box.innerHTML = "";
    if (window.QRCode?.toCanvas) {
      window.QRCode.toCanvas(value, { width: 76, margin: 0 }, (error, canvas) => {
        if (error) {
          box.textContent = "QR unavailable";
          return;
        }
        box.appendChild(canvas);
      });
    } else if (window.QRCode) {
      new window.QRCode(box, {
        text: value,
        width: 76,
        height: 76,
        correctLevel: window.QRCode.CorrectLevel?.M
      });
    } else {
      box.innerHTML = `<strong>QR</strong><span class="microcopy">${escapeHtml(value.slice(-18))}</span>`;
    }
  });
}

function updateCardPreviewFromForm() {
  const form = document.querySelector("[data-card-designer]");
  const card = document.querySelector("[data-id-card]");
  if (!form || !card) return;
  const values = formValues(form);
  const plan = planByKey(values.cardPlan);
  document.querySelectorAll(".id-card-front, .id-card-back").forEach((node) => {
    node.style.setProperty("--card-color", plan?.color || "#10b91f");
    node.classList.remove("plan-regular", "plan-silver", "plan-gold", "plan-platinum");
    node.classList.add(`plan-${plan?.key || "regular"}`);
  });
  setText("[data-card-plan-label]", plan?.name || "Member");
  setText("[data-card-name]", values.cardName || "Member name");
  setText("[data-card-number]", values.cardNumber || "MCK-0000");
  setText("[data-card-area]", values.cardArea || "Operating area");
  setText("[data-card-district]", values.cardDistrict || "District");
  setText("[data-card-sex]", values.cardSex || "Sex");
  const photo = document.querySelector("[data-card-photo-preview] span");
  if (photo) photo.textContent = initials(values.cardName || "Member");
}

function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
}

function select(name, options, selected) {
  return `<select class="select-control" name="${name}">${options.map((option) => `<option value="${escapeAttr(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`;
}

function planSelect(name, selected, audience) {
  return `<select class="select-control" name="${name}">${membershipPlans
    .filter((plan) => !audience || plan.audience === audience)
    .map((plan) => `<option value="${plan.key}" ${plan.key === selected ? "selected" : ""}>${escapeHtml(plan.name)} - ${money(plan.annualFee)}</option>`)
    .join("")}</select>`;
}

function ownerSelect(name) {
  return `<select class="select-control" name="${name}">${state.owners.map((owner) => `<option value="${owner.id}">${escapeHtml(owner.fullName)}</option>`).join("")}</select>`;
}

function operatorSelect(name) {
  return `<select class="select-control" name="${name}">${state.operators.map((operator) => `<option value="${operator.id}">${escapeHtml(operator.fullName)}</option>`).join("")}</select>`;
}

function motorcycleSelect(name) {
  return `<select class="select-control" name="${name}">${state.motorcycles.map((bike) => `<option value="${bike.id}">${escapeHtml(bike.plateNumber)} - ${escapeHtml(bike.make)}</option>`).join("")}</select>`;
}

function motorcycleFilterSelect(name, selected) {
  return `<select class="select-control" name="${name}" data-owner-bike-filter>
    <option value="all" ${selected === "all" ? "selected" : ""}>All motorcycles</option>
    ${state.motorcycles.map((bike) => `<option value="${bike.id}" ${bike.id === selected ? "selected" : ""}>${escapeHtml(bike.plateNumber)} - ${escapeHtml(bike.make)}</option>`).join("")}
  </select>`;
}

function dueReminders() {
  return state.operators
    .map((operator) => ({ ...operator, daysLeft: daysUntil(operator.expiresOn) }))
    .filter((operator) => reminderDays.includes(operator.daysLeft) || operator.daysLeft < 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

function sexCounts() {
  const counts = countBy(state.operators, "sex");
  return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function participationShare(sex) {
  const total = Math.max(1, state.operators.length);
  return Math.round((state.operators.filter((operator) => operator.sex === sex).length / total) * 100);
}

function districtCounts() {
  const counts = countBy(state.operators, "district");
  return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function planCounts() {
  const counts = {};
  state.operators.forEach((operator) => {
    const plan = planByKey(operator.membershipPlan)?.name || operator.membershipPlan;
    counts[plan] = (counts[plan] || 0) + 1;
  });
  return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function ownerFundRows(filterId = "all") {
  return state.motorcycles
    .filter((bike) => filterId === "all" || bike.id === filterId)
    .map((bike) => {
    const entries = state.fundEntries.filter((entry) => entry.motorcycleId === bike.id);
    const income = entries.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + numberValue(entry.amount), 0);
    const expenses = entries.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + numberValue(entry.amount), 0);
    const owner = state.owners.find((item) => item.id === bike.ownerId);
    return {
      motorcycle: `${bike.plateNumber} - ${bike.make}`,
      owner: owner?.fullName || "",
      income,
      expenses,
      net: income - expenses
    };
  });
}

function ownerFundTotals(rows) {
  return rows.reduce((totals, row) => ({
    income: totals.income + numberValue(row.income),
    expenses: totals.expenses + numberValue(row.expenses),
    net: totals.net + numberValue(row.net)
  }), { income: 0, expenses: 0, net: 0 });
}

function filteredFundEntries(filterId = "all") {
  return [...state.fundEntries]
    .filter((entry) => filterId === "all" || entry.motorcycleId === filterId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function financeSummary() {
  const subscriptionIncome = state.payments
    .filter((payment) => payment.payerType !== "donor")
    .reduce((sum, payment) => sum + numberValue(payment.amount), 0);
  const donations = state.donations.reduce((sum, donation) => sum + numberValue(donation.amount), 0);
  const manualIncome = state.financeEntries
    .filter((entry) => entry.type === "income" && !["Membership subscriptions", "Donations"].includes(entry.category))
    .reduce((sum, entry) => sum + numberValue(entry.amount), 0);
  const expense = state.financeEntries
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + numberValue(entry.amount), 0);
  const cashHeld = state.payments
    .filter((payment) => payment.method === "Cash" && payment.status !== "reconciled")
    .reduce((sum, payment) => sum + numberValue(payment.amount), 0);
  const income = subscriptionIncome + donations + manualIncome;
  return { subscriptionIncome, donations, manualIncome, income, expense, balance: income - expense, cashHeld };
}

function financeLedgerRows() {
  const paymentRows = state.payments.map((payment) => ({
    date: payment.createdAt,
    type: "income",
    category: payment.payerType === "donor" ? "Donations" : "Membership subscriptions",
    source: payment.payerName,
    method: payment.method,
    amount: numberValue(payment.amount),
    reference: payment.reference,
    notes: payment.purpose
  }));
  const donationRows = state.donations.map((donation) => ({
    date: donation.createdAt,
    type: "income",
    category: "Donations",
    source: donation.donorName,
    method: donation.method,
    amount: numberValue(donation.amount),
    reference: donation.id,
    notes: donation.purpose
  }));
  const financeRows = state.financeEntries.map((entry) => ({
    date: entry.createdAt,
    type: entry.type,
    category: entry.category,
    source: entry.source,
    method: entry.method,
    amount: numberValue(entry.amount),
    reference: entry.reference,
    notes: entry.notes
  }));
  return [...paymentRows, ...donationRows, ...financeRows]
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function paymentMethodRows() {
  const rows = {};
  [...state.payments, ...state.donations].forEach((item) => {
    const method = item.method || "Unknown";
    rows[method] = (rows[method] || 0) + numberValue(item.amount);
  });
  return Object.entries(rows).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function financeCategoryRows() {
  const rows = {};
  state.financeEntries.filter((entry) => entry.type === "expense").forEach((entry) => {
    rows[entry.category] = (rows[entry.category] || 0) + numberValue(entry.amount);
  });
  return Object.entries(rows).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function barChart(rows) {
  if (!rows.length) return `<div class="empty-state">No chart data yet.</div>`;
  const max = Math.max(...rows.map((row) => row.value), 1);
  return `<div class="chart">${rows.map((row) => `
    <div class="chart-row">
      <strong>${escapeHtml(row.label)}</strong>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(8, (row.value / max) * 100)}%"></div></div>
      <span>${row.value}</span>
    </div>
  `).join("")}</div>`;
}

function donutChart(rows, label) {
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
  const female = rows.find((row) => row.label === "Female")?.value || 0;
  const femalePct = Math.round((female / total) * 100);
  return `
    <div class="donut-wrap">
      <div class="donut" style="--pct:${femalePct}">
        <strong>${femalePct}%</strong>
        <span>${escapeHtml(label)}</span>
      </div>
      <div class="split-list">
        ${rows.map((row) => `<div class="record-card"><strong>${escapeHtml(row.label || "Not recorded")}</strong><span>${row.value} member(s)</span></div>`).join("")}
      </div>
    </div>
  `;
}

function iconForMetric(label) {
  const key = label.toLowerCase();
  if (key.includes("operator")) return iconRegistry();
  if (key.includes("owner")) return iconMotorcycle();
  if (key.includes("cash") || key.includes("revenue") || key.includes("donation")) return iconPayment();
  if (key.includes("female") || key.includes("participation")) return iconUserPlus();
  if (key.includes("safety") || key.includes("licence")) return iconShield();
  if (key.includes("fleet") || key.includes("motorcycle")) return iconMotorcycle();
  if (key.includes("expense") || key.includes("balance") || key.includes("inflow")) return iconPayment();
  return iconChart();
}

function initials(name) {
  return String(name || "M")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "M";
}

function safetyStatus(operator) {
  const safe = operator.hasLicense && operator.helmetUse && operator.passengerHelmet && operator.licensePlate;
  return safe ? `<span class="status green">Safer rank ready</span>` : `<span class="status amber">Needs action</span>`;
}

function statusPill(text, tone = "") {
  return `<span class="status ${tone}">${escapeHtml(text)}</span>`;
}

function countBy(rows, key) {
  return rows.reduce((map, row) => {
    const value = row[key] || "Unknown";
    map[value] = (map[value] || 0) + 1;
    return map;
  }, {});
}

function planByKey(key) {
  return membershipPlans.find((plan) => plan.key === key);
}

function parseVerificationToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return parseVerificationToken(url.searchParams.get("verify") || url.searchParams.get("token") || "");
  } catch {
    return raw.includes("token=") ? raw.split("token=").pop().trim() : raw;
  }
}

function verifyCardToken(token) {
  const card = state.cards.find((item) => item.qrToken === token);
  const operator = card ? state.operators.find((item) => item.id === card.operatorId) : null;
  return { card, operator };
}

function activeRoleLabel() {
  return {
    public: "Public visitor",
    owner: "Motorcycle owner",
    staff: "MACOKASA staff",
    printing: "Printing authority"
  }[activeRole] || "Public visitor";
}

function money(value) {
  return `MWK ${numberValue(value).toLocaleString("en-US")}`;
}

function compactNumber(value) {
  return numberValue(value).toLocaleString("en-US");
}

function appBaseUrl() {
  return config.publicBaseUrl && config.publicBaseUrl !== "__origin__" ? config.publicBaseUrl : window.location.origin;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function daysUntil(dateString) {
  const todayDate = new Date(today());
  const target = new Date(dateString);
  return Math.ceil((target - todayDate) / 86400000);
}

function compactDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function showToast(message) {
  const toast = document.querySelector(".toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function iconHome() { return svg("M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3v-9.5Z"); }
function iconUserPlus() { return svg("M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM3 21a6 6 0 0 1 12 0M19 8v6M16 11h6"); }
function iconDashboard() { return svg("M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-4H4v4Z"); }
function iconRegistry() { return svg("M4 4h16v16H4V4Zm4 5h8M8 13h8M8 17h5"); }
function iconBell() { return svg("M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16l-2-2ZM10 20h4"); }
function iconPayment() { return svg("M3 6h18v12H3V6Zm0 4h18M7 15h4"); }
function iconCard() { return svg("M3 5h18v14H3V5Zm3 4h6M6 13h4M15 12h3"); }
function iconMotorcycle() { return svg("M5.5 17.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm13 0a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM8 18h4.4l2.6-5h2.2l1.3 5M7 18l2.4-6.2h3.2l2.4 3.2M10.5 8.5h3.5l1 3.3M14 8.5l2.5-2.5M9.2 11.8h6.1"); }
function iconShield() { return svg("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"); }
function iconCoop() { return svg("M7 11a4 4 0 1 1 8 0M3 21a6 6 0 0 1 12 0M17 7h4M19 5v4M18 21h3v-6h-3v6Z"); }
function iconChart() { return svg("M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-9"); }
function iconCloud() { return svg("M17 18H7a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 18 9.5 4.25 4.25 0 0 1 17 18Z"); }
function svg(path) {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${path}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
