/**
 * Formatting helpers. Currency and locale come from tenant settings,
 * never hardcoded, so a future tenant in another country works unchanged.
 */

let currency = "MWK";
let locale = "en-MW";

export function configureFormatting({ currency: c, locale: l } = {}) {
  if (c) currency = c;
  if (l) locale = l;
}

export function money(value, { withSymbol = true } = {}) {
  const n = Number(value || 0);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(n);
  return withSymbol ? `${currency} ${formatted}` : formatted;
}

/**
 * Currency for display at large sizes: the symbol is set small and
 * muted so the numeral carries the weight, as in financial dashboards.
 */
export function moneyRich(value) {
  const n = Number(value || 0);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(n);
  return `<span class="cur">${currency}</span>${formatted}`;
}

export function number(value) {
  return new Intl.NumberFormat(locale).format(Number(value || 0));
}

export function compact(value) {
  const n = Number(value || 0);
  if (n < 1000) return String(n);
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function date(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function relativeDays(value) {
  if (!value) return null;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const days = Math.ceil((target - new Date()) / 86400000);
  return days;
}

export function initials(first = "", last = "") {
  return `${String(first).charAt(0)}${String(last).charAt(0)}`.toUpperCase() || "??";
}

export function fullName(member) {
  if (!member) return "";
  return [member.first_name, member.other_names, member.last_name].filter(Boolean).join(" ");
}

/** Malawi mobile numbers. Accepts local and international forms. */
export function normalisePhone(input) {
  const digits = String(input || "").replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+265")) return digits;
  if (digits.startsWith("265")) return `+${digits}`;
  if (digits.startsWith("0")) return `+265${digits.slice(1)}`;
  return digits;
}

export function isValidPhone(input) {
  const n = normalisePhone(input);
  return /^\+265[189]\d{8}$/.test(n);
}
