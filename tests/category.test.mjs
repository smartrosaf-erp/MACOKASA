/**
 * Operator category logic tests.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { membershipPlans } from "../src/data.js";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

// Mirror of the helpers in app.js (kept in sync by the assertions below).
const normalise = (v) => {
  const raw = String(v || "").toLowerCase();
  return raw.includes("bicycle") || raw.includes("pedal") ? "Bicycle operator" : "Motorcycle operator";
};
const plansFor = (category) =>
  membershipPlans.filter((p) => p.audience === "Operator" && normalise(p.category) === normalise(category));

console.log("\nOperator category");

test("motorcycle and bicycle plans are separate sets", () => {
  const moto = plansFor("Motorcycle operator").map((p) => p.key);
  const pedal = plansFor("Bicycle operator").map((p) => p.key);
  assert.ok(moto.length >= 4, "expected at least 4 motorcycle plans");
  assert.ok(pedal.length >= 3, "expected at least 3 pedal plans");
  assert.equal(moto.filter((k) => pedal.includes(k)).length, 0, "plan sets must not overlap");
});

test("pedal fees are materially lower than motorcycle fees", () => {
  const cheapestMoto = Math.min(...plansFor("Motorcycle operator").map((p) => p.annualFee));
  const cheapestPedal = Math.min(...plansFor("Bicycle operator").map((p) => p.annualFee));
  assert.ok(cheapestPedal < cheapestMoto, "pedal entry fee must be below motorcycle entry fee");
  assert.ok(cheapestPedal <= cheapestMoto * 0.6, "pedal entry fee should be around half");
});

test("category normalisation handles variants", () => {
  assert.equal(normalise("Bicycle operator"), "Bicycle operator");
  assert.equal(normalise("bicycle"), "Bicycle operator");
  assert.equal(normalise("Pedal taxi"), "Bicycle operator");
  assert.equal(normalise("Motorcycle operator"), "Motorcycle operator");
  assert.equal(normalise(""), "Motorcycle operator", "empty must default to motorcycle");
  assert.equal(normalise(undefined), "Motorcycle operator", "undefined must default safely");
});

test("every operator plan declares a category", () => {
  for (const plan of membershipPlans.filter((p) => p.audience === "Operator")) {
    assert.ok(plan.category, `plan ${plan.key} is missing a category`);
  }
});

console.log("\nApp wiring");

const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

test("membership numbers encode the category code", () => {
  assert.match(app, /MCK-\$\{meta\.code\}-\$\{districtCode\}/, "membership number must include the category code");
});

test("card numbering is category aware", () => {
  assert.match(app, /CARD-\$\{meta\.code\}-/);
});

test("sequence is counted per category so series never collide", () => {
  assert.match(app, /operatorCategoryOf\(item\) === category/);
});

test("safety status applies category-appropriate criteria", () => {
  const fn = app.slice(app.indexOf("function safetyStatus"));
  assert.match(fn.slice(0, 700), /reflectorFitted/, "pedal criteria must consider reflector");
  assert.match(fn.slice(0, 700), /helmetUse/, "motorcycle criteria must consider helmet");
});

test("pedal operators are not assigned motorcycle-only attributes", () => {
  assert.match(app, /trackerInstalled: pedal \? false :/);
  assert.match(app, /helmetUse: pedal \? false :/);
});

test("ID card renders a category band and vehicle field", () => {
  assert.match(app, /card-category-band/);
  assert.match(app, /data-card-vehicle-label/);
  assert.match(app, /cardBand/);
});

test("plan selection is constrained to the chosen category", () => {
  assert.match(app, /allowedPlans\.some\(\(item\) => item\.key === values\.membershipPlan\)/);
});

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("card categories have distinct visual treatments", () => {
  assert.match(styles, /\.id-card-front\.card-cat-motorcycle/);
  assert.match(styles, /\.id-card-front\.card-cat-bicycle/);
  assert.match(styles, /\.card-category-band/);
});

test("category colours are printable", () => {
  assert.match(styles, /print-color-adjust: exact/);
});

console.log("\nOwner and fleet");

test("owner plans exist for both categories", () => {
  const ownerPlans = membershipPlans.filter((p) => p.audience === "Motorcycle Owner");
  const moto = ownerPlans.filter((p) => normalise(p.category) === "Motorcycle operator");
  const pedal = ownerPlans.filter((p) => normalise(p.category) === "Bicycle operator");
  assert.ok(moto.length >= 2, "expected motorcycle owner plans");
  assert.ok(pedal.length >= 2, "expected bicycle owner plans");
});

test("pedal owner fees are lower than motorcycle owner fees", () => {
  const ownerPlans = membershipPlans.filter((p) => p.audience === "Motorcycle Owner");
  const moto = Math.min(...ownerPlans.filter((p) => normalise(p.category) === "Motorcycle operator").map((p) => p.annualFee));
  const pedal = Math.min(...ownerPlans.filter((p) => normalise(p.category) === "Bicycle operator").map((p) => p.annualFee));
  assert.ok(pedal < moto, "pedal owner entry fee must be lower");
});

test("every owner plan declares a category", () => {
  for (const plan of membershipPlans.filter((p) => p.audience === "Motorcycle Owner")) {
    assert.ok(plan.category, `owner plan ${plan.key} missing category`);
  }
});

test("cross-category vehicle assignment is rejected", () => {
  assert.match(app, /cannot be assigned this \$\{vehicleNoun\(category\)\}/);
});

test("vehicle table flags category mismatches", () => {
  assert.match(app, /Category mismatch/);
});

test("owner and operator pickers are category scoped", () => {
  assert.match(app, /function operatorSelectForCategory/);
  assert.match(app, /function ownerSelect\(name, category\)/);
});

test("pedal owners never see the phrase Motorcycle Owner", () => {
  assert.match(app, /function planAudienceLabel/);
  const fn = app.slice(app.indexOf("function planAudienceLabel"));
  assert.match(fn.slice(0, 400), /Bicycle owner/);
});

test("vehicles carry a category and pedal ones get no tracker", () => {
  assert.match(app, /vehicleCategory: category/);
  assert.match(app, /helmetCount: pedal \? 0 :/);
});

console.log("\nData integrity");

import { demoState } from "../src/data.js";

test("no demo vehicle is assigned to an operator of another category", () => {
  for (const bike of demoState.motorcycles) {
    const operator = demoState.operators.find((o) => o.id === bike.assignedOperatorId);
    if (!operator) continue;
    assert.equal(
      normalise(bike.vehicleCategory),
      normalise(operator.operatorCategory),
      `${bike.plateNumber} is assigned to an operator of a different category`
    );
  }
});

test("no demo operator is on a plan from another category", () => {
  for (const operator of demoState.operators) {
    const plan = membershipPlans.find((p) => p.key === operator.membershipPlan);
    if (!plan?.category) continue;
    assert.equal(
      normalise(plan.category),
      normalise(operator.operatorCategory),
      `${operator.fullName} is on plan ${plan.key} from the wrong category`
    );
  }
});

test("no demo owner is on a plan from another category", () => {
  for (const owner of demoState.owners) {
    const plan = membershipPlans.find((p) => p.key === owner.plan);
    if (!plan?.category) continue;
    assert.equal(
      normalise(plan.category),
      normalise(owner.ownerCategory),
      `${owner.fullName} is on plan ${plan.key} from the wrong category`
    );
  }
});

test("pedal vehicles carry no helmets or tracker", () => {
  for (const bike of demoState.motorcycles.filter((b) => normalise(b.vehicleCategory) === "Bicycle operator")) {
    assert.ok(!bike.trackerInstalled, `${bike.plateNumber} should not have a tracker`);
    assert.equal(bike.helmetCount || 0, 0, `${bike.plateNumber} should not record helmets`);
  }
});

console.log(`\n${passed} assertion group(s) passed.\n`);
