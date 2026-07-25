import { affiliatedMembers, demoState, districts, membershipPlans, paymentMethods, publicSources, reminderDays, stakeholders } from "./data.js";

const config = window.MACOKASA_CONFIG || {};
const app = document.querySelector("#app");
const storageKey = "macokasa-kabaza-state-v3";
const defaultStoryImage = "./assets/macokasa-road-safety-training.jpg";
const collections = ["operators", "owners", "motorcycles", "payments", "cards", "cooperatives", "fundEntries", "donations", "financeEntries", "stories", "storyTombstones", "reminderLogs"];
let activeSection = "public";
let activeRole = "public";
let toastTimer = null;
let supabaseClient = null;
let supabaseEnabled = false;
let realtimeChannel = null;
let liveDataStatus = config.useDemoData ? "local" : "connecting";
let lastLiveSyncAt = null;
let unlockedRoles = new Set(["public"]);
let authSession = null;
let authProfile = null;
let authChecked = false;
let authBusy = false;
let pendingRole = "";
let ownerFundFilterId = "all";
let donationChoice = { method: "card", amount: "50000" };
let subscriptionChoice = { method: "airtel", amount: "15000" };
let editingStoryId = "";
let selectedStoryId = "";
let storyFilter = "All";
let selectedCardOperatorId = "";
let activeCameraStream = null;
let activeCameraForm = null;
let cameraRequestId = 0;
let state = loadState();
let liveCollectionBaselines = {
  operators: state.operators?.length || 0,
  motorcycles: state.motorcycles?.length || 0,
  owners: state.owners?.length || 0
};

const navItems = [
  ["public", "Home", iconHome, ["public"]],
  ["catalogue", "Services", iconDashboard, ["public"]],
  ["stories", "Stories", iconStory, ["public"]],
  ["about", "About MACOKASA", iconCoop, ["public"]],
  ["registration", "Public registration", iconRegistry, ["public"]],
  ["donate", "Donate", iconPayment, ["public"]],
  ["portal", "Portal access", iconShield, ["public"]],
  ["partner", "Partner access", iconCoop, ["public"]],
  ["staff", "Staff ERP dashboard", iconDashboard, ["staff"]],
  ["operators", "Operator database", iconRegistry, ["staff"]],
  ["membership", "Membership and reminders", iconBell, ["staff"]],
  ["payments", "Finance", iconPayment, ["staff"]],
  ["cards", "ID cards and QR", iconCard, ["staff", "printing"]],
  ["owners", "Owner portal", iconMotorcycle, ["owner", "staff"]],
  ["safety", "Licensing and safety", iconShield, ["staff"]],
  ["cooperatives", "Cooperative loans", iconCoop, ["staff"]],
  ["analytics", "Impact analytics", iconChart, ["public"]],
  ["content", "Website content", iconStory, ["staff", "webadmin"]],
  ["operations", "Operations control", iconCloud, ["staff"]],
  ["privacy", "Privacy notice", iconShield, ["public"]],
  ["terms", "Terms of use", iconShield, ["public"]]
];

init();

function init() {
  installErrorBoundary();
  installConnectivityWatch();
  safely(render);
  void connectSupabase();
  document.addEventListener("click", (event) => safely(() => handleClick(event)));
  document.addEventListener("change", (event) => safely(() => handleChange(event)));
  document.addEventListener("input", (event) => safely(() => handleInput(event)));
  document.addEventListener("submit", (event) => safely(() => handleSubmit(event)));
}

/* ---- Resilience (P1-5, P1-6) ---- */

let lastGoodRender = "";

function safely(fn) {
  try {
    return fn();
  } catch (error) {
    reportFatal(error);
    return undefined;
  }
}

function installErrorBoundary() {
  window.addEventListener("error", (event) => reportFatal(event.error || event.message));
  window.addEventListener("unhandledrejection", (event) => reportFatal(event.reason));
}

function reportFatal(error) {
  console.error("[MACOKASA]", error);
  // If the app never painted, show a recovery screen rather than a blank page.
  if (!app || app.innerHTML.trim().length > 0) {
    showToast("Something went wrong. The last working view has been kept.");
    return;
  }
  app.innerHTML = `
    <div class="fatal-screen" role="alert">
      <img src="./assets/macokasa-logo-square.png" alt="MACOKASA" />
      <h1>We hit an unexpected problem</h1>
      <p>The MACOKASA platform could not finish loading. Your saved records on this device have not been changed.</p>
      <div class="fatal-actions">
        <button class="primary-btn" type="button" onclick="window.location.reload()">Reload the page</button>
        <a class="quiet-btn" href="./">Return to the website</a>
      </div>
      <details>
        <summary>Technical detail for support</summary>
        <pre>${escapeHtml(String(error?.stack || error || "Unknown error")).slice(0, 900)}</pre>
      </details>
    </div>
  `;
}

function installConnectivityWatch() {
  const sync = () => {
    const offline = !navigator.onLine;
    document.body.classList.toggle("is-offline", offline);
    if (offline) {
      liveDataStatus = "local";
      showToast("You are offline. Changes are saved on this device.");
    } else if (supabaseEnabled) {
      liveDataStatus = "live";
    }
    const badge = document.querySelector(".live-badge");
    if (badge) badge.className = `live-badge ${liveDataStatus}`;
  };
  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);
  if (!navigator.onLine) sync();
}

function loadState() {
  try {
    const currentStored = window.localStorage.getItem(storageKey);
    const legacyStored = window.localStorage.getItem("macokasa-kabaza-state-v2");
    const stored = currentStored || legacyStored;
    if (stored) {
      const normalized = normalizeState({ ...clone(demoState), ...JSON.parse(stored) });
      if (!currentStored && legacyStored) {
        normalized.stories = (normalized.stories || []).filter((story) => !["story-001", "story-002"].includes(story.id));
      }
      normalized.stories = mergeStoryDefaults(normalized.stories, normalized.storyTombstones);
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

function mergeStoryDefaults(stories = [], tombstones = []) {
  const existing = new Map(stories.map((story) => [story.id, story]));
  const deletedIds = new Set(tombstones.map((record) => record.storyId));
  const mergedDefaults = (demoState.stories || [])
    .filter((story) => !deletedIds.has(story.id))
    .map((story) => ({ ...story, ...(existing.get(story.id) || {}) }));
  const customStories = stories.filter((story) => !demoState.stories.some((item) => item.id === story.id));
  return [...customStories, ...mergedDefaults];
}

function persist() {
  window.localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(collections.map((key) => [key, state[key] || []]))));
}

async function connectSupabase() {
  if (!config.supabaseUrl || !config.supabaseAnonKey || config.useDemoData) {
    liveDataStatus = "local";
    authChecked = true;
    return;
  }
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    supabaseEnabled = true;

    // Restore any existing signed-in session before requesting records.
    await restoreSession();
    render();

    // Row level security means anonymous visitors read nothing here.
    // That is intentional: the public website runs on published content only.
    if (!authProfile?.isActive) {
      liveDataStatus = "live";
      lastLiveSyncAt = new Date();
      render();
      return;
    }

    const { data, error } = await supabaseClient.from("macokasa_records").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    const grouped = {};
    (data || []).forEach((row) => {
      grouped[row.collection] = grouped[row.collection] || [];
      grouped[row.collection].push({ ...row.payload, _remoteId: row.id });
    });
    collections.forEach((collection) => {
      if (collection !== "stories" && grouped[collection]?.length) state[collection] = grouped[collection];
    });
    if (grouped.stories?.length) state.stories = grouped.stories;
    state.stories = mergeStoryDefaults(state.stories, state.storyTombstones);
    liveCollectionBaselines = {
      operators: state.operators?.length || 0,
      motorcycles: state.motorcycles?.length || 0,
      owners: state.owners?.length || 0
    };
    liveDataStatus = "live";
    lastLiveSyncAt = new Date();
    subscribeToRealtime();
    render();
    showToast("Live MACOKASA records loaded.");
  } catch (error) {
    console.error(error);
    liveDataStatus = "local";
    authChecked = true;
    render();
    showToast("Records are available on this device.");
  }
}

function subscribeToRealtime() {
  if (!supabaseClient || realtimeChannel) return;
  realtimeChannel = supabaseClient
    .channel("macokasa-public-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "macokasa_records" },
      handleRealtimeRecord
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        liveDataStatus = "live";
        lastLiveSyncAt = new Date();
        if (activeRole === "public") render();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        liveDataStatus = "reconnecting";
        if (activeRole === "public") render();
      }
    });
}

function handleRealtimeRecord(change) {
  const row = change.new?.collection ? change.new : change.old;
  const remoteId = row?.id;
  const collection = row?.collection || collections.find((key) => (state[key] || []).some((record) => record._remoteId === remoteId));
  if (!collections.includes(collection)) return;
  const payload = row.payload || {};
  const records = state[collection] || [];
  if (change.eventType === "DELETE") {
    state[collection] = records.filter((record) => record._remoteId !== remoteId);
  } else {
    const record = { ...payload, _remoteId: remoteId };
    const matchIndex = records.findIndex((item) => item._remoteId === remoteId || (record.id && item.id === record.id));
    if (matchIndex >= 0) {
      state[collection] = records.map((item, index) => index === matchIndex ? record : item);
    } else {
      state[collection] = [record, ...records];
    }
  }
  if (collection === "stories" || collection === "storyTombstones") {
    state.stories = mergeStoryDefaults(state.stories, state.storyTombstones);
  }
  liveDataStatus = "live";
  lastLiveSyncAt = new Date();
  persist();
  if (activeRole === "public" && !["registration", "donate", "portal", "partner"].includes(activeSection)) render();
}

async function addRecord(collection, record) {
  state[collection] = [record, ...(state[collection] || [])];
  persist();
  render();
  if (supabaseEnabled && supabaseClient) {
    const { data, error } = await supabaseClient.from("macokasa_records").insert({ collection, payload: record }).select("id").single();
    if (error) showToast(`Saved on this device. Live sync needs attention.`);
    if (data?.id) {
      state[collection] = state[collection].map((item) => item.id === record.id ? { ...item, _remoteId: data.id } : item);
      lastLiveSyncAt = new Date();
      persist();
    }
  }
}

async function updateRecord(collection, id, updates) {
  state[collection] = (state[collection] || []).map((record) => record.id === id ? { ...record, ...updates } : record);
  persist();
  render();
  const record = state[collection].find((item) => item.id === id);
  const remote = record?._remoteId;
  if (supabaseEnabled && supabaseClient && record) {
    const { _remoteId, ...payload } = record;
    if (remote) {
      const { error } = await supabaseClient.from("macokasa_records").update({ payload }).eq("id", remote);
      if (error) showToast(`Updated on this device. Live sync needs attention.`);
    } else if (collection === "stories") {
      const { data, error } = await supabaseClient.from("macokasa_records").insert({ collection, payload }).select("id").single();
      if (error) {
        showToast("Updated on this device. Live sync needs attention.");
      } else if (data?.id) {
        state.stories = state.stories.map((story) => story.id === id ? { ...story, _remoteId: data.id } : story);
        persist();
      }
    }
  }
}

async function deleteRecord(collection, id) {
  const existing = (state[collection] || []).find((record) => record.id === id);
  const isDefaultStory = collection === "stories" && demoState.stories.some((story) => story.id === id);
  const tombstone = isDefaultStory && !(state.storyTombstones || []).some((record) => record.storyId === id)
    ? { id: `story-delete-${id}`, storyId: id, createdAt: new Date().toISOString() }
    : null;
  if (tombstone) state.storyTombstones = [tombstone, ...(state.storyTombstones || [])];
  state[collection] = (state[collection] || []).filter((record) => record.id !== id);
  persist();
  render();
  if (supabaseEnabled && supabaseClient && existing?._remoteId) {
    const { error } = await supabaseClient.from("macokasa_records").delete().eq("id", existing._remoteId);
    if (error) showToast(`Deleted on this device. Live sync needs attention.`);
  }
  if (supabaseEnabled && supabaseClient && tombstone) {
    const { error } = await supabaseClient.from("macokasa_records").insert({ collection: "storyTombstones", payload: tombstone });
    if (error) showToast("Deleted on this device. Live sync needs attention.");
  }
}

function render() {
  stopMemberCamera();
  if (!navItems.some(([key, , , roles]) => key === activeSection && roles.includes(activeRole))) {
    activeSection = activeRole === "owner" ? "owners" : activeRole === "printing" ? "cards" : activeRole === "webadmin" ? "content" : "public";
  }
  const roleUnlocked = unlockedRoles.has(activeRole);
  const showSidebar = activeRole !== "public" && roleUnlocked;
  const visibleNavItems = showSidebar ? navItems.filter(([, , , roles]) => roles.includes(activeRole)) : [];
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar ${activeRole === "public" ? "public-topbar" : "portal-topbar"}">
        <div class="brand">
          <img src="./assets/macokasa-logo-square.png" alt="MACOKASA logo" />
          <div class="brand-title">
            <strong>MACOKASA</strong>
            <span>Malawi Coalition for Kabaza Stakeholders Association</span>
          </div>
        </div>
        ${activeRole === "public" ? `
          <nav class="site-nav" aria-label="Website navigation">
            ${publicNavButton("public", "Home")}
            ${publicNavButton("catalogue", "What we do")}
            ${publicNavButton("stories", "Stories")}
            ${publicNavButton("about", "About")}
            ${publicNavButton("registration", "Join")}
            ${publicNavButton("analytics", "Impact")}
          </nav>
        ` : ""}
        <div class="top-actions">
          ${activeRole === "public" ? `
            ${renderLiveBadge()}
            <button class="donate-header-btn" type="button" data-section="donate">Donate</button>
            <button class="portal-header-btn" type="button" data-section="portal">Portal</button>
          ` : `<button class="quiet-btn" type="button" data-role="public">Website</button>`}
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
      ${activeRole === "public" ? renderPublicFooter() : ""}
      <div class="toast" role="status" aria-live="polite"></div>
    </div>
  `;
  requestAnimationFrame(() => {
    renderQrCodes();
    updateCardPreviewFromForm();
    enhanceMotion();
    void hydrateMemberPhotos();
  });
}

/* ---- Presentation enhancements (public site polish) ---- */

let revealObserver = null;

function enhanceMotion() {
  applyStickyHeader();
  applyScrollReveal();
}

function applyStickyHeader() {
  const topbar = document.querySelector(".topbar.public-topbar");
  if (!topbar) return;
  const sync = () => topbar.classList.toggle("is-stuck", window.scrollY > 8);
  sync();
  window.removeEventListener("scroll", sync);
  window.addEventListener("scroll", sync, { passive: true });
}

function applyScrollReveal() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const targets = document.querySelectorAll(
    ".public-band, .stakeholder-band, .story-pillar, .public-story-card, .live-impact-metric, .lead-story"
  );
  if (!targets.length) return;
  if (!("IntersectionObserver" in window)) {
    targets.forEach((node) => node.classList.add("is-visible"));
    return;
  }
  revealObserver?.disconnect();
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
  );
  targets.forEach((node, index) => {
    node.setAttribute("data-reveal", "");
    node.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
    revealObserver.observe(node);
  });
}

function publicNavButton(section, label) {
  return `<button class="${activeSection === section ? "active" : ""}" type="button" data-section="${section}">${label}</button>`;
}

function renderLiveBadge() {
  const labels = {
    live: "Live IMS",
    connecting: "Connecting",
    reconnecting: "Reconnecting",
    local: "Preview data"
  };
  return `
    <span class="live-badge ${escapeAttr(liveDataStatus)}" title="MACOKASA information status">
      <i aria-hidden="true"></i>
      <span>${escapeHtml(labels[liveDataStatus] || "IMS data")}</span>
    </span>
  `;
}

function renderPublicFooter() {
  return `
    <footer class="public-footer">
      <div class="public-footer-brand">
        <img src="./assets/macokasa-logo-square.png" alt="" />
        <div>
          <strong>MACOKASA</strong>
          <span>Safer livelihoods. Verified operators. Accountable mobility.</span>
        </div>
      </div>
      <div class="public-footer-links">
        <button type="button" data-section="about">About MACOKASA</button>
        <button type="button" data-section="stories">Field stories</button>
        <button type="button" data-section="registration">Register or renew</button>
        <a href="https://www.rosaf.org" target="_blank" rel="noreferrer">ROSAF training partner</a>
      </div>
      <div class="public-footer-contact">
        <span>Report a safety issue</span>
        <strong>${escapeHtml(orgDetail("safetyLine", "1234XY"))}</strong>
        <small>Malawi Coalition for Kabaza Stakeholders Association</small>
      </div>
      <div class="public-footer-legal">
        <button type="button" data-section="privacy">Privacy notice</button>
        <button type="button" data-section="terms">Terms of use</button>
        <span>&copy; ${new Date().getFullYear()} MACOKASA. All rights reserved.</span>
      </div>
    </footer>
  `;
}

function roleOption(value, label) {
  return `<option value="${value}" ${activeRole === value ? "selected" : ""}>${label}</option>`;
}

function renderActiveSection() {
  const sections = {
    public: renderHomePage,
    catalogue: renderCataloguePage,
    stories: renderStoriesPage,
    about: renderAboutPage,
    registration: renderRegistration,
    donate: renderDonatePage,
    portal: renderPortalChooser,
    partner: renderPartnerChooser,
    staff: renderStaffDashboard,
    operators: renderOperators,
    membership: renderMembership,
    payments: renderPayments,
    cards: renderCards,
    owners: renderOwners,
    safety: renderSafety,
    cooperatives: renderCooperatives,
    analytics: renderAnalytics,
    content: renderContentAdmin,
    operations: renderOperations,
    privacy: renderPrivacyPage,
    terms: renderTermsPage
  };
  return (sections[activeSection] || renderHomePage)();
}

function renderPortalLogin() {
  if (!authChecked) {
    return `
      <section class="grid">
        <div class="login-panel span-7">
          <div class="form-header">
            <div><p class="eyebrow">Secure access</p><h2>Checking your session</h2></div>
          </div>
          <p class="microcopy">Contacting the MACOKASA authentication service…</p>
        </div>
      </section>
    `;
  }

  if (!supabaseEnabled) {
    return `
      <section class="grid">
        <div class="login-panel span-7">
          <div class="form-header">
            <div>
              <p class="eyebrow">Secure access</p>
              <h2>${escapeHtml(activeRoleLabel())} portal</h2>
            </div>
            <span class="status red">Unavailable</span>
          </div>
          <div class="secure-note">
            <strong>Portals require a live MACOKASA database connection.</strong>
            <p>This build is running on local preview data, so sign-in is disabled. Configure <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> to enable staff, owner, printing, and web administration access.</p>
          </div>
          <button class="quiet-btn" type="button" data-role="public">Return to website</button>
        </div>
      </section>
    `;
  }

  const signedInWrongRole = authSession && authProfile && authProfile.role !== activeRole;

  return `
    <section class="grid">
      <div class="login-panel span-7">
        <div class="form-header">
          <div>
            <p class="eyebrow">Secure access</p>
            <h2>${escapeHtml(activeRoleLabel())} portal</h2>
          </div>
          <span class="status amber">Sign in required</span>
        </div>
        ${signedInWrongRole ? `
          <div class="secure-note">
            <strong>Signed in as ${escapeHtml(authProfile.fullName || authSession.user?.email || "user")}.</strong>
            <p>Your account holds the <b>${escapeHtml(roleLabelFor(authProfile.role))}</b> role, which does not grant access to the ${escapeHtml(activeRoleLabel())} portal. Contact a MACOKASA administrator if this is wrong.</p>
          </div>
          <button class="quiet-btn" type="button" data-action="logout">Sign out</button>
        ` : `
          <form class="form-grid" data-form="portal-login" autocomplete="on">
            <label class="field full"><span>Work email</span><input class="input-control" type="email" name="email" autocomplete="username" required autocapitalize="none" spellcheck="false" /></label>
            <label class="field full"><span>Password</span><input class="input-control" type="password" name="password" autocomplete="current-password" required minlength="8" /></label>
            <button class="primary-btn" type="submit" ${authBusy ? "disabled" : ""}>${authBusy ? "Signing in…" : "Sign in"}</button>
            <button class="quiet-btn" type="button" data-action="reset-password">Forgot password</button>
            <button class="quiet-btn" type="button" data-role="public">Return to website</button>
          </form>
          <p class="microcopy">Accounts are issued by MACOKASA administrators. Access is logged and audited.</p>
        `}
      </div>
      <div class="panel span-5">
        <h2>MACOKASA digital membership platform</h2>
        <div class="split-list">
          <div class="record-card"><strong>Operators</strong><span>Pedal and motorcycle operators register, renew, verify cards, and access safer-rider benefits.</span></div>
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

function renderHomePage() {
  const impact = liveImpact();
  const stories = publishedStories();
  const featuredStory = stories[0] || {};
  const verification = verificationPanelFromQuery();
  return `
    ${verification}
    ${demoDataNotice()}
    <section class="public-hero" aria-label="MACOKASA public website">
      <div class="public-hero-media" role="img" aria-label="Kabaza operators taking part in practical road safety work"></div>
      <div class="public-hero-content">
        <p class="hero-kicker">Malawi's national Kabaza stakeholder coalition</p>
        <h1>MACOKASA</h1>
        <p class="hero-statement">Organising pedal and motorcycle taxi operators for safer journeys, stronger livelihoods, and public confidence.</p>
        <div class="hero-actions">
          <button class="primary-btn" type="button" data-section="registration">${iconRegistry()} Register or renew</button>
          <button class="quiet-btn" type="button" data-section="stories">${iconStory()} Read field stories</button>
        </div>
        <div class="hero-context">
          <span>Government engagement</span>
          <span>Rank mobilisation</span>
          <span>ROSAF training pathway</span>
        </div>
      </div>
    </section>

    <section class="public-notice-strip" aria-label="Current registration notices">
      <strong>Current notice</strong>
      <div class="notice-window">
        <div class="notice-track">
          <span>Membership registration and annual renewal opened 1 July 2026</span>
          <span>Registration or renewal service fee: K5,000</span>
          <span>Member ID fee: K10,000</span>
          <span>MRA motorcycle registration remains open until 31 October 2026</span>
          <span>Motorcycle registration: K77,000 big bike / K56,000 small bike</span>
        </div>
      </div>
    </section>

    <section class="live-impact-band" aria-live="polite">
      <div class="live-impact-heading">
        <p class="eyebrow">MACOKASA IMS</p>
        <h2>Formalisation at a glance</h2>
        <span class="live-update-note"><i></i>${liveUpdateLabel()}</span>
      </div>
      <div class="live-impact-grid">
        ${liveImpactMetric("Registered operators", compactNumber(impact.registeredOperators), "Pedal and motorcycle operator records", iconRegistry())}
        ${liveImpactMetric("Registered motorcycles", compactNumber(impact.registeredMotorcycles), "Motorcycles connected to the formalisation effort", iconMotorcycle())}
        ${liveImpactMetric("Subscribed owners", compactNumber(impact.subscribedOwners), "Owners linked to accountable operator management", iconCoop())}
        ${liveImpactMetric("Districts reached", String(impact.districtsReached), "District committees supporting registration", iconChart())}
      </div>
    </section>

    <section class="editorial-lead public-band">
      <div class="section-heading editorial-heading">
        <div>
          <p class="eyebrow">From the field</p>
          <h2>Stories that show how the sector is changing</h2>
        </div>
        <button class="text-link-btn" type="button" data-section="stories">View all stories ${iconArrow()}</button>
      </div>
      <article class="lead-story">
        <div class="lead-story-media">${storyGallery(featuredStory, "feature")}</div>
        <div class="lead-story-copy">
          ${storyMetadata(featuredStory)}
          <h3>${escapeHtml(featuredStory.title || "Working together for safer Kabaza mobility")}</h3>
          <p>${escapeHtml(featuredStory.summary || "MACOKASA connects operators, public institutions, rank leadership, owners, and trainers around practical sector formalisation.")}</p>
          ${featuredStory.impactLine ? `<blockquote>${escapeHtml(featuredStory.impactLine)}</blockquote>` : ""}
          ${featuredStory.id ? `<button class="story-read-btn" type="button" data-story-open="${escapeAttr(featuredStory.id)}">Read the full story ${iconArrow()}</button>` : ""}
        </div>
      </article>
    </section>

    <section class="story-pillars public-band">
      <div class="section-heading">
        <p class="eyebrow">How change happens</p>
        <h2>Coordination that reaches from policy rooms to Kabaza ranks</h2>
      </div>
      <div class="story-pillar-grid">
        ${storyPillar(
          "Government engagement",
          "One formalisation agenda",
          "MACOKASA convenes transport authorities, police, local government, and rank leadership around registration, licensing, safer operations, and reliable sector information.",
          "./assets/macokasa-rider-training.jpg",
          "Government and Kabaza stakeholders coordinating safer sector operations",
          "Government engagement"
        )}
        ${storyPillar(
          "Safety mobilisation",
          "Safer choices at every rank",
          "District and rank committees mobilise operators around helmets, reflectors, one-passenger practice, motorcycle identification, and public accountability.",
          "./assets/kabaza-safety-mobilisation.jpg",
          "Kabaza operators mobilised for practical road safety awareness",
          "Safety campaign"
        )}
        ${storyPillar(
          "ROSAF partnership",
          "Training linked to membership",
          "The ROSAF pathway gives members access to practical riding instruction, refresher courses, and support towards formal licensing at reduced member rates.",
          "./assets/rosaf-road-safety-practical.jpg",
          "Kabaza rider completing a ROSAF-supported practical exercise",
          "Training"
        )}
      </div>
    </section>

    <section class="latest-stories public-band">
      <div class="section-heading editorial-heading">
        <div>
          <p class="eyebrow">Latest reports</p>
          <h2>People, partnerships, and progress</h2>
        </div>
        <span class="section-note">Published through the MACOKASA story desk</span>
      </div>
      <div class="story-card-grid">${storyCards(stories.slice(1, 4))}</div>
    </section>

    <section class="stakeholder-band">
      <div>
        <p class="eyebrow">Working in coalition</p>
        <h2>Safer mobility needs every stakeholder at the table.</h2>
      </div>
      <div class="stakeholder-list">
        ${[...affiliatedMembers, ...stakeholders].map((name) => name === "ROSAF"
          ? `<a href="https://www.rosaf.org" target="_blank" rel="noreferrer">${escapeHtml(name)}</a>`
          : `<span>${escapeHtml(name)}</span>`).join("")}
      </div>
      <button class="secondary-btn" type="button" data-section="about">Meet the coalition</button>
    </section>
  `;
}

function renderCataloguePage() {
  return `
    <section class="public-page-header services-header">
      <p class="eyebrow">Services</p>
      <h1>MACOKASA services for pedal and motorcycle operator formalization</h1>
      <p>Each service area supports registration, safer transport, accountable ownership, and stakeholder coordination without duplicating public content.</p>
    </section>
    <section class="public-section public-programs">
      <div class="program-grid">
        <article>
          <span>${iconRegistry()}</span>
          <h3>Operator membership</h3>
          <p>Regular, Silver, Gold, and Platinum annual memberships for bicycle and motorcycle operators with reminders and QR verification.</p>
        </article>
        <article>
          <span>${iconMotorcycle()}</span>
          <h3>Owner subscription</h3>
          <p>Motorcycle owners subscribe, map motorcycles, find verified operators, and manage agreements from the owner portal.</p>
        </article>
        <article>
          <span>${iconShield()}</span>
          <h3>Safety and licensing</h3>
          <p>ROSAF-linked licence facilitation, refresher training support, helmet records, plates, and safer-rank promotion.</p>
        </article>
        <article>
          <span>${iconCard()}</span>
          <h3>Card verification</h3>
          <p>QR cards can be scanned by police, passengers, rank chairs, owners, and MACOKASA staff to check live status.</p>
        </article>
      </div>
    </section>
    <section class="grid">
      <div class="panel span-7">
        <div class="panel-header"><div><p class="eyebrow">Membership catalogue</p><h2>Operator membership classes</h2></div></div>
        <div class="plan-grid">${membershipPlans.filter((plan) => plan.audience === "Operator").map(planCard).join("")}</div>
      </div>
      <div class="panel span-5">
        <h2>Service partners</h2>
        <div class="split-list">
          <div class="record-card"><strong>ROSAF training pathway</strong><span>Members without licence records can be routed to reduced-fee licence facilitation and refresher safe-riding courses.</span></div>
          <div class="record-card"><strong>Printing authority</strong><span>Membership card changes, replacements, upgrades, and downgrades are queued for controlled printing.</span></div>
          <div class="record-card"><strong>Stakeholder reporting</strong><span>District, participation, safety, and registration summaries support public institutions and donor reporting.</span></div>
        </div>
      </div>
    </section>
  `;
}

function renderStoriesPage() {
  const stories = publishedStories();
  const selectedStory = stories.find((story) => story.id === selectedStoryId);
  if (selectedStory) return renderStoryReader(selectedStory);
  const categories = ["All", ...new Set(stories.map((story) => story.category).filter(Boolean))];
  const filteredStories = storyFilter === "All" ? stories : stories.filter((story) => story.category === storyFilter);
  const featuredStory = filteredStories[0] || stories[0] || {};
  return `
    <section class="stories-masthead">
      <div>
        <p class="eyebrow">MACOKASA field journal</p>
        <h1>Stories of a sector organising for safety</h1>
      </div>
      <p>Follow the government dialogue, district mobilisation, practical training, and people behind Malawi's pedal and motorcycle taxi formalisation effort.</p>
    </section>

    <section class="story-filter-bar" aria-label="Filter stories by theme">
      ${categories.map((category) => `
        <button class="${storyFilter === category ? "active" : ""}" type="button" data-story-filter="${escapeAttr(category)}">
          ${escapeHtml(category)}
        </button>
      `).join("")}
    </section>

    <section class="stories-feature public-band">
      <article class="lead-story story-page-lead">
        <div class="lead-story-media">${storyGallery(featuredStory, "feature")}</div>
        <div class="lead-story-copy">
          ${storyMetadata(featuredStory)}
          <h2>${escapeHtml(featuredStory.title || "MACOKASA field story")}</h2>
          <p>${escapeHtml(featuredStory.summary || "New field stories will appear here as the MACOKASA story desk publishes them.")}</p>
          ${featuredStory.impactLine ? `<blockquote>${escapeHtml(featuredStory.impactLine)}</blockquote>` : ""}
          ${featuredStory.id ? `<button class="story-read-btn" type="button" data-story-open="${escapeAttr(featuredStory.id)}">Read full story ${iconArrow()}</button>` : ""}
        </div>
      </article>
    </section>

    <section class="story-index public-band">
      <div class="section-heading editorial-heading">
        <div>
          <p class="eyebrow">${escapeHtml(storyFilter === "All" ? "All reporting" : storyFilter)}</p>
          <h2>${filteredStories.length} field ${filteredStories.length === 1 ? "story" : "stories"}</h2>
        </div>
        <span class="section-note">${liveUpdateLabel()}</span>
      </div>
      ${filteredStories.length
        ? `<div class="story-card-grid story-index-grid">${storyCards(filteredStories)}</div>`
        : `<div class="empty-story-state"><h3>No published stories in this theme yet.</h3><p>The WebAdmin can prepare and preview the next field report from the Portal.</p></div>`}
    </section>

    <section class="engagement-desk">
      <div class="engagement-intro">
        <p class="eyebrow">Engagement desk</p>
        <h2>What the coalition is advancing</h2>
        <p>These themes keep public reporting connected to practical decisions, rank-level action, and member benefits.</p>
        <button class="quiet-btn" type="button" data-section="portal">Open story desk</button>
      </div>
      <div class="engagement-list">
        <article>
          <span>01</span>
          <div>
            <strong>Government and regulatory dialogue</strong>
            <p>DRTSS licensing, Ministry of Transport policy coordination, police safety enforcement, and local-government rank planning.</p>
          </div>
        </article>
        <article>
          <span>02</span>
          <div>
            <strong>Rank and district mobilisation</strong>
            <p>Committee-led registration, safety awareness, operator identification, complaints feedback, and public confidence.</p>
          </div>
        </article>
        <article>
          <span>03</span>
          <div>
            <strong>ROSAF practical training</strong>
            <p>Reduced-fee training pathways, refresher riding courses, licence facilitation, and safer-rider recognition.</p>
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderStoryReader(story) {
  const partners = storyPartners(story);
  const paragraphs = String(story.body || story.summary || "")
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return `
    <article class="story-reader">
      <header class="story-reader-header">
        <button class="story-back-btn" type="button" data-story-close>${iconArrowLeft()} Back to stories</button>
        ${storyMetadata(story)}
        <h1>${escapeHtml(story.title || "MACOKASA field story")}</h1>
        <p>${escapeHtml(story.summary || "")}</p>
      </header>
      <div class="story-reader-visual">${storyGallery(story, "reader")}</div>
      <div class="story-reader-layout">
        <aside class="story-reader-facts">
          <span>Field note</span>
          <dl>
            <div><dt>Published</dt><dd>${compactDate(story.createdAt || today())}</dd></div>
            <div><dt>Location</dt><dd>${escapeHtml(story.location || "Malawi")}</dd></div>
            <div><dt>Theme</dt><dd>${escapeHtml(story.category || "Impact")}</dd></div>
          </dl>
          ${partners.length ? `
            <div class="story-partner-list">
              <strong>Working with</strong>
              ${partners.map((partner) => `<span>${escapeHtml(partner)}</span>`).join("")}
            </div>
          ` : ""}
        </aside>
        <div class="story-reader-body">
          ${story.impactLine ? `<blockquote>${escapeHtml(story.impactLine)}</blockquote>` : ""}
          ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
          <div class="story-reader-callout">
            <strong>Keep the work moving</strong>
            <p>Registration links people, training, motorcycles, and district leadership to one accountable national information system.</p>
            <button class="primary-btn" type="button" data-section="registration">Register or renew membership</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderAboutPage() {
  return `
    <section class="public-page-header about-header">
      <p class="eyebrow">About MACOKASA</p>
      <h1>National coordination for bicycle and motorcycle operator accountability</h1>
      <p>MACOKASA brings operators, owners, cooperatives, affiliates, and public institutions into one formalization and safety coordination framework.</p>
    </section>
    <section class="grid">
      <div class="panel span-7">
        <div class="split-list">
          <div class="record-card"><strong>Livelihoods and formal work</strong><span>Pedal and motorcycle transport supports youth employment and small-scale ownership, but needs verified membership and safer operating standards.</span></div>
          <div class="record-card"><strong>Safety and public health</strong><span>The portal tracks helmets, licence status, training history, plates, complaints, and card verification so safer operators can be promoted at ranks.</span></div>
          <div class="record-card"><strong>Stakeholder coordination</strong><span>MACOKASA works with affiliated members and public stakeholders to improve safety, training, registration, licensing, and operator accountability.</span></div>
        </div>
      </div>
      <div class="panel span-5">
        <h2>Affiliated members</h2>
        <div class="chip-grid">${affiliatedMembers.map((name) => name === "ROSAF" ? `<a class="brand-chip" href="https://www.rosaf.org" target="_blank" rel="noreferrer">${escapeHtml(name)}</a>` : `<span class="brand-chip">${escapeHtml(name)}</span>`).join("")}</div>
        <h2 style="margin-top:18px">Stakeholders</h2>
        <div class="chip-grid">${stakeholders.map((name) => `<span class="brand-chip outline">${escapeHtml(name)}</span>`).join("")}</div>
      </div>
      <div class="panel span-12">
        <div class="panel-header"><div><p class="eyebrow">Sector evidence</p><h2>Why formalization matters now</h2></div></div>
        <div class="source-list evidence-grid">
          ${publicSources.map((source) => `
            <div class="source-item">
              <a href="${source.url}" target="_blank" rel="noreferrer">${escapeHtml(source.publisher)}</a>
              <p>${escapeHtml(source.fact)}</p>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="issue-strip span-12">
        <strong>Report an issue</strong>
        <span>Toll free line: 1234XY</span>
        <span>Use it for unsafe riding, fake cards, overloading, harassment, or rank security incidents.</span>
      </div>
    </section>
  `;
}

function renderDonatePage() {
  return `
    <section class="public-page-header donation-header">
      <p class="eyebrow">Donate</p>
      <h1>Support safer pedal and motorcycle operator formalization</h1>
      <p>Donations support public safety campaigns, helmets, training engagement, district outreach, and verified membership awareness.</p>
    </section>
    <section class="grid">
      <div class="panel span-7">
        <div class="panel-header"><div><p class="eyebrow">Donation window</p><h2>Choose how to give</h2></div><span class="status green">Safety work</span></div>
        ${paymentExperience("donation", donationChoice, {
          title: "Donation details",
          nameLabel: "Donor name",
          defaultName: "Road safety supporter",
          purpose: "Helmet safety campaign"
        })}
      </div>
      <div class="panel span-5">
        <h2>What donations help fund</h2>
        <div class="split-list">
          <div class="record-card"><strong>Safety campaigns</strong><span>Community messaging on helmets, passenger limits, reflectors, and responsible operation.</span></div>
          <div class="record-card"><strong>Training support</strong><span>Reduced barriers for operators to access ROSAF-linked safe-riding and licensing pathways.</span></div>
          <div class="record-card"><strong>Verification access</strong><span>Public QR card awareness so passengers, police, rank chairs, and owners can authenticate operators.</span></div>
        </div>
      </div>
    </section>
  `;
}

function renderPortalChooser() {
  return `
    <section class="public-page-header portal-header">
      <p class="eyebrow">Secure access</p>
      <h1>Staff and partner portal</h1>
      <p>Select the type of access you need. Each portal opens its own password window.</p>
    </section>
    <section class="portal-choice-grid">
      <button class="portal-choice-card" type="button" data-role="staff">
        <span>${iconDashboard()}</span>
        <strong>MACOKASA staff</strong>
        <small>Full ERP access for finance, membership, safety, cards, cooperatives, and reports.</small>
      </button>
      <button class="portal-choice-card" type="button" data-section="partner">
        <span>${iconCoop()}</span>
        <strong>Partner portal</strong>
        <small>Printing authority, motorcycle owners, and WebAdmin access.</small>
      </button>
    </section>
  `;
}

function renderPartnerChooser() {
  return `
    <section class="public-page-header portal-header">
      <p class="eyebrow">Partner access</p>
      <h1>Choose your partner portal</h1>
      <p>Partners use separate access windows based on their operational role.</p>
    </section>
    <section class="portal-choice-grid three">
      <button class="portal-choice-card" type="button" data-role="printing">
        <span>${iconCard()}</span>
        <strong>Printing authority</strong>
        <small>Card preview, QR verification, and print queue control.</small>
      </button>
      <button class="portal-choice-card" type="button" data-role="owner">
        <span>${iconMotorcycle()}</span>
        <strong>Motorcycle owners</strong>
        <small>Motorcycle mapping, operator assignment, agreement, income, and expense tracking.</small>
      </button>
      <button class="portal-choice-card" type="button" data-role="webadmin">
        <span>${iconStory()}</span>
        <strong>WebAdmin</strong>
        <small>Post public stories with visuals and preview website content.</small>
      </button>
    </section>
  `;
}

function renderPublicWebsite() {
  const impact = liveImpact();
  const verification = verificationPanelFromQuery();
  const stories = publishedStories();
  const featuredStory = stories[0];
  return `
    ${verification}
    ${demoDataNotice()}
    <section class="public-hero" aria-label="MACOKASA public website">
      <div class="public-hero-media" role="img" aria-label="Kabaza road safety training with operators and stakeholders"></div>
      <div class="public-hero-content">
        <p class="hero-kicker">Malawi Coalition for Kabaza Stakeholders Association</p>
        <h1>Safer riders. Verified membership. Accountable motorcycle ownership.</h1>
        <p>
          MACOKASA coordinates Kabaza operators, motorcycle owners, rank leadership, safety partners, and public institutions
          through national registration, digital card authentication, licensing support, and district-level impact reporting.
        </p>
        <div class="hero-actions">
          <button class="primary-btn" type="button" data-section="registration">Register membership</button>
          <button class="quiet-btn" type="button" data-jump="stories">Read impact stories</button>
          <button class="quiet-btn" type="button" data-action="donate">Donate to safety work</button>
        </div>
        <div class="hero-proof">
          <article><strong>${compactNumber(impact.estimatedFleet)}</strong><span>estimated fleet population</span></article>
          <article><strong>${compactNumber(impact.registeredOperators)}</strong><span>registered operators</span></article>
          <article><strong>1234XY</strong><span>toll-free safety line</span></article>
        </div>
      </div>
    </section>
    <section class="public-section public-alert-row">
      <div class="issue-strip span-12">
        <strong>Report an issue</strong>
        <span>Toll free line: 1234XY</span>
        <span>Use it for unsafe riding, fake cards, overloading, harassment, or rank security incidents.</span>
      </div>
    </section>
    <section class="public-section public-evidence">
      <div>
        <p class="eyebrow">Sector evidence</p>
        <h2>Why formalization matters now</h2>
      </div>
      <div class="source-list">
        ${publicSources.map((source) => `
          <div class="source-item">
            <a href="${source.url}" target="_blank" rel="noreferrer">${escapeHtml(source.publisher)}</a>
            <p>${escapeHtml(source.fact)}</p>
          </div>
        `).join("")}
      </div>
    </section>
    <section class="grid public-impact-grid">
      ${metric("Registered operators", compactNumber(impact.registeredOperators), "MACOKASA operator membership records", "span-4")}
      ${metric("Registered motorcycles", compactNumber(impact.registeredMotorcycles), "Motorcycles mapped into the MACOKASA IMS", "span-4")}
      ${metric("Subscribed owners", compactNumber(impact.subscribedOwners), "Motorcycle owners using MACOKASA IMS", "span-4")}
    </section>
    <section class="public-section public-story-feature" id="stories">
      <div class="section-heading">
        <p class="eyebrow">Stories and field updates</p>
        <h2>Evidence of safer-rider work in motion</h2>
      </div>
      <div class="feature-story">
        ${storyGallery(featuredStory || {}, "feature")}
        <div class="feature-story-copy">
          <span class="story-date">${compactDate(featuredStory?.createdAt || today())}</span>
          <h3>${escapeHtml(featuredStory?.title || "Kabaza road safety work")}</h3>
          <p>${escapeHtml(featuredStory?.summary || "MACOKASA is coordinating operators and stakeholders around safer public motorcycle transport.")}</p>
          <button class="secondary-btn" type="button" data-section="registration">Join the membership drive</button>
        </div>
      </div>
      <div class="story-card-grid">
        ${storyCards(stories.slice(1, 4))}
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
    </section>
    <section class="public-section public-programs" id="catalogue">
      <div class="section-heading">
        <p class="eyebrow">Catalogue</p>
        <h2>Services offered through MACOKASA IMS</h2>
      </div>
      <div class="program-grid">
        <article>
          <span>${iconRegistry()}</span>
          <h3>Operator membership</h3>
          <p>Regular, Silver, Gold, and Platinum annual memberships with digital reminders and QR card verification.</p>
        </article>
        <article>
          <span>${iconMotorcycle()}</span>
          <h3>Owner subscription</h3>
          <p>Motorcycle owners subscribe, map motorcycles, find verified operators, and manage agreements from the owner portal.</p>
        </article>
        <article>
          <span>${iconShield()}</span>
          <h3>Safety and licensing</h3>
          <p>ROSAF-linked licence facilitation, refresher training support, helmets, plates, and safer-rank promotion.</p>
        </article>
        <article>
          <span>${iconCard()}</span>
          <h3>Card verification</h3>
          <p>QR cards can be scanned by police, passengers, rank chairs, owners, and MACOKASA staff to check live status.</p>
        </article>
      </div>
    </section>
    <section class="grid public-detail-grid" id="about">
      <div class="panel span-7">
        <div class="panel-header">
          <div><p class="eyebrow">About us</p><h2>MACOKASA national coordination</h2></div>
          <span class="status green">Verified membership drive</span>
        </div>
        <div class="split-list">
          <div class="record-card"><strong>Livelihoods and formal work</strong><span>Kabaza supports youth employment and small-scale motorcycle ownership, but it needs verified membership and safer operating standards.</span></div>
          <div class="record-card"><strong>Safety and public health</strong><span>The portal tracks helmets, passenger helmets, licence status, licence plates, training history, and complaints so safer operators can be promoted at ranks.</span></div>
          <div class="record-card"><strong>Stakeholder coordination</strong><span>MACOKASA works with affiliated members and public stakeholders to improve safety, training, registration, licensing, and operator accountability.</span></div>
        </div>
      </div>
      <div class="panel span-5">
        <h2>Affiliated members</h2>
        <div class="chip-grid">${affiliatedMembers.map((name) => name === "ROSAF" ? `<a class="brand-chip" href="https://www.rosaf.org" target="_blank" rel="noreferrer">${escapeHtml(name)}</a>` : `<span class="brand-chip">${escapeHtml(name)}</span>`).join("")}</div>
        <h2 style="margin-top:18px">Stakeholders</h2>
        <div class="chip-grid">${stakeholders.map((name) => `<span class="brand-chip outline">${escapeHtml(name)}</span>`).join("")}</div>
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
    <section class="public-page-header registration-header">
      <p class="eyebrow">Public registration</p>
      <h1>Register a bicycle or motorcycle operator</h1>
      <p>Capture the operator's membership, sex, district, rank, safety, licence, and identification details for MACOKASA verification.</p>
    </section>
    <section class="grid">
      <div class="panel span-7">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Operator membership</p>
            <h2>Operator registration form</h2>
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
  const selectedOperator = state.operators.find((operator) => operator.id === selectedCardOperatorId) || state.operators[0];
  if (selectedOperator) selectedCardOperatorId = selectedOperator.id;
  const selectedCard = state.cards.find((card) => card.operatorId === selectedOperator?.id && card.status === "active")
    || state.cards.find((card) => card.operatorId === selectedOperator?.id)
    || state.cards[0];
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
  const impact = liveImpact();
  const districtRows = districtCounts();
  const planRows = planCounts();
  const sexRows = sexCounts();
  const safetyReady = state.operators.filter((operator) => operator.hasLicense && operator.helmetUse && operator.passengerHelmet && operator.licensePlate).length;
  const safetyScore = Math.round((safetyReady / Math.max(1, state.operators.length)) * 100);
  const formalizedShare = ((impact.registeredOperators / Math.max(1, impact.reportedMotorcycles)) * 100).toFixed(2);
  const remainingGap = Math.max(0, impact.reportedMotorcycles - impact.registeredOperators);
  const trainingGap = state.operators.filter((operator) => !operator.hasLicense).length;
  const ownerFundPanel = activeRole === "owner" || activeRole === "staff" ? `
      <div class="panel span-6">
        <div class="table-header"><h2>Owner fund progress</h2></div>
        ${barChart(ownerFundRows().map((row) => ({ label: row.motorcycle.split(" - ")[0], value: Math.max(0, row.net) })))}
      </div>
  ` : "";
  return `
    <section class="impact-hero">
      <div>
        <p class="eyebrow">Impact analytics</p>
        <h1>Turning a large informal transport sector into verified, safer operator records.</h1>
        <p>These figures show the registration gap, safety readiness, participation, and district reach that MACOKASA can use for public accountability and stakeholder action.</p>
      </div>
      <div class="impact-score-card">
        <span>Formalized share</span>
        <strong>${formalizedShare}%</strong>
        <small>${compactNumber(remainingGap)} reported motorcycles still outside the current MACOKASA operator record base.</small>
      </div>
    </section>
    <section class="impact-stat-grid">
      <article><span>Estimated fleet</span><strong>${compactNumber(impact.estimatedFleet)}</strong><small>Sector scale requiring formalization</small></article>
      <article><span>Verified operators</span><strong>${compactNumber(impact.registeredOperators)}</strong><small>MACOKASA registration footprint</small></article>
      <article><span>Safety ready</span><strong>${safetyScore}%</strong><small>Licence, helmet, passenger helmet, and ID/plate record</small></article>
      <article><span>Female participation</span><strong>${participationShare("Female")}%</strong><small>Women tracked from registration</small></article>
    </section>
    <section class="grid">
      <div class="panel span-7 impact-action-panel">
        <div class="panel-header"><div><p class="eyebrow">Formalization gap</p><h2>Registration progress against reported sector size</h2></div></div>
        <div class="progress-meter" style="--progress:${Math.min(100, Number(formalizedShare))}%">
          <span></span>
        </div>
        <div class="impact-gap-grid">
          <div><strong>${compactNumber(impact.registeredOperators)}</strong><span>registered operators</span></div>
          <div><strong>${compactNumber(remainingGap)}</strong><span>remaining reported gap</span></div>
          <div><strong>${impact.districtsReached}</strong><span>districts reached</span></div>
        </div>
        <p class="footer-note">The very small formalized share makes the public case for stronger registration drives, safer-rider promotion, and stakeholder-backed enforcement.</p>
      </div>
      <div class="panel span-5">
        <div class="panel-header"><div><p class="eyebrow">Immediate priorities</p><h2>Where action is needed</h2></div></div>
        <div class="split-list">
          <div class="record-card"><strong>${trainingGap} training gap(s)</strong><span>Operators in the current record set still need licence or training support.</span></div>
          <div class="record-card"><strong>${state.operators.filter((operator) => !operator.passengerHelmet).length} passenger helmet gap(s)</strong><span>Passenger safety records show where safer-rank promotion needs attention.</span></div>
          <div class="record-card"><strong>${state.operators.filter((operator) => operator.operatorCategory === "Bicycle operator").length} bicycle operator record(s)</strong><span>Pedal operators are now part of the same formalization lens.</span></div>
        </div>
      </div>
      <div class="panel span-6">
        <div class="table-header"><h2>District registration footprint</h2></div>
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
      <div class="panel span-6">
        <div class="table-header"><h2>Public evidence links</h2><span class="status green">Source-backed</span></div>
        <div class="source-list evidence-grid compact">
          ${publicSources.slice(0, 3).map((source) => `
            <div class="source-item">
              <a href="${source.url}" target="_blank" rel="noreferrer">${escapeHtml(source.publisher)}</a>
              <p>${escapeHtml(source.fact)}</p>
            </div>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderContentAdmin() {
  const latestStory = publishedStories()[0] || {};
  const editingStory = state.stories.find((story) => story.id === editingStoryId);
  const storyDraft = editingStory || {
    title: "Rank mobilisation turns safety messages into daily practice",
    category: "Training",
    createdAt: today(),
    status: "published",
    location: "Lilongwe",
    partners: ["ROSAF", "MACOKASA district committee"],
    impactLine: "Practical training gives verified membership a visible safety purpose.",
    summary: "MACOKASA and safety stakeholders are building a verified, safer Kabaza sector through training, membership, and digital card authentication.",
    body: "The story can highlight field activity, district engagement, operator participation, owner benefits, stakeholder meetings, or safety outcomes. It will appear on the public website after saving.",
    images: [defaultStoryImage]
  };
  const draftImages = storyImages(storyDraft);
  return `
    <section class="grid">
      <div class="panel span-7">
        <div class="panel-header">
          <div><p class="eyebrow">Webpage admin</p><h2>${editingStory ? "Edit public story" : "Post public story with visuals"}</h2></div>
          <span class="status ${editingStory ? "amber" : "green"}">${editingStory ? "Editing story" : "Preview enabled"}</span>
        </div>
        <form class="form-grid" data-form="story" data-story-composer>
          <input type="hidden" name="storyId" value="${escapeAttr(editingStory?.id || "")}" />
          <label class="field"><span>Story title</span><input class="input-control" name="title" data-story-field="title" required value="${escapeAttr(storyDraft.title)}" /></label>
          <label class="field"><span>Category</span>${select("category", ["Government engagement", "Safety campaign", "Training", "District registration", "Owner impact", "Member story"], storyDraft.category || "Training")}</label>
          <label class="field"><span>Publication date</span><input class="input-control" type="date" name="createdAt" data-story-field="createdAt" value="${escapeAttr(storyDraft.createdAt || today())}" /></label>
          <label class="field"><span>Status</span>${select("status", ["published", "draft"], storyDraft.status || "published")}</label>
          <label class="field"><span>Location</span><input class="input-control" name="location" value="${escapeAttr(storyDraft.location || "")}" placeholder="District, city, or national" /></label>
          <label class="field"><span>Partners</span><input class="input-control" name="partners" value="${escapeAttr(storyPartners(storyDraft).join(", "))}" placeholder="ROSAF, DRTSS, district committee" /></label>
          <label class="field full"><span>Outcome line</span><input class="input-control" name="impactLine" value="${escapeAttr(storyDraft.impactLine || "")}" placeholder="One clear result or reason this story matters" /></label>
          <label class="field full"><span>Summary</span><textarea class="textarea-control" name="summary" data-story-field="summary" required>${escapeHtml(storyDraft.summary || "")}</textarea></label>
          <label class="field full"><span>Full story</span><textarea class="textarea-control" name="body" data-story-field="body">${escapeHtml(storyDraft.body || "")}</textarea></label>
          <label class="field full"><span>Attach visuals</span><input class="input-control" type="file" accept="image/*" multiple data-story-image /><small class="microcopy">Select more than one photo to publish a story gallery. When editing, choosing files replaces the current story photos.</small></label>
          <input type="hidden" name="images" data-story-images value="${escapeAttr(JSON.stringify(draftImages))}" />
          <input type="hidden" name="imageData" data-story-primary-image value="${escapeAttr(draftImages[0] || defaultStoryImage)}" />
          <div class="form-actions full">
            <button class="primary-btn" type="submit">${editingStory ? "Update story" : "Publish story"}</button>
            ${editingStory ? `<button class="quiet-btn" type="button" data-action="cancel-story-edit">Cancel edit</button>` : ""}
          </div>
        </form>
      </div>
      <div class="panel span-5">
        <div class="panel-header">
          <div><p class="eyebrow">Public preview</p><h2>Story card preview</h2></div>
          <span class="status">${draftImages.length} photo${draftImages.length === 1 ? "" : "s"}</span>
        </div>
        <article class="admin-story-preview" data-story-preview>
          <div class="story-preview-gallery" data-story-preview-gallery>${storyGallery(storyDraft, "admin")}</div>
          <div>
            <span data-story-preview-meta>${escapeHtml(storyDraft.category || "Impact")} - ${escapeHtml(storyDraft.location || "Malawi")} - ${compactDate(storyDraft.createdAt || today())}</span>
            <h3 data-story-preview-title>${escapeHtml(storyDraft.title || "Story title")}</h3>
            <p data-story-preview-summary>${escapeHtml(storyDraft.summary || "Story summary will appear here.")}</p>
            <blockquote data-story-preview-impact>${escapeHtml(storyDraft.impactLine || "The story outcome will appear here.")}</blockquote>
            <small data-story-preview-partners>${escapeHtml(storyPartners(storyDraft).join(" | ") || "Partners will appear here.")}</small>
          </div>
        </article>
        <div class="record-card story-admin-note">
          <strong>Latest public story</strong>
          <span>${escapeHtml(latestStory.title || "No published story yet")}</span>
        </div>
      </div>
      <div class="panel span-12">
        <div class="table-header"><h2>Website story register</h2><span class="status">${state.stories.length} stories</span></div>
        ${storyTable(state.stories)}
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

function memberPhotoCapture() {
  return `
    <fieldset class="member-photo-capture field full" data-member-photo-capture>
      <legend>Member face photo <span>Required for the ID card</span></legend>
      <div class="member-photo-workspace">
        <div class="member-face-preview" data-member-photo-preview>
          <img data-member-photo-image alt="Captured member face preview" hidden />
          <div class="member-photo-placeholder">
            ${iconCamera()}
            <strong>No face photo captured</strong>
            <span>Place the member alone in good light and face the camera directly.</span>
          </div>
        </div>
        <div class="member-photo-console">
          <div class="member-camera-stage" data-member-camera-stage hidden>
            <video data-member-camera-video autoplay muted playsinline aria-label="Live member camera"></video>
            <div class="camera-face-guide" aria-hidden="true"></div>
            <span>Keep the face inside the guide</span>
          </div>
          <div class="member-photo-guidance" data-member-photo-guidance>
            <strong>Photo for the member ID</strong>
            <p>Open the front camera and capture one clear, forward-facing portrait. The saved image will be assigned to this member's printed and digital ID.</p>
          </div>
          <canvas data-member-photo-canvas width="480" height="600" hidden></canvas>
          <input type="hidden" name="photoData" data-member-photo-data />
          <div class="member-photo-actions">
            <button class="primary-btn" type="button" data-action="start-member-camera">${iconCamera()} Open camera</button>
            <button class="secondary-btn" type="button" data-action="capture-member-photo" hidden>${iconCheck()} Capture photo</button>
            <button class="quiet-btn" type="button" data-action="stop-member-camera" hidden>Cancel camera</button>
            <label class="quiet-btn member-photo-upload">
              ${iconUpload()} Choose photo
              <input type="file" accept="image/*" data-member-photo-upload />
            </label>
            <button class="danger-btn" type="button" data-action="clear-member-photo" hidden>Remove photo</button>
          </div>
          <p class="member-camera-status" data-member-camera-status aria-live="polite">The browser will ask for camera permission. A photo file can be used when a camera is unavailable.</p>
        </div>
      </div>
    </fieldset>
  `;
}

function operatorForm() {
  return `
    <form class="form-grid" data-form="operator">
      <label class="field"><span>Operator category</span>${select("operatorCategory", ["Motorcycle operator", "Bicycle operator"], "Motorcycle operator")}</label>
      <label class="field"><span>Full name</span><input class="input-control" name="fullName" required /></label>
      <label class="field"><span>Phone</span><input class="input-control" name="phone" required placeholder="+265..." /></label>
      <label class="field"><span>Email</span><input class="input-control" type="email" name="email" /></label>
      <label class="field"><span>National ID</span><input class="input-control" name="nationalId" /></label>
      <label class="field"><span>Sex</span>${select("sex", ["Male", "Female"], "Male")}</label>
      ${memberPhotoCapture()}
      <label class="field"><span>District</span>${select("district", districts, "Lilongwe")}</label>
      <label class="field"><span>Operating area/rank</span><input class="input-control" name="operatingArea" required /></label>
      <label class="field"><span>Membership</span>${planSelect("membershipPlan", "regular", "Operator")}</label>
      <label class="field"><span>Owns or rents?</span>${select("ownershipStatus", ["Owns motorcycle", "Rents motorcycle", "Owns bicycle", "Rents bicycle"], "Rents motorcycle")}</label>
      <label class="field"><span>Licence or training record?</span>${select("hasLicense", ["Yes", "No"], "No")}</label>
      <label class="field"><span>Licence / training number</span><input class="input-control" name="licenseNumber" /></label>
      <label class="field"><span>Plate / bicycle ID</span><input class="input-control" name="licensePlate" placeholder="LL 0000 or bicycle ID" /></label>
      <label class="field"><span>Helmet use</span>${select("helmetUse", ["Yes", "No"], "Yes")}</label>
      <label class="field"><span>Passenger helmet</span>${select("passengerHelmet", ["Yes", "No"], "No")}</label>
      <label class="field"><span>Tracker installed</span>${select("trackerInstalled", ["Yes", "No"], "No")}</label>
      <button class="primary-btn" type="submit">Register operator</button>
    </form>
  `;
}

function handleClick(event) {
  const storyFilterButton = event.target.closest("[data-story-filter]");
  if (storyFilterButton) {
    storyFilter = storyFilterButton.dataset.storyFilter || "All";
    selectedStoryId = "";
    activeSection = "stories";
    render();
    return;
  }
  const storyOpenButton = event.target.closest("[data-story-open]");
  if (storyOpenButton) {
    selectedStoryId = storyOpenButton.dataset.storyOpen || "";
    activeSection = "stories";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (event.target.closest("[data-story-close]")) {
    selectedStoryId = "";
    activeSection = "stories";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
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
    window.scrollTo({ top: 0, behavior: "auto" });
    return;
  }
  const role = event.target.closest("[data-role]")?.dataset.role;
  if (role) {
    activeRole = role;
    render();
    window.scrollTo({ top: 0, behavior: "auto" });
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  const memberForm = event.target.closest('form[data-form="operator"]');
  if (action === "start-member-camera") {
    void startMemberCamera(memberForm);
    return;
  }
  if (action === "capture-member-photo") {
    captureMemberPhoto(memberForm);
    return;
  }
  if (action === "stop-member-camera") {
    stopMemberCamera(memberForm, "Camera closed. The member photo has not changed.");
    return;
  }
  if (action === "clear-member-photo") {
    clearMemberPhoto(memberForm);
    return;
  }
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
  const editStory = event.target.closest("[data-edit-story]");
  if (editStory) {
    const story = state.stories.find((item) => item.id === editStory.dataset.editStory);
    if (!story) {
      showToast("Story was not found.");
      return;
    }
    editingStoryId = story.id;
    activeSection = "content";
    render();
    showToast("Story loaded for editing.");
    return;
  }
  const deleteStory = event.target.closest("[data-delete-story]");
  if (deleteStory) {
    const story = state.stories.find((item) => item.id === deleteStory.dataset.deleteStory);
    if (!story) {
      showToast("Story was not found.");
      return;
    }
    if (!window.confirm(`Delete "${story.title}" from the public website?`)) return;
    if (editingStoryId === story.id) editingStoryId = "";
    void deleteRecord("stories", story.id);
    showToast("Story deleted from the website.");
    return;
  }
  if (action === "cancel-story-edit") {
    editingStoryId = "";
    render();
    showToast("Story editing cancelled.");
    return;
  }
  if (action === "logout") {
    void signOut();
    return;
  }
  if (action === "reset-password") {
    void requestPasswordReset();
    return;
  }
  if (action === "run-reminders") runReminderAutomation();
  if (action === "reconcile-sample") reconcileCashPayments();
  if (action === "donate") {
    activeSection = "donate";
    render();
    showToast("Donation page is ready.");
  }
}

function handleChange(event) {
  if (event.target.matches("[data-role-switcher]")) {
    activeRole = event.target.value;
    render();
  }
  if (event.target.matches("[data-card-operator-select]")) {
    selectedCardOperatorId = event.target.value;
    render();
    return;
  }
  if (event.target.matches("[data-member-photo-upload]")) {
    const file = event.target.files?.[0];
    const form = event.target.closest('form[data-form="operator"]');
    if (file && form) void useMemberPhotoFile(form, file);
    return;
  }
  if (event.target.matches("[data-card-photo]")) {
    const file = event.target.files?.[0];
    if (!file) return;
    const operatorId = event.target.closest("[data-card-designer]")?.dataset.operatorId;
    if (operatorId) void replaceMemberPhoto(operatorId, file);
    return;
  }
  if (event.target.matches("[data-story-image]")) {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    const form = event.target.closest("[data-story-composer]");
    Promise.all(files.map(readImageFile)).then((images) => {
      const hidden = form?.querySelector("[data-story-images]");
      const primary = form?.querySelector("[data-story-primary-image]");
      if (hidden) hidden.value = JSON.stringify(images);
      if (primary) primary.value = images[0] || defaultStoryImage;
      updateStoryPreview(form);
    });
    return;
  }
  if (event.target.matches("[data-owner-bike-filter]")) {
    ownerFundFilterId = event.target.value;
    render();
  }
  if (event.target.closest("[data-card-designer]")) updateCardPreviewFromForm();
  if (event.target.closest("[data-story-composer]")) updateStoryPreview(event.target.closest("[data-story-composer]"));
}

function handleInput(event) {
  if (event.target.closest("[data-card-designer]")) updateCardPreviewFromForm();
  if (event.target.closest("[data-story-composer]")) updateStoryPreview(event.target.closest("[data-story-composer]"));
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
}

async function startMemberCamera(form) {
  if (!form) return;
  stopMemberCamera();
  const requestId = ++cameraRequestId;
  const status = form.querySelector("[data-member-camera-status]");
  if (!navigator.mediaDevices?.getUserMedia) {
    if (status) status.textContent = "This browser cannot open a live camera. Choose a photo file instead.";
    return;
  }
  const stage = form.querySelector("[data-member-camera-stage]");
  const video = form.querySelector("[data-member-camera-video]");
  const openButton = form.querySelector('[data-action="start-member-camera"]');
  const captureButton = form.querySelector('[data-action="capture-member-photo"]');
  const stopButton = form.querySelector('[data-action="stop-member-camera"]');
  const uploadButton = form.querySelector("[data-member-photo-upload]")?.closest("label");
  const guidance = form.querySelector("[data-member-photo-guidance]");
  activeCameraForm = form;
  if (stage) stage.hidden = false;
  if (guidance) guidance.hidden = true;
  if (openButton) openButton.hidden = true;
  if (captureButton) captureButton.hidden = false;
  if (stopButton) stopButton.hidden = false;
  if (uploadButton) uploadButton.hidden = true;
  if (status) status.textContent = "Allow camera access, then keep the member's face inside the guide.";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 960 }
      },
      audio: false
    });
    if (requestId !== cameraRequestId || activeCameraForm !== form || !form.isConnected) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    activeCameraStream = stream;
    if (video) {
      video.srcObject = activeCameraStream;
      await video.play();
    }
  } catch (error) {
    if (requestId !== cameraRequestId) return;
    console.error(error);
    stopMemberCamera(form, cameraErrorMessage(error));
  }
}

function captureMemberPhoto(form) {
  if (!form) return;
  const video = form.querySelector("[data-member-camera-video]");
  const canvas = form.querySelector("[data-member-photo-canvas]");
  const status = form.querySelector("[data-member-camera-status]");
  if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    if (status) status.textContent = "The camera is still preparing. Hold still and try capture again.";
    return;
  }
  drawPortraitImage(video, video.videoWidth, video.videoHeight, canvas);
  const photoData = canvas.toDataURL("image/jpeg", 0.84);
  stopMemberCamera(form);
  setMemberPhoto(form, photoData, "Face photo captured. Review it before registering the member.");
}

function stopMemberCamera(form = activeCameraForm, message = "") {
  cameraRequestId += 1;
  if (activeCameraStream) activeCameraStream.getTracks().forEach((track) => track.stop());
  activeCameraStream = null;
  const targetForm = form || activeCameraForm;
  if (targetForm) {
    const video = targetForm.querySelector("[data-member-camera-video]");
    const stage = targetForm.querySelector("[data-member-camera-stage]");
    const openButton = targetForm.querySelector('[data-action="start-member-camera"]');
    const captureButton = targetForm.querySelector('[data-action="capture-member-photo"]');
    const stopButton = targetForm.querySelector('[data-action="stop-member-camera"]');
    const uploadButton = targetForm.querySelector("[data-member-photo-upload]")?.closest("label");
    const guidance = targetForm.querySelector("[data-member-photo-guidance]");
    const status = targetForm.querySelector("[data-member-camera-status]");
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    if (stage) stage.hidden = true;
    if (guidance) guidance.hidden = false;
    if (openButton) openButton.hidden = false;
    if (captureButton) captureButton.hidden = true;
    if (stopButton) stopButton.hidden = true;
    if (uploadButton) uploadButton.hidden = false;
    if (status && message) status.textContent = message;
  }
  activeCameraForm = null;
}

function clearMemberPhoto(form) {
  if (!form) return;
  stopMemberCamera(form);
  const hidden = form.querySelector("[data-member-photo-data]");
  const preview = form.querySelector("[data-member-photo-preview]");
  const image = form.querySelector("[data-member-photo-image]");
  const clearButton = form.querySelector('[data-action="clear-member-photo"]');
  const openButton = form.querySelector('[data-action="start-member-camera"]');
  const status = form.querySelector("[data-member-camera-status]");
  if (hidden) hidden.value = "";
  if (image) {
    image.hidden = true;
    image.removeAttribute("src");
  }
  preview?.classList.remove("has-photo");
  if (clearButton) clearButton.hidden = true;
  if (openButton) openButton.innerHTML = `${iconCamera()} Open camera`;
  if (status) status.textContent = "Photo removed. Capture or choose a face photo before registration.";
}

function setMemberPhoto(form, photoData, message) {
  const hidden = form.querySelector("[data-member-photo-data]");
  const preview = form.querySelector("[data-member-photo-preview]");
  const image = form.querySelector("[data-member-photo-image]");
  const clearButton = form.querySelector('[data-action="clear-member-photo"]');
  const openButton = form.querySelector('[data-action="start-member-camera"]');
  const status = form.querySelector("[data-member-camera-status]");
  if (hidden) hidden.value = photoData;
  if (image) {
    image.src = photoData;
    image.hidden = false;
  }
  preview?.classList.add("has-photo");
  if (clearButton) clearButton.hidden = false;
  if (openButton) openButton.innerHTML = `${iconCamera()} Retake photo`;
  if (status) status.textContent = message;
}

async function useMemberPhotoFile(form, file) {
  const status = form.querySelector("[data-member-camera-status]");
  if (status) status.textContent = "Preparing the selected face photo...";
  try {
    const photoData = await prepareMemberPhoto(file);
    stopMemberCamera(form);
    setMemberPhoto(form, photoData, "Face photo ready. Review it before registering the member.");
  } catch (error) {
    console.error(error);
    if (status) status.textContent = "The selected image could not be prepared. Choose another photo.";
  }
}

async function replaceMemberPhoto(operatorId, file) {
  try {
    const photoData = await prepareMemberPhoto(file);
    const storedPhoto = await storeMemberPhoto(operatorId, photoData);
    await updateRecord("operators", operatorId, {
      photoData: storedPhoto,
      photoUrl: /^(https?:|storage:)/.test(storedPhoto) ? storedPhoto : "",
      photoCapturedAt: new Date().toISOString()
    });
    showToast("The saved member photo and ID preview were updated.");
  } catch (error) {
    console.error(error);
    showToast("The selected member photo could not be saved.");
  }
}

async function prepareMemberPhoto(file) {
  const source = await readImageFile(file);
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = reject;
    element.src = source;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 600;
  drawPortraitImage(image, image.naturalWidth, image.naturalHeight, canvas);
  return canvas.toDataURL("image/jpeg", 0.84);
}

function drawPortraitImage(source, sourceWidth, sourceHeight, canvas) {
  const targetRatio = canvas.width / canvas.height;
  const sourceRatio = sourceWidth / sourceHeight;
  let sourceX = 0;
  let sourceY = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (sourceRatio > targetRatio) {
    cropWidth = sourceHeight * targetRatio;
    sourceX = (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = sourceWidth / targetRatio;
    sourceY = Math.max(0, (sourceHeight - cropHeight) * 0.34);
  }
  const context = canvas.getContext("2d");
  context.fillStyle = "#eef2f4";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, sourceX, sourceY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
}

/**
 * Member photos live in a PRIVATE bucket. Records store a reference of the
 * form `storage:member-photos/<path>`. This resolves those references to
 * signed URLs valid for a short window, and caches them for the page life.
 */
const signedPhotoCache = new Map();

function isStorageRef(value) {
  return typeof value === "string" && value.startsWith("storage:");
}

function memberPhotoSrc(operator) {
  const ref = operator?.photoUrl || operator?.photoData || "";
  if (!ref) return "./assets/member-photo-placeholder.png";
  if (isStorageRef(ref)) {
    return signedPhotoCache.get(ref) || "./assets/member-photo-placeholder.png";
  }
  return ref;
}

async function resolveSignedPhoto(ref) {
  if (signedPhotoCache.has(ref)) return signedPhotoCache.get(ref);
  if (!supabaseClient || !isStorageRef(ref)) return "";
  const withoutScheme = ref.slice("storage:".length).split("?")[0];
  const [bucket, ...rest] = withoutScheme.split("/");
  const objectPath = rest.join("/");
  try {
    const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(objectPath, 300);
    if (error) throw error;
    if (data?.signedUrl) {
      signedPhotoCache.set(ref, data.signedUrl);
      // Expire slightly before the signed URL does.
      window.setTimeout(() => signedPhotoCache.delete(ref), 270000);
      return data.signedUrl;
    }
  } catch (error) {
    console.error(error);
  }
  return "";
}

async function hydrateMemberPhotos() {
  if (!supabaseClient) return;
  const nodes = document.querySelectorAll("[data-photo-ref]");
  if (!nodes.length) return;
  const refs = [...new Set([...nodes].map((node) => node.dataset.photoRef).filter(isStorageRef))];
  const resolved = await Promise.all(refs.map((ref) => resolveSignedPhoto(ref)));
  const map = new Map(refs.map((ref, index) => [ref, resolved[index]]));
  nodes.forEach((node) => {
    const url = map.get(node.dataset.photoRef);
    if (url) node.src = url;
  });

  const bgNodes = document.querySelectorAll("[data-photo-bg-ref]");
  const bgRefs = [...new Set([...bgNodes].map((node) => node.dataset.photoBgRef).filter(isStorageRef))];
  const bgResolved = await Promise.all(bgRefs.map((ref) => resolveSignedPhoto(ref)));
  const bgMap = new Map(bgRefs.map((ref, index) => [ref, bgResolved[index]]));
  bgNodes.forEach((node) => {
    const url = bgMap.get(node.dataset.photoBgRef);
    if (url) node.style.backgroundImage = `url('${url}')`;
  });
}

async function storeMemberPhoto(memberId, photoData) {
  if (!supabaseEnabled || !supabaseClient || !photoData.startsWith("data:")) return photoData;
  try {
    const photoBlob = await fetch(photoData).then((response) => response.blob());
    const version = Date.now();
    const filePath = `${String(memberId).replace(/[^a-zA-Z0-9-_]/g, "")}/id-photo.jpg`;
    const { error } = await supabaseClient.storage.from("member-photos").upload(filePath, photoBlob, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: true
    });
    if (error) throw error;
    // The member-photos bucket is PRIVATE. We store the object path, not a
    // public URL, and mint a short-lived signed URL only when displaying it.
    return `storage:member-photos/${filePath}?v=${version}`;
  } catch (error) {
    console.error(error);
    return photoData;
  }
}

function cameraErrorMessage(error) {
  if (error?.name === "NotAllowedError") return "Camera permission was not granted. Allow access in the browser or choose a photo file.";
  if (error?.name === "NotFoundError") return "No camera was found on this device. Choose a photo file instead.";
  if (error?.name === "NotReadableError") return "The camera is being used by another application. Close it there and try again.";
  return "The camera could not start. Check browser permission or choose a photo file.";
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
    cooperative: submitCooperative,
    story: submitStory
  };
  await handlers[form.dataset.form]?.(values);
}

async function submitPortalLogin(values) {
  if (!supabaseEnabled || !supabaseClient) {
    showToast("Sign-in needs a live database connection.");
    return;
  }
  const email = String(values.email || "").trim().toLowerCase();
  const password = String(values.password || "");
  if (!email || !password) {
    showToast("Enter your email and password.");
    return;
  }

  authBusy = true;
  render();
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    authSession = data.session;
    await loadAuthProfile();
    if (!authProfile) {
      await supabaseClient.auth.signOut();
      showToast("No MACOKASA profile is linked to this account.");
      return;
    }
    if (!authProfile.isActive) {
      await supabaseClient.auth.signOut();
      authSession = null;
      authProfile = null;
      showToast("This account has been deactivated.");
      return;
    }
    applyProfileRole();
    showToast(`Signed in as ${roleLabelFor(authProfile.role)}.`);
  } catch (error) {
    console.error(error);
    // Deliberately generic: never reveal whether the email exists.
    showToast("Sign-in failed. Check your email and password.");
  } finally {
    authBusy = false;
    render();
  }
}

/* ---- Authentication (Supabase Auth) ---- */

async function loadAuthProfile() {
  authProfile = null;
  if (!supabaseClient || !authSession?.user?.id) return;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, full_name, role, district, is_active")
    .eq("id", authSession.user.id)
    .maybeSingle();
  if (error) {
    console.error(error);
    return;
  }
  if (!data) return;
  authProfile = {
    id: data.id,
    fullName: data.full_name || "",
    role: data.role || "member",
    district: data.district || "",
    isActive: data.is_active !== false
  };
}

function applyProfileRole() {
  unlockedRoles = new Set(["public"]);
  if (!authProfile?.isActive) return;
  const role = authProfile.role;
  if (["staff", "owner", "printing", "webadmin"].includes(role)) {
    unlockedRoles.add(role);
    activeRole = role;
    activeSection =
      role === "owner" ? "owners" : role === "printing" ? "cards" : role === "webadmin" ? "content" : "staff";
  }
}

async function restoreSession() {
  if (!supabaseClient) {
    authChecked = true;
    return;
  }
  try {
    const { data } = await supabaseClient.auth.getSession();
    authSession = data?.session || null;
    if (authSession) {
      await loadAuthProfile();
      if (authProfile?.isActive) {
        unlockedRoles.add(authProfile.role);
      }
    }
    supabaseClient.auth.onAuthStateChange((event, session) => {
      authSession = session;
      if (event === "SIGNED_OUT") {
        authProfile = null;
        unlockedRoles = new Set(["public"]);
        activeRole = "public";
        activeSection = "public";
        render();
      }
    });
  } catch (error) {
    console.error(error);
  } finally {
    authChecked = true;
  }
}

async function signOut() {
  try {
    await supabaseClient?.auth.signOut();
  } catch (error) {
    console.error(error);
  }
  authSession = null;
  authProfile = null;
  unlockedRoles = new Set(["public"]);
  activeRole = "public";
  activeSection = "public";
  render();
  showToast("Signed out.");
}

async function requestPasswordReset() {
  if (!supabaseClient) {
    showToast("Password reset needs a live database connection.");
    return;
  }
  const email = window.prompt("Enter your work email to receive a reset link:");
  if (!email) return;
  try {
    await supabaseClient.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: appBaseUrl()
    });
  } catch (error) {
    console.error(error);
  }
  // Always the same message, so the form cannot be used to enumerate accounts.
  showToast("If that account exists, a reset link has been sent.");
}

function roleLabelFor(role) {
  return (
    {
      staff: "Staff ERP",
      owner: "Motorcycle owner",
      printing: "Printing and cards",
      webadmin: "Website administrator",
      member: "Member"
    }[role] || "Member"
  );
}

async function submitOperator(values) {
  if (!values.photoData) {
    showToast("Capture or choose the member's face photo before registration.");
    document.querySelector("[data-member-photo-capture]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const plan = planByKey(values.membershipPlan);
  const id = newId("op");
  const districtCode = (values.district || "MW").slice(0, 2).toUpperCase();
  const storedPhoto = await storeMemberPhoto(id, values.photoData);
  const operator = {
    id,
    membershipNumber: `MCK-${districtCode}-${new Date().getFullYear()}-${String(state.operators.length + 1).padStart(4, "0")}`,
    fullName: values.fullName,
    phone: values.phone,
    email: values.email,
    nationalId: values.nationalId,
    operatorCategory: values.operatorCategory,
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
    photoData: storedPhoto,
    photoUrl: /^(https?:|storage:)/.test(storedPhoto) ? storedPhoto : "",
    photoCapturedAt: new Date().toISOString(),
    createdAt: today()
  };
  await addRecord("operators", operator);
  selectedCardOperatorId = operator.id;
  await addRecord("cards", {
    id: newId("card"),
    operatorId: operator.id,
    cardNumber: `CARD-MCK-${String(state.cards.length + 1).padStart(4, "0")}`,
    qrToken: `qr-${operator.id}-${Date.now()}`,
    status: "print queue",
    membershipPlan: operator.membershipPlan,
    issuedAt: "",
    replacedBy: ""
  });
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
  showToast("Member registered. Face photo saved and the assigned ID card is in the print queue.");
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

async function submitStory(values) {
  const images = storyImages(values.images);
  const storyRecord = {
    title: values.title,
    category: values.category,
    location: values.location,
    partners: String(values.partners || "").split(",").map((partner) => partner.trim()).filter(Boolean),
    impactLine: values.impactLine,
    summary: values.summary,
    body: values.body,
    images,
    imageData: images[0] || defaultStoryImage,
    status: values.status || "published",
    createdAt: values.createdAt || today(),
    updatedAt: new Date().toISOString()
  };
  if (values.storyId && state.stories.some((story) => story.id === values.storyId)) {
    const storyId = values.storyId;
    editingStoryId = "";
    activeSection = "content";
    await updateRecord("stories", storyId, storyRecord);
    showToast(values.status === "draft" ? "Draft story updated." : "Published story updated.");
    return;
  }
  await addRecord("stories", {
    id: newId("story"),
    ...storyRecord
  });
  editingStoryId = "";
  activeSection = "content";
  showToast(values.status === "draft" ? "Story saved as draft." : "Story published to the website.");
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

function liveImpact() {
  const baseline = state.impact || demoState.impact;
  const operatorGrowth = Math.max(0, (state.operators?.length || 0) - liveCollectionBaselines.operators);
  const motorcycleGrowth = Math.max(0, (state.motorcycles?.length || 0) - liveCollectionBaselines.motorcycles);
  const ownerGrowth = Math.max(0, (state.owners?.length || 0) - liveCollectionBaselines.owners);
  const representedDistricts = new Set((state.operators || []).map((operator) => operator.district).filter(Boolean)).size;
  return {
    ...baseline,
    registeredOperators: Math.max(Number(baseline.registeredOperators || 0) + operatorGrowth, state.operators?.length || 0),
    registeredMotorcycles: Math.max(Number(baseline.registeredMotorcycles || 0) + motorcycleGrowth, state.motorcycles?.length || 0),
    subscribedOwners: Math.max(Number(baseline.subscribedOwners || 0) + ownerGrowth, state.owners?.length || 0),
    districtsReached: Math.max(Number(baseline.districtsReached || 0), representedDistricts)
  };
}

function liveUpdateLabel() {
  if (liveDataStatus === "live") {
    const time = lastLiveSyncAt
      ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(lastLiveSyncAt)
      : "now";
    return `Live from the IMS - updated ${time}`;
  }
  if (liveDataStatus === "connecting" || liveDataStatus === "reconnecting") return "Refreshing live IMS records";
  return "IMS preview dataset";
}

function liveImpactMetric(label, value, note, icon) {
  return `
    <article class="live-impact-metric">
      <span class="live-impact-icon">${icon}</span>
      <strong>${escapeHtml(value)}</strong>
      <h3>${escapeHtml(label)}</h3>
      <p>${escapeHtml(note)}</p>
    </article>
  `;
}

function storyPillar(kicker, title, text, image, alt, category) {
  return `
    <article class="story-pillar">
      <img src="${escapeAttr(image)}" alt="${escapeAttr(alt)}" />
      <div>
        <span>${escapeHtml(kicker)}</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(text)}</p>
        <button class="text-link-btn" type="button" data-story-filter="${escapeAttr(category)}">Explore this work ${iconArrow()}</button>
      </div>
    </article>
  `;
}

function metric(label, value, note, spanClass = "span-3") {
  return `<article class="metric ${spanClass}"><div class="metric-icon">${iconForMetric(label)}</div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function themeCard(title, text, action, section, icon) {
  return `
    <article class="theme-card">
      <span>${icon}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
      <button class="quiet-btn" type="button" data-section="${escapeAttr(section)}">${escapeHtml(action)}</button>
    </article>
  `;
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

function publishedStories() {
  return [...(state.stories || [])]
    .filter((story) => story.status !== "draft")
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function storyImages(source) {
  let images = [];
  if (Array.isArray(source)) {
    images = source;
  } else if (typeof source === "string") {
    try {
      const parsed = JSON.parse(source);
      images = Array.isArray(parsed) ? parsed : [source];
    } catch {
      images = source ? [source] : [];
    }
  } else if (source) {
    images = Array.isArray(source.images) ? source.images : [];
    if (!images.length && source.imageData) images = [source.imageData];
  }
  const cleaned = images.map((item) => String(item || "").trim()).filter(Boolean);
  return cleaned.length ? cleaned : [defaultStoryImage];
}

function storyPrimaryImage(story) {
  return storyImages(story)[0] || defaultStoryImage;
}

function storyPartners(story) {
  if (Array.isArray(story?.partners)) return story.partners.map((partner) => String(partner).trim()).filter(Boolean);
  return String(story?.partners || "").split(",").map((partner) => partner.trim()).filter(Boolean);
}

function storyMetadata(story) {
  const partners = storyPartners(story);
  return `
    <div class="story-metadata">
      <span>${escapeHtml(story?.category || "Field update")}</span>
      <time datetime="${escapeAttr(story?.createdAt || today())}">${compactDate(story?.createdAt || today())}</time>
      <span>${escapeHtml(story?.location || "Malawi")}</span>
      ${partners[0] ? `<span>With ${escapeHtml(partners[0])}</span>` : ""}
    </div>
  `;
}

function storyGallery(story, variant = "feature") {
  const images = storyImages(story);
  const title = story?.title || "MACOKASA story";
  const extraCount = Math.max(0, images.length - 4);
  return `
    <div class="story-gallery story-gallery-${escapeAttr(variant)}">
      <img class="story-gallery-main" src="${escapeAttr(images[0] || defaultStoryImage)}" alt="${escapeAttr(title)}" />
      ${images.length > 1 ? `
        <div class="story-gallery-strip">
          ${images.slice(1, 4).map((image, index) => `<img src="${escapeAttr(image)}" alt="${escapeAttr(`${title} photo ${index + 2}`)}" />`).join("")}
          ${extraCount ? `<span class="story-photo-count">+${extraCount}</span>` : ""}
        </div>
      ` : ""}
    </div>
  `;
}

function storyCardMedia(story) {
  const images = storyImages(story);
  return `
    <div class="story-card-media">
      <img src="${escapeAttr(storyPrimaryImage(story))}" alt="${escapeAttr(story?.title || "MACOKASA story")}" />
      ${images.length > 1 ? `<span class="story-photo-badge">${images.length} photos</span>` : ""}
    </div>
  `;
}

function storyCards(rows) {
  return [...rows].map((story) => `
    <article class="public-story-card">
      ${storyCardMedia(story)}
      <div class="public-story-card-body">
        ${storyMetadata(story)}
        <h3>${escapeHtml(story.title || "MACOKASA story")}</h3>
        <p>${escapeHtml(story.summary || "")}</p>
        ${story.impactLine ? `<strong class="story-outcome">${escapeHtml(story.impactLine)}</strong>` : ""}
        ${story.id ? `<button class="story-read-btn" type="button" data-story-open="${escapeAttr(story.id)}">Read story ${iconArrow()}</button>` : ""}
      </div>
    </article>
  `).join("");
}

function cardDesignerForm(operator, card) {
  return `
    <form class="form-grid card-designer" data-card-designer data-operator-id="${escapeAttr(operator.id)}">
      <label class="field full"><span>Member assigned to this ID</span>
        <select class="select-control" data-card-operator-select>
          ${state.operators.map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === operator.id ? "selected" : ""}>${escapeHtml(item.fullName)} - ${escapeHtml(item.membershipNumber)}</option>`).join("")}
        </select>
      </label>
      <label class="field"><span>Name on card</span><input class="input-control" name="cardName" value="${escapeAttr(operator.fullName)}" /></label>
      <label class="field"><span>Membership class</span>${planSelect("cardPlan", card?.membershipPlan || operator.membershipPlan, "Operator")}</label>
      <label class="field"><span>Membership number</span><input class="input-control" name="cardNumber" value="${escapeAttr(operator.membershipNumber)}" /></label>
      <label class="field"><span>Sex</span>${select("cardSex", ["Male", "Female"], operator.sex || "Male")}</label>
      <label class="field"><span>Operating area</span><input class="input-control" name="cardArea" value="${escapeAttr(operator.operatingArea)}" /></label>
      <label class="field"><span>District</span>${select("cardDistrict", districts, operator.district)}</label>
      <label class="field"><span>Replace saved face photo</span><input class="input-control" type="file" accept="image/*" data-card-photo /></label>
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
    // PCI-DSS: MACOKASA must never render fields that capture a primary
    // account number or CVV. Card payments will be handled by a licensed
    // hosted checkout. See docs/PAYMENTS.md for the integration contract.
    return `
      <div class="secure-note pending-integration">
        <strong>Bank card payments are not yet enabled.</strong>
        <p>MACOKASA is completing certification with a licensed payment provider. Card details are never collected or stored by this system. Please use AirtelMoney, TNM Mpamba, bank transfer, or cash in the meantime.</p>
      </div>
      <div class="alt-method-actions">
        <button class="quiet-btn" type="button" data-payment-context="${context}" data-payment-method="airtel">Use AirtelMoney</button>
        <button class="quiet-btn" type="button" data-payment-context="${context}" data-payment-method="mpamba">Use Mpamba</button>
        <button class="quiet-btn" type="button" data-payment-context="${context}" data-payment-method="eft">Use bank transfer</button>
      </div>
      <input type="hidden" name="reference" value="" />
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



function operatorTable(rows) {
  if (!rows.length) return `<div class="empty-state">No operators yet.</div>`;
  return table(["Member", "Mode", "Sex", "District", "Area", "Plan", "Licence", "Safety", "Expires"], rows.map((operator) => [
    `<div class="operator-identity"><img src="${escapeAttr(memberPhotoSrc(operator))}" data-photo-ref="${escapeAttr(operator.photoUrl || operator.photoData || "")}" loading="lazy" alt="" /><div><strong>${escapeHtml(operator.fullName)}</strong><br><span class="microcopy">${escapeHtml(operator.membershipNumber)}</span></div></div>`,
    operator.operatorCategory || "Motorcycle operator",
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

function storyTable(rows) {
  if (!rows?.length) return `<div class="empty-state">No website stories have been created yet.</div>`;
  return table(["Date", "Title", "Photos", "Category", "Status", "Preview summary", "Actions"], [...rows]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map((story) => [
      compactDate(story.createdAt),
      `<strong>${escapeHtml(story.title)}</strong>`,
      `${storyImages(story).length}`,
      escapeHtml(story.category || "Impact"),
      statusPill(story.status || "published", story.status === "draft" ? "amber" : "green"),
      escapeHtml(story.summary || ""),
      `<div class="table-actions"><button class="quiet-btn small-btn" type="button" data-edit-story="${escapeAttr(story.id)}">Edit</button><button class="danger-btn small-btn" type="button" data-delete-story="${escapeAttr(story.id)}">Delete</button></div>`
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
  const memberPhoto = memberPhotoSrc(operator);
  const memberPhotoRef = operator.photoUrl || operator.photoData || "";
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
            <span class="malawi-flag card-flag" aria-label="Malawi flag"><span class="flag-sun" aria-hidden="true"></span></span>
          </div>
          <div class="id-card-body">
            <div class="member-photo-panel">
              <div class="member-photo has-image" data-card-photo-preview data-photo-bg-ref="${escapeAttr(memberPhotoRef)}" style="background-image:url('${escapeAttr(memberPhoto)}')">
                <span class="member-initials">${initials(operator.fullName)}</span>
              </div>
              <span class="card-tier photo-tier" data-card-plan-label>${escapeHtml(plan?.name || "Member")}</span>
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
  const photo = document.querySelector("[data-card-photo-preview] .member-initials");
  if (photo) photo.textContent = initials(values.cardName || "Member");
}

function updateStoryPreview(form) {
  if (!form) return;
  const values = formValues(form);
  const images = storyImages(form.querySelector("[data-story-images]")?.value);
  const primary = form.querySelector("[data-story-primary-image]");
  if (primary) primary.value = images[0] || defaultStoryImage;
  const galleryTarget = document.querySelector("[data-story-preview-gallery]");
  const metaTarget = document.querySelector("[data-story-preview-meta]");
  const titleTarget = document.querySelector("[data-story-preview-title]");
  const summaryTarget = document.querySelector("[data-story-preview-summary]");
  const impactTarget = document.querySelector("[data-story-preview-impact]");
  const partnersTarget = document.querySelector("[data-story-preview-partners]");
  const countTarget = document.querySelector("[data-story-preview]")?.closest(".panel")?.querySelector(".panel-header .status");
  if (galleryTarget) galleryTarget.innerHTML = storyGallery({ ...values, images }, "admin");
  if (countTarget) countTarget.textContent = `${images.length} photo${images.length === 1 ? "" : "s"}`;
  if (metaTarget) metaTarget.textContent = `${values.category || "Impact"} - ${values.location || "Malawi"} - ${compactDate(values.createdAt || today())}`;
  if (titleTarget) titleTarget.textContent = values.title || "Story title";
  if (summaryTarget) summaryTarget.textContent = values.summary || "Story summary will appear here.";
  if (impactTarget) impactTarget.textContent = values.impactLine || "The story outcome will appear here.";
  if (partnersTarget) partnersTarget.textContent = String(values.partners || "").split(",").map((partner) => partner.trim()).filter(Boolean).join(" | ") || "Partners will appear here.";
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
    public: "Website",
    owner: "Motorcycle owner",
    staff: "MACOKASA staff",
    printing: "Printing authority",
    webadmin: "WebAdmin"
  }[activeRole] || "Website";
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
function iconStory() { return svg("M4 5h16v14H4V5Zm3 3h10M7 12h10M7 16h6"); }
function iconCloud() { return svg("M17 18H7a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 18 9.5 4.25 4.25 0 0 1 17 18Z"); }
function iconCamera() { return svg("M4 7h3l1.5-2h7L17 7h3v12H4V7Zm8 3a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"); }
function iconCheck() { return svg("m5 12 4 4L19 6"); }
function iconUpload() { return svg("M12 16V4m0 0L7 9m5-5 5 5M5 15v5h14v-5"); }
function iconArrow() { return svg("M5 12h14M14 7l5 5-5 5"); }
function iconArrowLeft() { return svg("M19 12H5M10 7l-5 5 5 5"); }
function svg(path) {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${path}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* ============================================================
   Legal pages, demo notice, and organisation details (P1-1..4)
   ============================================================ */

function orgDetail(key, fallback = "") {
  return (config.organisation && config.organisation[key]) || fallback;
}

function demoDataNotice() {
  if (!config.useDemoData) return "";
  return `
    <div class="demo-banner" role="status">
      <strong>Demonstration data</strong>
      <span>Operators, payments, and cards shown here are sample records for evaluation. This build is not connected to the live MACOKASA membership database.</span>
    </div>
  `;
}

function renderPrivacyPage() {
  const updated = "25 July 2026";
  return `
    <section class="public-page-header legal-header">
      <p class="eyebrow">Legal</p>
      <h1>Privacy notice</h1>
      <p>How MACOKASA collects, uses, and protects personal information belonging to Kabaza operators, motorcycle owners, and members of the public.</p>
      <small class="microcopy">Last updated ${updated}</small>
    </section>

    <section class="legal-body public-band">
      <article class="legal-article">
        <h2>1. Who we are</h2>
        <p>The Malawi Coalition for Kabaza Stakeholders Association (MACOKASA) is the data controller for information processed through this platform. Contact us at ${escapeHtml(orgDetail("email", "the address published on our About page"))}.</p>

        <h2>2. Information we collect</h2>
        <ul>
          <li><strong>Identity data</strong> — full name, sex, district, area, and membership number.</li>
          <li><strong>Contact data</strong> — telephone number and, where provided, email address.</li>
          <li><strong>Photographs</strong> — a facial portrait used solely to produce your membership identity card.</li>
          <li><strong>Vehicle data</strong> — motorcycle or bicycle registration, plate, and ownership linkage.</li>
          <li><strong>Financial data</strong> — subscription and donation records, payment method, reference numbers, and reconciliation status. We do not collect or store bank card numbers.</li>
          <li><strong>Verification data</strong> — a log of when a membership QR code was scanned.</li>
        </ul>

        <h2>3. Why we process it</h2>
        <p>To register and renew membership, issue and verify identity cards, administer subscriptions and cooperative funds, coordinate road safety training with partners such as ROSAF, and report anonymised sector statistics to public institutions.</p>

        <h2>4. Your photograph</h2>
        <p>Facial portraits are stored in private, access-controlled storage. They are visible only to authorised MACOKASA registration and card printing personnel, are never published on the public website, and are never shared for advertising. You may request removal at any time; note that a valid ID card cannot be issued without one.</p>

        <h2>5. Who we share it with</h2>
        <p>We share personal data only with: transport and licensing authorities where legally required; accredited training partners, limited to confirming your membership status; and our technology providers acting under contract. We never sell personal data.</p>

        <h2>6. How long we keep it</h2>
        <p>Membership records are retained for the duration of membership and for six years afterwards to meet accounting and audit obligations. Photographs are deleted within 90 days of a membership lapsing without renewal. QR scan logs are retained for 12 months.</p>

        <h2>7. Your rights</h2>
        <p>You may request access to your data, correction of inaccurate details, deletion where we have no overriding legal obligation, and a copy of your record in a portable format. Contact ${escapeHtml(orgDetail("email", "MACOKASA"))} and we will respond within 30 days.</p>

        <h2>8. Security</h2>
        <p>Access to member records requires an individual authenticated account with a defined role. All record changes are written to an immutable audit log. Data is transmitted over encrypted connections and stored with row-level access controls.</p>

        <h2>9. Local storage on your device</h2>
        <p>This platform stores working data in your browser so that registration can continue during a network interruption. This is not advertising tracking and no third-party marketing cookies are set. Clearing your browser data removes it.</p>

        <h2>10. Complaints</h2>
        <p>If you believe your data has been mishandled, contact us first. You retain the right to complain to the relevant Malawian data protection authority.</p>
      </article>
      <button class="quiet-btn" type="button" data-section="public">Return to the website</button>
    </section>
  `;
}

function renderTermsPage() {
  const updated = "25 July 2026";
  return `
    <section class="public-page-header legal-header">
      <p class="eyebrow">Legal</p>
      <h1>Terms of use</h1>
      <p>The conditions under which MACOKASA provides membership services, identity cards, and this online platform.</p>
      <small class="microcopy">Last updated ${updated}</small>
    </section>

    <section class="legal-body public-band">
      <article class="legal-article">
        <h2>1. Acceptance</h2>
        <p>By registering for membership or using this platform you agree to these terms. If you do not accept them, do not use the service.</p>

        <h2>2. Membership eligibility</h2>
        <p>Membership is open to pedal and motorcycle taxi operators, motorcycle owners, and affiliated stakeholders operating within Malawi. MACOKASA may decline or revoke membership where information supplied is false, where fees remain unpaid, or where conduct endangers passengers or the public.</p>

        <h2>3. Accuracy of information</h2>
        <p>You are responsible for the accuracy of the details you submit, including your name, district, contact number, and vehicle particulars. Notify MACOKASA promptly of any change.</p>

        <h2>4. Identity cards</h2>
        <p>A MACOKASA identity card remains the property of the Association. It confirms membership standing only; it is not a driving licence, roadworthiness certificate, or authorisation to operate issued by any public authority. Cards must not be altered, shared, or transferred. Report loss immediately so the QR token can be invalidated.</p>

        <h2>5. Fees and payments</h2>
        <p>Registration, renewal, and card fees are published on the registration page and may be revised with notice. Fees are payable via AirtelMoney, TNM Mpamba, bank transfer, or cash to an authorised collector who must issue a receipt. Payments are generally non-refundable once a card has been produced. MACOKASA does not collect bank card details through this platform.</p>

        <h2>6. Donations</h2>
        <p>Donations support road safety mobilisation, training subsidies, and cooperative activity. Donations are voluntary and non-refundable, and do not confer membership or governance rights.</p>

        <h2>7. Portal access</h2>
        <p>Staff, owner, printing, and administration accounts are issued to named individuals. You must not share credentials. All activity is attributed to your account and logged. Report suspected compromise immediately.</p>

        <h2>8. Acceptable use</h2>
        <p>You must not attempt to gain unauthorised access, interfere with the service, extract bulk member data, or upload unlawful or misleading content.</p>

        <h2>9. Service availability</h2>
        <p>The platform is provided on an "as available" basis. MACOKASA does not guarantee uninterrupted access and may suspend the service for maintenance.</p>

        <h2>10. Limitation of liability</h2>
        <p>MACOKASA is not liable for loss arising from a member's conduct on the road, from disputes between operators and owners, or from reliance on information that a member supplied inaccurately. Nothing in these terms excludes liability that cannot lawfully be excluded.</p>

        <h2>11. Governing law</h2>
        <p>These terms are governed by the laws of the Republic of Malawi.</p>

        <h2>12. Changes</h2>
        <p>We may update these terms. Continued use after publication of a revised version constitutes acceptance.</p>
      </article>
      <button class="quiet-btn" type="button" data-section="public">Return to the website</button>
    </section>
  `;
}
