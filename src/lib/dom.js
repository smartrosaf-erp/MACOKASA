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

/**
 * Read named controls from a form OR any container.
 *
 * Much of the interface groups fields in a div rather than a form, so
 * this must not depend on FormData, which throws on anything that is
 * not an HTMLFormElement.
 */
export function formData(root) {
  const out = {};
  if (!root) return out;

  const add = (key, value) => {
    if (!key) return;
    if (key in out) {
      out[key] = Array.isArray(out[key]) ? [...out[key], value] : [out[key], value];
    } else {
      out[key] = value;
    }
  };

  root.querySelectorAll("input[name], select[name], textarea[name]").forEach((el) => {
    if (el.disabled) return;
    if (el.type === "checkbox") {
      add(el.name, el.checked);
      return;
    }
    if (el.type === "radio") {
      if (el.checked) add(el.name, el.value);
      return;
    }
    if (el.type === "file") return;
    if (el.multiple && el.tagName === "SELECT") {
      add(el.name, [...el.selectedOptions].map((o) => o.value));
      return;
    }
    add(el.name, el.value);
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
