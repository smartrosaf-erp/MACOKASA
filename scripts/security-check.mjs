/**
 * Fails the build if a secret or a known-insecure pattern reaches the
 * client bundle. Run in CI on every push and pull request.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const failures = [];
const warn = [];

function fail(rule, detail) {
  failures.push(`${rule}: ${detail}`);
}

// --- 1. Client config must contain no secrets -------------------------
const configPath = resolve("public", "config.js");
if (!existsSync(configPath)) {
  fail("config", "public/config.js missing — run npm run build first");
} else {
  const raw = readFileSync(configPath, "utf8");
  // Strip comments so the file's own security banner is not flagged.
  const config = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const banned = [
    [/password/i, "the word 'password'"],
    [/service_role/i, "a service role reference"],
    [/portalPasswords/, "the legacy portalPasswords block"],
    [/secret/i, "the word 'secret'"],
    [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "a JWT that is not the anon key"]
  ];
  for (const [pattern, label] of banned) {
    if (pattern.test(config)) {
      // The anon key is an expected JWT; only flag it if it decodes as service_role.
      if (label.startsWith("a JWT")) {
        const match = config.match(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\./);
        if (match) {
          try {
            const body = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
            if (body.role && body.role !== "anon") {
              fail("config", `public/config.js contains a '${body.role}' key, not the anon key`);
            }
          } catch {
            /* not decodable, ignore */
          }
        }
        continue;
      }
      fail("config", `public/config.js contains ${label}`);
    }
  }
}

// --- 2. No raw card capture in the app -------------------------------
const appPath = resolve("src", "app.js");
const app = readFileSync(appPath, "utf8");
if (/data-card-field="number"/.test(app)) {
  fail("pci", "src/app.js renders a card number input — PCI-DSS violation");
}
if (/placeholder="123"[^>]*>\s*<\/label>/.test(app) && /CVV/i.test(app)) {
  const cvvInput = /<span>CVV<\/span><input/.test(app);
  if (cvvInput) fail("pci", "src/app.js renders a CVV input — PCI-DSS violation");
}

// --- 3. Schema must not grant anon blanket access --------------------
const schemaPath = resolve("supabase", "schema.sql");
if (existsSync(schemaPath)) {
  const schema = readFileSync(schemaPath, "utf8");
  const anonSelect = /on\s+public\.macokasa_records\s+for\s+select[\s\S]{0,120}?to\s+[^;]*\banon\b/i;
  if (anonSelect.test(schema)) {
    fail("rls", "schema.sql grants anon SELECT on macokasa_records");
  }
  if (/using\s*\(\s*true\s*\)[\s\S]{0,40}macokasa_records/i.test(schema)) {
    warn.push("schema.sql contains a using(true) policy — verify it is intentional");
  }
  if (/'member-photos',\s*true/.test(schema)) {
    fail("storage", "member-photos bucket is public — must be private");
  }
}

// --- 4. Secrets must not be committed --------------------------------
if (existsSync(resolve(".env"))) {
  fail("env", ".env is present in the repository tree");
}

// --- Report ----------------------------------------------------------
for (const message of warn) console.warn(`  warn  ${message}`);

if (failures.length) {
  console.error("\nSECURITY CHECK FAILED\n");
  for (const message of failures) console.error(`  fail  ${message}`);
  console.error("");
  process.exit(1);
}

console.log("Security check passed: no secrets or insecure patterns detected.");
