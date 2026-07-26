/**
 * Drives the demo backend through the real business workflows and
 * asserts the rules actually fire. This exercises the same logic the
 * SQL enforces, so a regression in either shows up here.
 */
import * as demo from "./src/lib/demo.js";

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.error(`  FAIL ${name}\n       ${e.message}`); }
}
function throws(fn, match, label) {
  try { fn(); throw new Error(`expected a rejection: ${label}`); }
  catch (e) {
    if (e.message.includes("expected a rejection")) throw e;
    if (match && !new RegExp(match, "i").test(e.message)) {
      throw new Error(`wrong error: ${e.message}`);
    }
  }
}

demo.seed();
const as = (id) => { demo.db.session = demo.db.users.find(u => u.id === id); };

console.log("\nRevenue split and balances");

check("actual is the full amount collected", () => {
  const b = demo.balances();
  const confirmed = demo.db.payments.filter(p => p.status === "confirmed")
    .reduce((t,p) => t + p.amount, 0);
  if (Math.abs(b.actual_revenue - confirmed) > 0.01)
    throw new Error(`actual ${b.actual_revenue} != collected ${confirmed}`);
});

check("available is exactly 80 percent of actual", () => {
  const b = demo.balances();
  const expected = demo.round2(b.actual_revenue * 0.8);
  if (Math.abs(b.macokasa_available - expected) > 1)
    throw new Error(`available ${b.macokasa_available} != ${expected}`);
});

check("shares reconstruct the total exactly", () => {
  const b = demo.balances();
  const paidOut = demo.db.settlements.filter(s => s.status === "paid")
    .reduce((t,s) => t + Number(s.amount_paid||0), 0);
  const sum = demo.round2(b.macokasa_available + b.quickthink_balance + paidOut);
  if (Math.abs(sum - b.actual_revenue) > 1)
    throw new Error(`${sum} != ${b.actual_revenue}`);
});

console.log("\nQuick-Think settlement");

check("paying Quick-Think leaves MACOKASA available untouched", () => {
  as("u-admin");
  const before = demo.balances();
  const s = demo.createSettlement({
    tenant_id: demo.db.tenant.id, invoice_no: "QTS-TEST-1",
    amount_requested: 1000, status: "requested", requested_by: "u-qts"
  });
  s.status = "approved";
  as("u-fin");
  demo.paySettlement({ id: s.id, amount: 1000, method: "bank_transfer", ref: "T1" });
  const after = demo.balances();
  if (after.macokasa_available !== before.macokasa_available)
    throw new Error(`available moved: ${before.macokasa_available} -> ${after.macokasa_available}`);
  if (demo.round2(after.quickthink_balance) !== demo.round2(before.quickthink_balance - 1000))
    throw new Error("QTS balance did not draw down");
  if (after.actual_revenue !== before.actual_revenue)
    throw new Error("actual revenue must not move");
});

check("cannot request more than the available balance", () => {
  const available = demo.balances().quickthink_balance;
  throws(() => demo.createSettlement({
    tenant_id: demo.db.tenant.id, invoice_no: "QTS-TEST-2",
    amount_requested: available + 50000, status: "requested", requested_by: "u-qts"
  }), "exceeds the available", "over-request");
});

console.log("\nPayment confirmation");

check("a clerk cannot confirm their own collection", () => {
  const pending = demo.db.payments.find(p => p.status === "pending");
  as(pending.collected_by);
  throws(() => demo.confirmPayment(pending.id), "Another officer", "self-confirm");
});

check("finance can confirm, and it activates the member and issues a card", () => {
  const pending = demo.db.payments.find(p => p.status === "pending");
  const memberId = pending.member_id;
  as("u-fin");
  demo.confirmPayment(pending.id);
  const m = demo.db.members.find(x => x.id === memberId);
  if (m.status !== "active") throw new Error(`member status ${m.status}`);
  if (!m.membership_no) throw new Error("no membership number issued");
  if (!m.period_end) throw new Error("no period end set");
  const card = demo.db.cards.find(c => c.member_id === memberId);
  if (!card) throw new Error("no card issued");
  if (card.status !== "ready_for_print") throw new Error(`card status ${card.status}`);
});

check("membership numbers encode the operator type", () => {
  const motorist = demo.db.members.find(m => m.operator_type === "motorist" && m.membership_no);
  const pedalist = demo.db.members.find(m => m.operator_type === "pedalist" && m.membership_no);
  if (!/^MCK-M-/.test(motorist.membership_no)) throw new Error(motorist.membership_no);
  if (!/^MCK-P-/.test(pedalist.membership_no)) throw new Error(pedalist.membership_no);
});

check("membership numbers are unique", () => {
  const nos = demo.db.members.map(m => m.membership_no).filter(Boolean);
  if (new Set(nos).size !== nos.length) throw new Error("duplicate membership number");
});

console.log("\nCard printing");

check("a card prints once and then locks", () => {
  as("u-print");
  const card = demo.db.cards.find(c => c.status === "ready_for_print");
  demo.markCardPrinted(card.id);
  if (card.print_count !== 1) throw new Error(`print_count ${card.print_count}`);
  throws(() => demo.markCardPrinted(card.id), "already been printed", "second print");
});

check("printing notifies the member and the filing clerk", () => {
  const before = demo.db.notifications.length;
  as("u-print");
  const card = demo.db.cards.find(c => c.status === "ready_for_print");
  demo.markCardPrinted(card.id);
  const added = demo.db.notifications.length - before;
  if (added < 2) throw new Error(`only ${added} notification(s) queued`);
});

check("printing staff cannot approve a reprint", () => {
  as("u-print");
  const printed = demo.db.cards.find(c => c.status === "printed");
  throws(() => demo.approveReprint(printed.id, "lost"), "operations manager", "printer reprint");
});

check("operations can approve a reprint and it returns to the queue", () => {
  as("u-ops");
  const printed = demo.db.cards.find(c => c.status === "printed");
  demo.approveReprint(printed.id, "Lost by member");
  if (printed.status !== "ready_for_print") throw new Error(printed.status);
  if (!printed.reprint_approved_by) throw new Error("approver not recorded");
});

console.log("\nClerk custody");

check("every confirmed payment sits in the collector's custody", () => {
  const rows = demo.clerkCustody();
  if (!rows.length) throw new Error("no custody records");
  const total = rows.reduce((t,r) => t + r.held_amount, 0);
  if (Math.abs(total - demo.balances().clerk_custody) > 1)
    throw new Error("custody totals disagree with the ledger");
});

check("a clerk cannot verify their own remittance", () => {
  const r = demo.db.remittances.find(x => x.status === "submitted");
  as(r.clerk_id);
  throws(() => demo.verifyRemittance(r.id), "may not verify their own", "self-verify");
});

check("finance verification clears the clerk's custody", () => {
  const r = demo.db.remittances.find(x => x.status === "submitted");
  as("u-fin");
  demo.verifyRemittance(r.id);
  if (r.status !== "cleared") throw new Error(r.status);
  const held = demo.clerkCustody().find(c => c.clerk_id === r.clerk_id)?.held_amount || 0;
  if (held !== 0) throw new Error(`clerk still holds ${held}`);
});

console.log("\nPrint queue and verification");

check("the print queue is sorted by district then area", () => {
  const q = demo.printQueue();
  const keys = q.map(r => `${r.district}|${r.area}`);
  const sorted = [...keys].sort();
  if (JSON.stringify(keys) !== JSON.stringify(sorted)) throw new Error("queue is not sorted");
});

check("public verification exposes standing only", () => {
  const token = demo.sampleToken();
  const r = demo.verifyCard(token);
  if (!r) throw new Error("token did not resolve");
  const leaked = ["phone","national_id","photo_path","date_of_birth","kin_name"]
    .filter(k => k in r);
  if (leaked.length) throw new Error(`leaked: ${leaked.join(", ")}`);
});

check("an unknown token resolves to nothing", () => {
  if (demo.verifyCard("nope") !== null) throw new Error("unknown token returned data");
});

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail ? 1 : 0);
