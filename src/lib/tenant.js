/**
 * Tenant tailoring.
 *
 * Applies a tenant's branding, vocabulary and field rules at run time,
 * so one build serves every client. Nothing here may branch on which
 * tenant is signed in — that would be a fork wearing a disguise.
 */

const DEFAULT_BRANDING = {
  displayName: "Operations Platform",
  shortName: "Platform",
  tagline: "",
  logoUrl: "./assets/macokasa-logo.png",
  primary: "#0a5236",
  accent: "#c8901c",
  ink: "#0c1512"
};

let branding = { ...DEFAULT_BRANDING };
let terms = new Map();
let fields = new Map();     // `${entity}.${field}` -> config
let customFields = new Map(); // entity -> [definitions]
let workflows = new Map();

/* ---------------- Branding ---------------- */

export function applyBranding(tenant) {
  branding = { ...DEFAULT_BRANDING, ...(tenant?.branding || {}) };
  if (tenant?.name && !tenant.branding?.displayName) branding.displayName = tenant.name;

  const root = document.documentElement;
  // Only override when the tenant actually specified a value, so the
  // shipped design stays intact for tenants that configure nothing.
  if (branding.primary) {
    root.style.setProperty("--forest", branding.primary);
    root.style.setProperty("--green", branding.primary);
  }
  if (branding.accent) {
    root.style.setProperty("--sun", branding.accent);
    root.style.setProperty("--gold", branding.accent);
  }
  if (branding.ink) {
    root.style.setProperty("--ink", branding.ink);
    root.style.setProperty("--navy", branding.ink);
  }

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta && branding.ink) themeMeta.setAttribute("content", branding.ink);

  return branding;
}

export function brand(key) {
  return branding[key] ?? DEFAULT_BRANDING[key] ?? "";
}

export function brandAll() {
  return { ...branding };
}

/* ---------------- Terminology ---------------- */

export function loadTerms(rows = []) {
  terms = new Map(rows.map((r) => [r.term_key, { one: r.singular, many: r.plural }]));
}

/**
 * The tenant's word for something.
 *   t("member")            -> "member"
 *   t("member", true)      -> "members"
 *   t("member", false, true) -> "Member"
 */
export function t(key, plural = false, capitalise = false) {
  const entry = terms.get(key);
  const word = entry ? (plural ? entry.many : entry.one) : plural ? `${key}s` : key;
  return capitalise ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/** Title case, for headings. */
export function T(key, plural = false) {
  return t(key, plural, true);
}

/* ---------------- Field configuration ---------------- */

export function loadFieldConfig(rows = []) {
  fields = new Map(rows.map((r) => [`${r.entity}.${r.field_key}`, r]));
}

export function fieldVisibility(entity, key) {
  return fields.get(`${entity}.${key}`)?.visibility || "optional";
}

export function fieldHidden(entity, key) {
  return fieldVisibility(entity, key) === "hidden";
}

export function fieldRequired(entity, key) {
  return fieldVisibility(entity, key) === "required";
}

export function fieldReadonly(entity, key) {
  return fieldVisibility(entity, key) === "readonly";
}

export function fieldLabel(entity, key, fallback) {
  return fields.get(`${entity}.${key}`)?.label || fallback;
}

export function fieldHelp(entity, key) {
  return fields.get(`${entity}.${key}`)?.help_text || "";
}

/* ---------------- Custom fields ---------------- */

export function loadCustomFields(rows = []) {
  customFields = new Map();
  for (const row of rows) {
    if (!customFields.has(row.entity)) customFields.set(row.entity, []);
    customFields.get(row.entity).push(row);
  }
  for (const list of customFields.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }
}

export function customFieldsFor(entity) {
  return customFields.get(entity) || [];
}

/** Validate submitted custom values against their definitions. */
export function validateCustom(entity, values = {}) {
  for (const def of customFieldsFor(entity)) {
    const raw = values[def.field_key];
    const empty = raw === undefined || raw === null || String(raw).trim() === "";

    if (def.required && empty) return `${def.label} is required.`;
    if (empty) continue;

    if (def.data_type === "number" && Number.isNaN(Number(raw))) {
      return `${def.label} must be a number.`;
    }
    if (def.data_type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(raw))) {
      return `${def.label} must be a valid email address.`;
    }
    if (def.data_type === "date" && Number.isNaN(new Date(raw).getTime())) {
      return `${def.label} must be a valid date.`;
    }
    if (def.data_type === "select") {
      const options = Array.isArray(def.options) ? def.options : [];
      if (options.length && !options.includes(raw)) {
        return `${def.label} must be one of the configured options.`;
      }
    }
  }
  return null;
}

/** Coerce values to their declared type before saving. */
export function coerceCustom(entity, values = {}) {
  const out = {};
  for (const def of customFieldsFor(entity)) {
    const raw = values[def.field_key];
    if (raw === undefined || raw === null || String(raw).trim() === "") continue;
    switch (def.data_type) {
      case "number":
        out[def.field_key] = Number(raw);
        break;
      case "boolean":
        out[def.field_key] = raw === true || raw === "true" || raw === "on";
        break;
      case "multiselect":
        out[def.field_key] = Array.isArray(raw) ? raw : [raw];
        break;
      default:
        out[def.field_key] = String(raw).trim();
    }
  }
  return out;
}

/* ---------------- Workflow ---------------- */

export function loadWorkflows(rows = []) {
  workflows = new Map(rows.map((r) => [r.process_key, r.config || {}]));
}

export function workflow(processKey, fallback = {}) {
  return { ...fallback, ...(workflows.get(processKey) || {}) };
}

export function workflowFlag(processKey, key, fallback = false) {
  const config = workflows.get(processKey);
  if (!config || config[key] === undefined) return fallback;
  return config[key];
}

/* ---------------- Reset ---------------- */

export function resetTenantConfig() {
  branding = { ...DEFAULT_BRANDING };
  terms = new Map();
  fields = new Map();
  customFields = new Map();
  workflows = new Map();
  const root = document.documentElement;
  ["--forest", "--green", "--sun", "--gold", "--ink", "--navy"].forEach((v) =>
    root.style.removeProperty(v)
  );
}
