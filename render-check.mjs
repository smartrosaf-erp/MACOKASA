/**
 * Boots the real application in jsdom and asserts an entry path renders.
 * Catches broken imports and template errors that syntax checking cannot see.
 *
 * Each scenario runs in its own process because src/lib/api.js captures
 * window.MACOKASA_CONFIG at module load, and ES modules are cached.
 *
 *   node render-check.mjs <scenario>
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const SCENARIOS = {
  unconfigured: {
    config: { supabaseUrl: "", supabaseAnonKey: "", publicBaseUrl: "__origin__" },
    url: "http://127.0.0.1:4177/",
    expect: "Configuration needed",
    label: "renders the configuration notice when no database is set"
  },
  signin: {
    config: { supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "anon", publicBaseUrl: "__origin__" },
    url: "http://127.0.0.1:4177/",
    expect: "Staff sign in",
    label: "renders the sign-in screen when configured"
  }
};

const key = process.argv[2];
const scenario = SCENARIOS[key];
if (!scenario) {
  console.error(`Unknown scenario. Use one of: ${Object.keys(SCENARIOS).join(", ")}`);
  process.exit(2);
}

const dom = new JSDOM(readFileSync("public/index.html", "utf8"), {
  url: scenario.url,
  runScripts: "outside-only",
  pretendToBeVisual: true
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.HTMLElement = window.HTMLElement;
global.FormData = window.FormData;
global.Image = window.Image;
window.MACOKASA_CONFIG = scenario.config;
window.requestAnimationFrame = (cb) => setTimeout(cb, 0);

const errors = [];
window.addEventListener("error", (e) => errors.push(e.message));
process.on("unhandledRejection", (e) => errors.push(String(e)));

await import("./src/app.js");
await new Promise((r) => setTimeout(r, 600));

const app = window.document.querySelector("#app");
const text = app.textContent.replace(/\s+/g, " ").trim();
const rendered = app.innerHTML.length > 400;
const matched = text.includes(scenario.expect);
const clean = errors.length === 0;

if (rendered && matched && clean) {
  console.log(`  ok   ${scenario.label}`);
  process.exit(0);
}

console.error(`  FAIL ${scenario.label}`);
console.error(`       length=${app.innerHTML.length} errors=${JSON.stringify(errors)}`);
console.error(`       expected "${scenario.expect}" in: ${text.slice(0, 220)}`);
process.exit(1);
