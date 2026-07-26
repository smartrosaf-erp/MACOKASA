/**
 * Minimal DOM helpers.
 *
 * Everything user-supplied passes through esc(). Templates are built as
 * strings, so a single missed escape is an XSS hole — treat esc() as
 * mandatory, not optional.
 */

export function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function attr(value) {
  return esc(value);
}

export function html(strings, ...values) {
  return strings.reduce((out, str, i) => {
    const v = values[i];
    if (v === undefined || v === null || v === false) return out + str;
    if (Array.isArray(v)) return out + str + v.join("");
    return out + str + v;
  }, "");
}

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function formData(form) {
  const out = {};
  new FormData(form).forEach((value, key) => {
    if (key in out) {
      out[key] = Array.isArray(out[key]) ? [...out[key], value] : [out[key], value];
    } else {
      out[key] = value;
    }
  });
  return out;
}

/** Debounce for search inputs so we do not hammer the database. */
export function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}
