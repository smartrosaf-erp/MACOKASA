import { demoState, districts, membershipPlans, paymentMethods, publicSources, reminderDays } from "./data.js";

const config = window.MACOKASA_CONFIG || {};
const app = document.querySelector("#app");
const storageKey = "macokasa-kabaza-demo-state-v1";
const collections = ["operators", "owners", "motorcycles", "payments", "cards", "cooperatives", "fundEntries", "donations"];
let activeSection = "public";
let activeRole = "staff";
let toastTimer = null;
let supabaseClient = null;
let supabaseEnabled = false;
let state = loadState();

const navItems = [
  ["public", "Public website", iconHome, ["public", "owner", "staff", "printing"]],
  ["registration", "Public registration", iconUserPlus, ["public", "owner", "staff"]],
  ["staff", "Staff ERP dashboard", iconDashboard, ["staff"]],
  ["operators", "Operator database", iconRegistry, ["staff"]],
  ["membership", "Membership and reminders", iconBell, ["staff"]],
  ["payments", "Payments and cash", iconPayment, ["staff"]],
  ["cards", "ID cards and QR", iconCard, ["staff", "printing"]],
  ["owners", "Owner portal", iconMotorcycle, ["owner", "staff"]],
  ["safety", "Licensing and safety", iconShield, ["staff"]],
  ["cooperatives", "Cooperative loans", iconCoop, ["staff"]],
  ["analytics", "Impact analytics", iconChart, ["public", "staff"]],
  ["deployment", "GitHub, Render, Supabase", iconCloud, ["staff"]]
];

init();

function init() {
  render();
  void connectSupabase();
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("submit", handleSubmit);
}

function loadState() {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) return { ...clone(demoState), ...JSON.parse(stored) };
  } catch {
    return clone(demoState);
  }
  return clone(demoState);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
    showToast("Connected to Supabase. Demo records were replaced by live project records where available.");
  } catch (error) {
    console.error(error);
    showToast("Supabase connection failed. Continuing in local demo mode.");
  }
}

async function addRecord(collection, record) {
  state[collection] = [record, ...(state[collection] || [])];
  persist();
  render();
  if (supabaseEnabled && supabaseClient) {
    const { error } = await supabaseClient.from("macokasa_records").insert({ collection, payload: record });
    if (error) showToast(`Saved locally, but Supabase insert failed: ${error.message}`);
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
    if (error) showToast(`Updated locally, but Supabase update failed: ${error.message}`);
  }
}

function render() {
  if (!navItems.some(([key, , , roles]) => key === activeSection && roles.includes(activeRole))) {
    activeSection = activeRole === "owner" ? "owners" : activeRole === "printing" ? "cards" : "public";
  }
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <img src="./assets/macokasa-logo.png" alt="MACOKASA logo" />
          <div class="brand-title">
            <strong>MACOKASA</strong>
            <span>Kabaza operator and stakeholder management</span>
          </div>
        </div>
        <div class="top-actions">
          <select class="role-switcher" data-role-switcher aria-label="Current portal role">
            ${roleOption("public", "Public visitor")}
            ${roleOption("owner", "Motorcycle owner")}
            ${roleOption("staff", "MACOKASA staff")}
            ${roleOption("printing", "Printing authority")}
          </select>
          <button class="quiet-btn" type="button" data-action="reset-demo">Reset demo data</button>
          <button class="secondary-btn" type="button" data-section="deployment">Deployment setup</button>
        </div>
      </header>
      <div class="layout">
        <aside class="sidebar">
          <nav class="nav-group" aria-label="MACOKASA modules">
            ${navItems
              .filter(([, , , roles]) => roles.includes(activeRole))
              .map(([key, label, icon]) => `
                <button class="nav-button ${activeSection === key ? "active" : ""}" type="button" data-section="${key}">
                  ${icon()} <span>${label}</span>
                </button>
              `).join("")}
          </nav>
        </aside>
        <main class="workspace">${renderActiveSection()}</main>
      </div>
      <div class="toast" role="status" aria-live="polite"></div>
    </div>
  `;
  requestAnimationFrame(renderQrCodes);
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
    deployment: renderDeployment
  };
  return (sections[activeSection] || renderPublicWebsite)();
}

function renderPublicWebsite() {
  const impact = state.impact;
  const registeredShare = ((impact.registeredOperators / impact.reportedMotorcycles) * 100).toFixed(2);
  return `
    <section class="hero">
      <div class="hero-main">
        <p class="eyebrow">Malawi Coalition for Kabaza Stakeholders Association</p>
        <h1>Formalizing Malawi's Kabaza economy with safer riders, verified members, and accountable ownership.</h1>
        <p>
          MACOKASA can use this system as a national operator database, subscription platform, ID-card verification tool,
          owner portal, safety compliance desk, and public impact website connected to the ERP.
        </p>
        <div class="hero-actions">
          <button class="primary-btn" type="button" data-section="registration">Register membership</button>
          <button class="quiet-btn" type="button" data-section="analytics">View public impact</button>
          <button class="quiet-btn" type="button" data-action="donate">Donate to safety work</button>
        </div>
      </div>
      <aside class="hero-side">
        <h2>Online facts used in this prototype</h2>
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
      ${metric("Estimated active fleet", compactNumber(impact.estimatedFleet), "Planning baseline from your brief and public reporting")}
      ${metric("Reported motorcycles", compactNumber(impact.reportedMotorcycles), "Published figure used to size the registration gap")}
      ${metric("Registered operators", compactNumber(impact.registeredOperators), `${registeredShare}% registration baseline`)}
      ${metric("Registration target", `${impact.targetRegistrationShare}%`, "Ambition for formal national coverage")}
      <div class="panel span-8">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Public data story</p>
            <h2>What the public website should communicate</h2>
          </div>
          <span class="status green">Live ERP figures ready</span>
        </div>
        <div class="split-list">
          <div class="record-card"><strong>Livelihoods and formal work</strong><span>Kabaza supports youth employment and small-scale motorcycle ownership, but it needs verified membership and safer operating standards.</span></div>
          <div class="record-card"><strong>Safety and public health</strong><span>The portal tracks helmets, passenger helmets, licence status, licence plates, training history, and complaints so safer operators can be promoted at ranks.</span></div>
          <div class="record-card"><strong>Stakeholder coordination</strong><span>MACOKASA staff, ROSAF, printing authorities, city councils, police, owners, and cooperatives can work from one evidence-backed system.</span></div>
        </div>
      </div>
      <div class="panel span-4">
        <h2>Donation window</h2>
        <p class="footer-note">Public donations can be routed to helmet campaigns, training support, safer-rank promotion, or data collection.</p>
        <form class="form-grid" data-form="donation">
          <label class="field full"><span>Donor name</span><input class="input-control" name="donorName" required value="Road safety supporter" /></label>
          <label class="field"><span>Amount MWK</span><input class="input-control" type="number" name="amount" min="1" required value="50000" /></label>
          <label class="field"><span>Method</span>${select("method", paymentMethods, "Bank")}</label>
          <label class="field full"><span>Purpose</span><input class="input-control" name="purpose" value="Helmet safety campaign" /></label>
          <button class="primary-btn" type="submit">Record donation</button>
        </form>
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
            <p class="eyebrow">One login window concept</p>
            <h2>Member, owner, and staff entry points</h2>
          </div>
          <span class="status">${activeRoleLabel()}</span>
        </div>
        <div class="login-grid">
          <div class="login-card"><strong>Public member</strong><p class="footer-note">Operators register, choose Regular/Silver/Gold/Platinum, pay, and receive card status updates.</p><button class="quiet-btn" type="button" data-role="public">Use public view</button></div>
          <div class="login-card"><strong>Motorcycle owner</strong><p class="footer-note">Owners map motorcycles, agreements, operator income, expenses, and complaints feedback.</p><button class="quiet-btn" type="button" data-role="owner">Use owner portal</button></div>
          <div class="login-card"><strong>MACOKASA staff</strong><p class="footer-note">Configured staff use the full ERP for verification, finance, safety, printing, and analytics.</p><button class="secondary-btn" type="button" data-role="staff">Use staff ERP</button></div>
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
    </section>
  `;
}

function renderStaffDashboard() {
  const due = dueReminders();
  const cashHeld = state.payments.filter((payment) => payment.method === "Cash" && payment.status !== "reconciled").reduce((sum, payment) => sum + numberValue(payment.amount), 0);
  const unlicensed = state.operators.filter((operator) => !operator.hasLicense).length;
  const activeCards = state.cards.filter((card) => card.status === "active").length;
  return `
    <section class="grid">
      ${metric("Operators", state.operators.length, "Registered in the demo ERP")}
      ${metric("Owners", state.owners.length, "Owner portal accounts")}
      ${metric("Cash in custody", money(cashHeld), "Requires deposit and reconciliation")}
      ${metric("Due reminders", due.length, "Membership notices across 4 weeks to 1 day")}
      <div class="panel span-8">
        <div class="panel-header">
          <div>
            <p class="eyebrow">MACOKASA staff ERP</p>
            <h2>Command center</h2>
          </div>
          <span class="status ${supabaseEnabled ? "green" : "amber"}">${supabaseEnabled ? "Supabase live" : "Local demo mode"}</span>
        </div>
        <div class="split-list">
          <div class="record-card"><strong>Finance control</strong><span>Bank, POS, AirtelMoney, Mpamba, and Cash records are captured. Cash payments require collector name until deposit reconciliation.</span></div>
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
          <button class="quiet-btn" type="button" data-section="analytics">View analytics</button>
        </div>
      </div>
      <div class="panel span-12">
        <div class="table-header"><h2>Priority renewal reminders</h2><span class="status amber">${due.length} queued</span></div>
        ${reminderTable(due)}
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
          ${reminderDays.map((day) => `<div class="record-card"><strong>${day} day${day === 1 ? "" : "s"} before expiry</strong><span>Email, WhatsApp, or SMS notification can be sent by Supabase Edge Function.</span></div>`).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderPayments() {
  const unreconciled = state.payments.filter((payment) => payment.method === "Cash" && payment.status !== "reconciled");
  return `
    <section class="grid">
      <div class="panel span-5">
        <div class="panel-header"><div><p class="eyebrow">Finance intake</p><h2>Record subscription payment</h2></div></div>
        <form class="form-grid" data-form="payment">
          <label class="field full"><span>Payer name</span><input class="input-control" name="payerName" required /></label>
          <label class="field"><span>Payer type</span>${select("payerType", ["operator", "owner", "donor"], "operator")}</label>
          <label class="field"><span>Membership number</span><input class="input-control" name="membershipNumber" placeholder="MCK-..." /></label>
          <label class="field"><span>Payment method</span>${select("method", paymentMethods, "AirtelMoney")}</label>
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
        <div class="table-header"><h2>Cash accountability</h2><span class="status amber">${unreconciled.length} unreconciled</span></div>
        ${unreconciled.length ? paymentTable(unreconciled, true) : `<div class="empty-state">No cash is currently waiting for bank deposit reconciliation.</div>`}
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
          <div><p class="eyebrow">PVC ATM-size ID card</p><h2>Card printing and QR verification</h2></div>
          <span class="status ${activeRole === "printing" ? "green" : ""}">${activeRole === "printing" ? "Printing portal" : "Staff control"}</span>
        </div>
        ${selectedOperator ? cardPreview(selectedOperator, selectedCard) : `<div class="empty-state">No operator is available for card preview.</div>`}
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
          <label class="field full"><span>New membership category</span>${planSelect("membershipPlan", selectedOperator?.membershipPlan || "regular")}</label>
          <button class="primary-btn" type="submit">Invalidate old QR and queue card</button>
        </form>
        <p class="footer-note">A photocopied QR code can still scan technically. The control is live token validation plus replacement invalidation, card print security, and staff/passenger verification screens.</p>
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
  const rows = ownerFundRows();
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
        <form class="form-grid" data-form="fund">
          <label class="field"><span>Owner</span>${ownerSelect("ownerId")}</label>
          <label class="field"><span>Motorcycle</span>${motorcycleSelect("motorcycleId")}</label>
          <label class="field"><span>Type</span>${select("type", ["income", "expense"], "income")}</label>
          <label class="field"><span>Amount MWK</span><input class="input-control" type="number" min="1" name="amount" required /></label>
          <label class="field full"><span>Note</span><input class="input-control" name="note" value="Weekly target collection" /></label>
          <button class="primary-btn" type="submit">Record owner fund entry</button>
        </form>
        <div class="table-header" style="margin-top:16px"><h3>Progress by motorcycle</h3></div>
        ${fundTable(rows)}
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
  const safetyScore = Math.round((state.operators.filter((operator) => operator.hasLicense && operator.helmetUse && operator.passengerHelmet && operator.licensePlate).length / Math.max(1, state.operators.length)) * 100);
  return `
    <section class="grid">
      ${metric("Operator safety score", `${safetyScore}%`, "Licence, helmet, passenger helmet, and plate")}
      ${metric("Membership revenue", money(state.payments.filter((payment) => payment.payerType !== "donor").reduce((sum, payment) => sum + numberValue(payment.amount), 0)), "Recorded subscriptions")}
      ${metric("Public donations", money(state.donations.reduce((sum, donation) => sum + numberValue(donation.amount), 0)), "Donation button intake")}
      ${metric("Fleet owner funds", money(state.fundEntries.reduce((sum, entry) => sum + (entry.type === "income" ? numberValue(entry.amount) : -numberValue(entry.amount)), 0)), "Managed for owners, not held by MACOKASA")}
      <div class="panel span-6">
        <div class="table-header"><h2>Operators by district</h2></div>
        ${barChart(districtRows)}
      </div>
      <div class="panel span-6">
        <div class="table-header"><h2>Membership mix</h2></div>
        ${barChart(planRows)}
      </div>
      <div class="panel span-12">
        <div class="table-header"><h2>Public website analytics feed</h2><span class="status green">Shareable live figures</span></div>
        <p class="footer-note">When Supabase is connected, these figures can power public stories, dashboards, donor reports, and district-level registration progress without manually copying numbers.</p>
      </div>
    </section>
  `;
}

function renderDeployment() {
  return `
    <section class="grid">
      <div class="panel span-7">
        <div class="panel-header">
          <div><p class="eyebrow">Free-plan architecture</p><h2>GitHub + Render + Supabase</h2></div>
          <span class="status ${supabaseEnabled ? "green" : "amber"}">${supabaseEnabled ? "Supabase connected" : "Demo mode"}</span>
        </div>
        <div class="split-list">
          <div class="record-card"><strong>1. GitHub</strong><span>Push this folder to a private GitHub repository. The included workflow checks JavaScript syntax and the Render build output.</span></div>
          <div class="record-card"><strong>2. Supabase</strong><span>Create a free Supabase project, run <code>supabase/schema.sql</code>, then use the project URL and anon key as Render environment variables.</span></div>
          <div class="record-card"><strong>3. Render</strong><span>Create a Static Site from the GitHub repository. Render runs <code>node scripts/write-config.mjs</code> and publishes the <code>public</code> folder.</span></div>
          <div class="record-card"><strong>4. Local first</strong><span>Use the local demo server now. No cloud accounts are required until the screens and data model are approved.</span></div>
        </div>
      </div>
      <div class="panel span-5">
        <h2>Current environment</h2>
        <div class="split-list">
          <div class="record-card"><strong>Mode</strong><span>${supabaseEnabled ? "Supabase live records" : "Local demo data with browser storage"}</span></div>
          <div class="record-card"><strong>Supabase URL</strong><span>${config.supabaseUrl ? escapeHtml(config.supabaseUrl) : "Not configured"}</span></div>
          <div class="record-card"><strong>Public base URL</strong><span>${escapeHtml(config.publicBaseUrl || "http://127.0.0.1:4177")}</span></div>
        </div>
      </div>
      <div class="panel span-12">
        <h2>Production caution</h2>
        <p class="footer-note">This prototype is client-first for quick free hosting. Before real payments, WhatsApp/SMS, QR security, or private member data goes live, add server-side payment callbacks, verified SMS/WhatsApp providers, strong Supabase RLS policies, audit logs, and privacy notices.</p>
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
  if (action === "reset-demo") {
    window.localStorage.removeItem(storageKey);
    state = clone(demoState);
    render();
    showToast("Demo data reset.");
  }
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
}

async function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const values = formValues(form);
  const handlers = {
    operator: submitOperator,
    payment: submitPayment,
    donation: submitDonation,
    card: submitCard,
    verify: submitVerify,
    motorcycle: submitMotorcycle,
    fund: submitFund,
    cooperative: submitCooperative
  };
  await handlers[form.dataset.form]?.(values);
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
  await addRecord("payments", {
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
    createdAt: today()
  });
  showToast("Payment saved.");
}

async function submitDonation(values) {
  await addRecord("donations", {
    id: newId("don"),
    donorName: values.donorName,
    amount: numberValue(values.amount),
    method: values.method,
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
    reference: "Pending mobile money",
    status: "pending",
    createdAt: today()
  });
  showToast("Old QR invalidated. New card queued and printing fee added.");
}

function submitVerify(values) {
  const token = String(values.token || "").split("token=").pop().trim();
  const card = state.cards.find((item) => item.qrToken === token);
  const result = document.querySelector("#verification-result");
  if (!card) {
    result.innerHTML = `<span class="status red">Fake or unknown card</span> No active MACOKASA card token was found.`;
    return;
  }
  const operator = state.operators.find((item) => item.id === card.operatorId);
  const tone = card.status === "active" ? "green" : "red";
  result.innerHTML = `<span class="status ${tone}">${escapeHtml(card.status)}</span> ${escapeHtml(operator?.fullName || "Unknown operator")} - ${escapeHtml(operator?.membershipNumber || "")}. ${card.replacedBy ? `Replaced by ${escapeHtml(card.replacedBy)}.` : ""}`;
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
    createdAt: today()
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

function formValues(form) {
  return Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [key, String(value).trim()]));
}

function metric(label, value, note) {
  return `<article class="metric span-3"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
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

function operatorTable(rows) {
  if (!rows.length) return `<div class="empty-state">No operators yet.</div>`;
  return table(["Member", "District", "Area", "Plan", "Licence", "Safety", "Expires"], rows.map((operator) => [
    `<strong>${escapeHtml(operator.fullName)}</strong><br><span class="microcopy">${escapeHtml(operator.membershipNumber)}</span>`,
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
    statusPill(payment.status, payment.status === "reconciled" ? "green" : "amber") + (showActions ? `<br><button class="quiet-btn" type="button">Mark deposited</button>` : "")
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
    `<strong>${money(row.net)}</strong>`
  ]));
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
  const verifyUrl = `${config.publicBaseUrl || window.location.origin}/?verify=token=${encodeURIComponent(token)}`;
  return `
    <div class="card-preview">
      <div class="id-card">
        <div class="id-card-top">
          <img src="./assets/macokasa-logo.png" alt="MACOKASA logo" />
          <div>
            <strong>MACOKASA MEMBER ID</strong>
            <div class="microcopy" style="color:rgba(255,255,255,.75)">PVC card, ATM size</div>
          </div>
          <span class="status">${escapeHtml(plan?.name || "Member")}</span>
        </div>
        <div class="id-card-body">
          <div>
            <h3>${escapeHtml(operator.fullName)}</h3>
            <div class="id-field"><span>Membership number</span><strong>${escapeHtml(operator.membershipNumber)}</strong></div>
            <div class="id-field"><span>Operating area</span><strong>${escapeHtml(operator.operatingArea)}</strong></div>
            <div class="id-field"><span>District</span><strong>${escapeHtml(operator.district)}</strong></div>
            <div class="id-field"><span>Plate</span><strong>${escapeHtml(operator.licensePlate || "Not recorded")}</strong></div>
          </div>
          <div class="qr-box" data-qr="${escapeAttr(verifyUrl)}">
            <span class="microcopy">QR loading</span>
          </div>
        </div>
      </div>
      <div class="split-list">
        <div class="record-card"><strong>Verification URL</strong><span>${escapeHtml(verifyUrl)}</span></div>
        <div class="record-card"><strong>Card token status</strong><span>${escapeHtml(card?.status || "preview only")}</span></div>
        <div class="record-card"><strong>Print instructions</strong><span>Include anti-copy laminate, serial number, QR token, and MACOKASA staff verification workflow.</span></div>
      </div>
    </div>
  `;
}

function renderQrCodes() {
  document.querySelectorAll("[data-qr]").forEach((box) => {
    const value = box.dataset.qr;
    box.innerHTML = "";
    if (window.QRCode?.toCanvas) {
      window.QRCode.toCanvas(value, { width: 96, margin: 1 }, (error, canvas) => {
        if (error) {
          box.textContent = "QR unavailable";
          return;
        }
        box.appendChild(canvas);
      });
    } else if (window.QRCode) {
      new window.QRCode(box, {
        text: value,
        width: 96,
        height: 96,
        correctLevel: window.QRCode.CorrectLevel?.M
      });
    } else {
      box.innerHTML = `<strong>QR</strong><span class="microcopy">${escapeHtml(value.slice(-18))}</span>`;
    }
  });
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

function dueReminders() {
  return state.operators
    .map((operator) => ({ ...operator, daysLeft: daysUntil(operator.expiresOn) }))
    .filter((operator) => reminderDays.includes(operator.daysLeft) || operator.daysLeft < 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
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

function ownerFundRows() {
  return state.motorcycles.map((bike) => {
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
function iconMotorcycle() { return svg("M5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm14 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM5 17h14l-2-7H8l-3 7Zm4-7 2-4h4l2 4"); }
function iconShield() { return svg("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"); }
function iconCoop() { return svg("M7 11a4 4 0 1 1 8 0M3 21a6 6 0 0 1 12 0M17 7h4M19 5v4M18 21h3v-6h-3v6Z"); }
function iconChart() { return svg("M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-9"); }
function iconCloud() { return svg("M17 18H7a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 18 9.5 4.25 4.25 0 0 1 17 18Z"); }
function svg(path) {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${path}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
