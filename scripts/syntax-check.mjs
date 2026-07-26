/** Syntax-check every JavaScript file in the project. */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const roots = ["src", "scripts", "tests"];
let count = 0;
let failed = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith(".js") || path.endsWith(".mjs")) {
      count++;
      try {
        execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
      } catch (error) {
        failed++;
        console.error(`  FAIL ${path}\n${error.stderr?.toString().split("\n").slice(0, 4).join("\n")}`);
      }
    }
  }
}

roots.forEach(walk);
console.log(`[check] ${count - failed}/${count} files valid.`);
process.exit(failed ? 1 : 0);
