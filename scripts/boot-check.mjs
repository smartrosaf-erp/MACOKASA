/** Runs each jsdom boot scenario in an isolated process. */
import { execFileSync } from "node:child_process";

const scenarios = ["unconfigured", "signin"];
let failed = 0;

console.log("\nApplication boot");
for (const s of scenarios) {
  try {
    const out = execFileSync(process.execPath, ["render-check.mjs", s], { stdio: "pipe" });
    process.stdout.write(out.toString());
  } catch (error) {
    failed++;
    process.stdout.write(error.stdout?.toString() || "");
    process.stderr.write(error.stderr?.toString().split("\n").slice(0, 4).join("\n") + "\n");
  }
}

console.log(failed ? `\n${failed} boot check(s) failed.\n` : "\nAll boot checks passed.\n");
process.exit(failed ? 1 : 0);
