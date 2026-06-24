import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const config = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  paychanguPublicKey: process.env.PAYCHANGU_PUBLIC_KEY || "",
  useDemoData: !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://127.0.0.1:4177",
  portalPasswords: {
    staff: process.env.MACOKASA_STAFF_PASSWORD || "Macokasa@2026",
    owner: process.env.MACOKASA_OWNER_PASSWORD || "Owner@2026",
    printing: process.env.MACOKASA_PRINT_PASSWORD || "Print@2026"
  }
};

const output = `window.MACOKASA_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
writeFileSync(resolve("public", "config.js"), output);
mkdirSync(resolve("public", "src"), { recursive: true });
copyFileSync(resolve("src", "app.js"), resolve("public", "src", "app.js"));
copyFileSync(resolve("src", "data.js"), resolve("public", "src", "data.js"));
copyFileSync(resolve("src", "styles.css"), resolve("public", "src", "styles.css"));
console.log(`Wrote public/config.js for ${config.useDemoData ? "local" : "live"} records.`);
