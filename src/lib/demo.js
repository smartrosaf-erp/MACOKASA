/**
 * Demonstration backend.
 *
 * An in-browser implementation of the same data contract as the Supabase
 * layer, enforcing the same business rules: the revenue split, clerk
 * custody, print-once, separation of duties, settlement caps.
 *
 * This exists so the whole product can be explored and reviewed without
 * a database. It is NOT a security boundary and never touches real data.
 * Everything lives in memory and resets on reload.
 */

const uid = (p = "id") => `${p}-${Math.random().toString(36).slice(2, 10)}`;
const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
const round2 = (n) => Math.round(n * 100) / 100;

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/* ---------------- Store ---------------- */

export const db = {
  tenant: null,
  users: [],
  settings: {},
  modules: new Set(),
  districts: [],
  areas: [],
  packages: [],
  fees: [],
  benefits: [],
  members: [],
  memberships: [],
  payments: [],
  cards: [],
  vehicles: [],
  assignments: [],
  ledger: [],
  accounts: [],
  custody: [],
  remittances: [],
  settlements: [],
  expenses: [],
  notifications: [],
  session: null,
  seq: { rct: 0, rmt: 0, qts: 0, exp: 0, card: 0, member: {} }
};

/* ---------------- Reference data ---------------- */

const DISTRICTS = [
  ["Blantyre", "BT", "Southern"],
  ["Lilongwe", "LL", "Central"],
  ["Mzuzu", "MZ", "Northern"],
  ["Zomba", "ZA", "Southern"],
  ["Mangochi", "MG", "Southern"],
  ["Kasungu", "KU", "Central"],
  ["Karonga", "KA", "Northern"],
  ["Thyolo", "TH", "Southern"]
];

const AREAS = {
  BT: ["Limbe Rank", "Chichiri", "Ndirande", "Bangwe", "Chilomoni"],
  LL: ["Area 25 Rank", "Old Town", "Kawale", "Biwi", "Lumbadzi"],
  MZ: ["Mzuzu Main Rank", "Katoto", "Chibavi"],
  ZA: ["Zomba Central", "Chinamwali", "Sadzi"],
  MG: ["Mangochi Boma", "Monkey Bay"],
  KU: ["Kasungu Boma", "Chulu"],
  KA: ["Karonga Boma", "Chilumba"],
  TH: ["Thyolo Boma", "Luchenza"]
};

const PACKAGES = [
  ["REG-M", "Regular", "operator", "motorist", 1, "#0f4a76", 15000, 12000, 10000],
  ["SIL-M", "Silver", "operator", "motorist", 2, "#8a94a6", 30000, 24000, 10000],
  ["GLD-M", "Gold", "operator", "motorist", 3, "#d4a017", 55000, 44000, 10000],
  ["PLT-M", "Platinum", "operator", "motorist", 4, "#2b2f36", 90000, 72000, 10000],
  ["REG-P", "Regular", "operator", "pedalist", 1, "#0aa2c0", 7500, 6000, 10000],
  ["SIL-P", "Silver", "operator", "pedalist", 2, "#7cc4d6", 15000, 12000, 10000],
  ["GLD-P", "Gold", "operator", "pedalist", 3, "#f0a500", 27500, 22000, 10000],
  ["PLT-P", "Platinum", "operator", "pedalist", 4, "#1f4b57", 45000, 36000, 10000],
  ["OWN-B", "Owner Basic", "owner", null, 1, "#0f766e", 45000, 36000, 10000],
  ["OWN-F", "Owner Fleet", "owner", null, 2, "#134e4a", 120000, 96000, 10000]
];

const BENEFITS = {
  "REG-M": ["National membership record", "Annual renewal reminders", "Public QR verification"],
  "SIL-M": ["All Regular benefits", "Priority card production", "Safety compliance badge"],
  "GLD-M": ["All Silver benefits", "Reduced refresher training fees", "Complaints resolution support"],
  "PLT-M": ["All Gold benefits", "Tracker installation eligibility", "Fleet owner priority matching"],
  "REG-P": ["National membership record", "Annual renewal reminders", "Public QR verification"],
  "SIL-P": ["All Regular benefits", "Priority card production", "Reflector and safety kit"],
  "GLD-P": ["All Silver benefits", "Road safety refresher priority", "Cooperative loan eligibility"],
  "PLT-P": ["All Gold benefits", "Rank leadership standing", "Complaints resolution support"],
  "OWN-B": ["Owner portal", "Vehicle mapping", "Operator agreement records"],
  "OWN-F": ["All Owner Basic benefits", "Multi-vehicle dashboard", "Operator behaviour notifications"]
};

const FIRST_M = ["Joseph", "Madalitso", "Chikondi", "Blessings", "Yamikani", "Thokozani", "Limbani", "Chimwemwe", "Frank", "Isaac", "Peter", "Gift", "Wongani", "Alinafe"];
const FIRST_F = ["Grace", "Chisomo", "Tadala", "Mphatso", "Takondwa", "Ellen", "Fatsani", "Rejoice", "Tiyamike", "Loveness"];
const LAST = ["Banda", "Phiri", "Mwale", "Nkhoma", "Chirwa", "Gondwe", "Kachala", "Mhango", "Zimba", "Kamanga", "Jere", "Msiska", "Tembo", "Chirambo", "Kaunda"];

const STAFF = [
  { id: "u-admin", full_name: "Ruth Mbewe", role: "tenant_admin", email: "admin@macokasa.org" },
  { id: "u-ops", full_name: "Daniel Kaunda", role: "operations", email: "operations@macokasa.org" },
  { id: "u-fin", full_name: "Esther Nyirenda", role: "finance", email: "finance@macokasa.org" },
  { id: "u-clerk1", full_name: "Patrick Mvula", role: "clerk", email: "clerk@macokasa.org", district: "Blantyre" },
  { id: "u-clerk2", full_name: "Agnes Chatha", role: "clerk", email: "clerk2@macokasa.org", district: "Lilongwe" },
  { id: "u-print", full_name: "Samuel Nyasulu", role: "printing", email: "printing@macokasa.org" },
  { id: "u-qts", full_name: "Quick-Think Solution", role: "platform_admin", email: "billing@quickthinks.com" }
];

/* ---------------- Seed ---------------- */

let rnd = 42;
function random() {
  rnd = (rnd * 1103515245 + 12345) % 2147483648;
  return rnd / 2147483648;
}
const pick = (arr) => arr[Math.floor(random() * arr.length)];
const between = (a, b) => a + Math.floor(random() * (b - a + 1));

export function seed() {
  db.tenant = {
    id: "t-macokasa",
    slug: "macokasa",
    name: "MACOKASA",
    status: "active",
    currency: "MWK",
    locale: "en-MW",
    branding: {},
    settings: {}
  };

  db.users = STAFF.map((s) => ({ ...s, tenant_id: db.tenant.id, is_active: true, phone: null }));

  db.settings = {
    revenue_split: { macokasa: 0.8, quickthink: 0.2 },
    membership_term_months: 12,
    require_photo_on_registration: true,
    allow_clerk_self_confirm_payment: false,
    notification_channels: ["in_app"]
  };

  db.modules = new Set(["members", "registration", "cards", "finance", "fleet", "packages", "reports", "settings"]);

  db.districts = DISTRICTS.map(([name, code, region]) => ({
    id: `d-${code}`,
    tenant_id: db.tenant.id,
    name,
    code,
    region,
    is_active: true
  }));

  db.areas = [];
  for (const [code, names] of Object.entries(AREAS)) {
    names.forEach((name, i) =>
      db.areas.push({
        id: `a-${code}-${i}`,
        tenant_id: db.tenant.id,
        district_id: `d-${code}`,
        name,
        rank_name: name,
        is_active: true
      })
    );
  }

  db.packages = PACKAGES.map(([code, name, applies, type, rank, colour]) => ({
    id: `p-${code}`,
    tenant_id: db.tenant.id,
    code,
    name,
    applies_to: applies,
    operator_type: type,
    rank,
    colour,
    is_active: true
  }));

  db.fees = [];
  PACKAGES.forEach(([code, , , , , , reg, ren, card]) => {
    db.fees.push(
      { id: uid("f"), package_id: `p-${code}`, fee_type: "registration", amount: reg, currency: "MWK", effective_from: "2026-01-01", effective_to: null },
      { id: uid("f"), package_id: `p-${code}`, fee_type: "renewal", amount: ren, currency: "MWK", effective_from: "2026-01-01", effective_to: null },
      { id: uid("f"), package_id: `p-${code}`, fee_type: "card", amount: card, currency: "MWK", effective_from: "2026-01-01", effective_to: null },
      { id: uid("f"), package_id: `p-${code}`, fee_type: "replacement", amount: 15000, currency: "MWK", effective_from: "2026-01-01", effective_to: null }
    );
  });

  db.benefits = [];
  Object.entries(BENEFITS).forEach(([code, list]) =>
    list.forEach((benefit, i) =>
      db.benefits.push({ id: uid("b"), package_id: `p-${code}`, benefit, detail: null, sort_order: i + 1, is_active: true })
    )
  );

  db.accounts = [
    ["REV-MEMBERSHIP", "Membership revenue (gross)", "revenue", "macokasa"],
    ["SHARE-MACOKASA", "MACOKASA share", "share", "macokasa"],
    ["SHARE-QTS", "Quick-Think share", "share", "quickthink"],
    ["QTS-SETTLEMENT", "Quick-Think settlements paid", "share", "quickthink"],
    ["MACOKASA-DRAW", "MACOKASA withdrawals", "bank", "macokasa"],
    ["CUSTODY-CLERK", "Clerk cash custody", "custody", "clerk"],
    ["CUSTODY-REMIT", "Clerk remittances", "custody", "clerk"],
    ["EXP-PLATFORM-FEE", "Platform fee expense", "expense", "macokasa"],
    ["EXP-GENERAL", "General expenses", "expense", "macokasa"]
  ].map(([code, name, kind, party]) => ({ id: `acc-${code}`, tenant_id: db.tenant.id, code, name, kind, party }));

  seedMembers();
  seedFleet();
  seedFinanceExtras();
}

function nextMembershipNo(type, districtCode) {
  const key = `${type}-${districtCode}`;
  db.seq.member[key] = (db.seq.member[key] || 0) + 1;
  const letter = type === "motorist" ? "M" : "P";
  return `MCK-${letter}-${districtCode}-2026-${String(db.seq.member[key]).padStart(4, "0")}`;
}

function seedMembers() {
  const clerks = ["u-clerk1", "u-clerk2"];
  const total = 64;

  for (let i = 0; i < total; i++) {
    const isFemale = random() < 0.22;
    const type = random() < 0.72 ? "motorist" : "pedalist";
    const district = pick(db.districts);
    const areas = db.areas.filter((a) => a.district_id === district.id);
    const area = pick(areas);
    const clerk = pick(clerks);

    const isOwner = random() < 0.18;
    const isOperator = !isOwner || random() < 0.5;

    const pkgPool = db.packages.filter((p) =>
      isOwner && !isOperator ? p.applies_to === "owner" : p.applies_to === "operator" && p.operator_type === type
    );
    const pkg = pick(pkgPool);

    // Distribution: mostly active, some pending, a few lapsed.
    const roll = random();
    const status = roll < 0.72 ? "active" : roll < 0.9 ? "pending_payment" : "lapsed";

    const createdDaysAgo = between(1, 300);
    const first = isFemale ? pick(FIRST_F) : pick(FIRST_M);
    const member = {
      id: uid("m"),
      tenant_id: db.tenant.id,
      membership_no: status === "pending_payment" ? null : nextMembershipNo(type, district.code),
      first_name: first,
      last_name: pick(LAST),
      other_names: null,
      sex: isFemale ? "female" : "male",
      date_of_birth: `19${between(70, 99)}-${String(between(1, 12)).padStart(2, "0")}-${String(between(1, 28)).padStart(2, "0")}`,
      national_id: `MW-${district.code}-${String(between(100000, 999999))}`,
      phone: `+2659${between(1, 9)}${String(between(1000000, 9999999))}`,
      alt_phone: null,
      email: null,
      is_operator: isOperator,
      is_owner: isOwner,
      operator_type: type,
      district_id: district.id,
      area_id: area?.id || null,
      physical_address: null,
      kin_name: `${pick(FIRST_F)} ${pick(LAST)}`,
      kin_phone: `+2658${between(1, 9)}${String(between(1000000, 9999999))}`,
      kin_relationship: pick(["Spouse", "Parent", "Sibling", "Guardian"]),
      has_licence: type === "motorist" ? random() < 0.68 : random() < 0.4,
      licence_no: type === "motorist" ? `DL-${district.code}-${between(10000, 99999)}` : null,
      licence_expiry: null,
      training_ref: type === "pedalist" ? `TRN-${between(1000, 9999)}` : null,
      photo_path: null,
      photo_captured_at: null,
      package_id: pkg.id,
      status,
      joined_on: status === "pending_payment" ? null : daysAgo(createdDaysAgo).slice(0, 10),
      period_start: status === "pending_payment" ? null : daysAgo(createdDaysAgo).slice(0, 10),
      period_end:
        status === "pending_payment"
          ? null
          : status === "lapsed"
            ? daysAgo(between(1, 60)).slice(0, 10)
            : addMonths(daysAgo(createdDaysAgo).slice(0, 10), 12),
      registered_by: clerk,
      notes: null,
      created_at: daysAgo(createdDaysAgo)
    };
    db.members.push(member);

    const regFee = feeAmount(pkg.id, "registration");
    const cardFee = feeAmount(pkg.id, "card");

    const membership = {
      id: uid("ms"),
      tenant_id: db.tenant.id,
      member_id: member.id,
      package_id: pkg.id,
      kind: "registration",
      period_start: member.period_start || today(),
      period_end: member.period_end || addMonths(today(), 12),
      fee_amount: regFee,
      card_fee: cardFee,
      currency: "MWK",
      status: status === "pending_payment" ? "pending_payment" : "paid",
      paid_at: status === "pending_payment" ? null : daysAgo(createdDaysAgo),
      created_at: daysAgo(createdDaysAgo)
    };
    db.memberships.push(membership);

    if (status !== "pending_payment") {
      // Confirmed payment: ledger, custody, card.
      const method = pick(["cash", "cash", "airtel_money", "mpamba", "bank_transfer"]);
      db.seq.rct++;
      const payment = {
        id: uid("pay"),
        tenant_id: db.tenant.id,
        receipt_no: `RCT-2026-${String(db.seq.rct).padStart(5, "0")}`,
        member_id: member.id,
        membership_id: membership.id,
        purpose: "registration",
        method,
        amount: regFee + cardFee,
        currency: "MWK",
        collected_by: clerk,
        collected_at: daysAgo(createdDaysAgo),
        status: "confirmed",
        confirmed_by: "u-fin",
        confirmed_at: daysAgo(createdDaysAgo - 1 > 0 ? createdDaysAgo - 1 : 0),
        provider_ref: null,
        payer_phone: member.phone,
        notes: null,
        created_at: daysAgo(createdDaysAgo)
      };
      db.payments.push(payment);
      postToLedger(payment, { settle: createdDaysAgo > 30 });

      db.seq.card++;
      const printed = random() < 0.75;
      db.cards.push({
        id: uid("card"),
        tenant_id: db.tenant.id,
        member_id: member.id,
        membership_id: membership.id,
        card_no: `CRD-${type === "motorist" ? "M" : "P"}-2026-${String(db.seq.card).padStart(5, "0")}`,
        operator_type: type,
        design_variant: type,
        qr_token: uid("qr") + uid(""),
        status: printed ? "printed" : "ready_for_print",
        print_count: printed ? 1 : 0,
        printed_at: printed ? daysAgo(createdDaysAgo - 2 > 0 ? createdDaysAgo - 2 : 0) : null,
        printed_by: printed ? "u-print" : null,
        dispatch_to_clerk: clerk,
        dispatch_district_id: district.id,
        dispatch_area_id: area?.id || null,
        dispatched_at: null,
        collected_at: null,
        expires_on: member.period_end,
        reprint_reason: null,
        created_at: daysAgo(createdDaysAgo)
      });
    }
  }

  // A few unconfirmed payments so Finance has something to action.
  const pendingMembers = db.members.filter((m) => m.status === "pending_payment").slice(0, 3);
  pendingMembers.forEach((m) => {
    const ms = db.memberships.find((x) => x.member_id === m.id);
    db.seq.rct++;
    db.payments.push({
      id: uid("pay"),
      tenant_id: db.tenant.id,
      receipt_no: `RCT-2026-${String(db.seq.rct).padStart(5, "0")}`,
      member_id: m.id,
      membership_id: ms.id,
      purpose: "registration",
      method: "cash",
      amount: Number(ms.fee_amount) + Number(ms.card_fee),
      currency: "MWK",
      collected_by: "u-clerk1",
      collected_at: daysAgo(1),
      status: "pending",
      confirmed_by: null,
      confirmed_at: null,
      provider_ref: null,
      payer_phone: m.phone,
      notes: null,
      created_at: daysAgo(1)
    });
  });
}

function seedFleet() {
  const owners = db.members.filter((m) => m.is_owner);
  owners.forEach((owner) => {
    const count = between(1, 3);
    for (let i = 0; i < count; i++) {
      const type = owner.operator_type;
      const district = db.districts.find((d) => d.id === owner.district_id);
      const vehicle = {
        id: uid("v"),
        tenant_id: db.tenant.id,
        owner_member_id: owner.id,
        vehicle_type: type,
        identifier:
          type === "motorist"
            ? `${district.code} ${between(1000, 9999)}`
            : `BIC-${district.code}-${between(1000, 9999)}`,
        make: type === "motorist" ? pick(["Bajaj Boxer", "TVS HLX", "Honda ACE", "Yamaha Crux"]) : pick(["Roadmaster", "Humber", "Phoenix"]),
        model: null,
        year_of_make: between(2015, 2025),
        colour: pick(["Black", "Red", "Blue", "Silver"]),
        has_tracker: type === "motorist" && random() < 0.25,
        helmet_count: type === "motorist" ? between(1, 2) : 0,
        has_reflector: type === "pedalist" ? random() < 0.8 : false,
        condition: pick(["Good", "Fair", "Excellent"]),
        is_active: true,
        created_at: daysAgo(between(10, 200))
      };
      db.vehicles.push(vehicle);

      // Assign roughly two thirds to an active operator of the same type.
      if (random() < 0.66) {
        const candidates = db.members.filter(
          (m) => m.is_operator && m.operator_type === type && m.status === "active" && m.id !== owner.id
        );
        const operator = pick(candidates);
        if (operator) {
          db.assignments.push({
            id: uid("as"),
            tenant_id: db.tenant.id,
            vehicle_id: vehicle.id,
            operator_member_id: operator.id,
            agreement_type: type === "motorist" ? pick(["daily_target", "monthly_hire"]) : "daily_target",
            agreed_amount: type === "motorist" ? between(5, 9) * 1000 : between(1, 2) * 1000,
            starts_on: daysAgo(between(5, 120)).slice(0, 10),
            ends_on: null,
            status: "active",
            notes: null,
            _operator_name: `${operator.first_name} ${operator.last_name}`
          });
        }
      }
    }
  });
}

function seedFinanceExtras() {
  // One cleared remittance and one awaiting verification.
  db.seq.rmt++;
  db.remittances.push({
    id: uid("rmt"),
    tenant_id: db.tenant.id,
    reference: `RMT-2026-${String(db.seq.rmt).padStart(5, "0")}`,
    clerk_id: "u-clerk2",
    declared_amount: 120000,
    expected_amount: 120000,
    variance: 0,
    method: "bank_transfer",
    deposit_ref: "NBM-88213",
    status: "cleared",
    submitted_at: daysAgo(9),
    verified_by: "u-fin",
    verified_at: daysAgo(8),
    notes: null
  });

  const held = clerkHeld("u-clerk1");
  if (held > 0) {
    db.seq.rmt++;
    db.remittances.push({
      id: uid("rmt"),
      tenant_id: db.tenant.id,
      reference: `RMT-2026-${String(db.seq.rmt).padStart(5, "0")}`,
      clerk_id: "u-clerk1",
      declared_amount: round2(held * 0.6),
      expected_amount: held,
      variance: round2(held * 0.6 - held),
      method: "cash",
      deposit_ref: null,
      status: "submitted",
      submitted_at: daysAgo(1),
      verified_by: null,
      verified_at: null,
      notes: "Balance to follow tomorrow."
    });
  }

  // A paid settlement and one awaiting approval.
  db.seq.qts++;
  const paidAmount = 180000;
  db.settlements.push({
    id: uid("stl"),
    tenant_id: db.tenant.id,
    invoice_no: `QTS-2026-${String(db.seq.qts).padStart(5, "0")}`,
    period_start: daysAgo(60).slice(0, 10),
    period_end: daysAgo(30).slice(0, 10),
    amount_requested: paidAmount,
    amount_available_at_request: paidAmount + 40000,
    amount_paid: paidAmount,
    currency: "MWK",
    status: "paid",
    requested_by: "u-qts",
    requested_at: daysAgo(28),
    approved_by: "u-admin",
    approved_at: daysAgo(27),
    paid_by: "u-fin",
    paid_at: daysAgo(25),
    payment_method: "bank_transfer",
    payment_ref: "NBM-77120",
    rejection_reason: null,
    notes: "Platform fee, previous period."
  });

  const grp = uid("g");
  db.ledger.push(
    entry(grp, "QTS-SETTLEMENT", "quickthink", -paidAmount, `Settlement paid, invoice QTS-2026-00001`, daysAgo(25)),
    entry(grp, "EXP-PLATFORM-FEE", "macokasa", -paidAmount, `Platform fee expense, invoice QTS-2026-00001`, daysAgo(25))
  );

  db.seq.qts++;
  const available = balances().quickthink_balance;
  if (available > 1000) {
    db.settlements.push({
      id: uid("stl"),
      tenant_id: db.tenant.id,
      invoice_no: `QTS-2026-${String(db.seq.qts).padStart(5, "0")}`,
      period_start: daysAgo(29).slice(0, 10),
      period_end: today(),
      amount_requested: round2(available * 0.7),
      amount_available_at_request: available,
      amount_paid: null,
      currency: "MWK",
      status: "requested",
      requested_by: "u-qts",
      requested_at: daysAgo(2),
      approved_by: null,
      approved_at: null,
      paid_by: null,
      paid_at: null,
      payment_method: null,
      payment_ref: null,
      rejection_reason: null,
      notes: "Platform fee for the current period."
    });
  }

  [
    ["Card production", "Blank card stock, 500 units", 145000, 12],
    ["Transport", "District mobilisation, Southern region", 68000, 20],
    ["Stationery", "Receipt books and printer ribbon", 32000, 34]
  ].forEach(([category, description, amount, ago]) => {
    db.seq.exp++;
    db.expenses.push({
      id: uid("exp"),
      tenant_id: db.tenant.id,
      reference: `EXP-2026-${String(db.seq.exp).padStart(5, "0")}`,
      category,
      description,
      amount,
      currency: "MWK",
      incurred_on: daysAgo(ago).slice(0, 10),
      method: "bank_transfer",
      payee: null,
      status: "recorded",
      recorded_by: "u-fin",
      created_at: daysAgo(ago)
    });
  });

  db.notifications.push(
    {
      id: uid("n"),
      channel: "sms",
      recipient: "+265991234567",
      subject: "ID card printed",
      body: "MACOKASA: Your motorcycle operator ID card has been printed and is being sent to Limbe Rank for collection.",
      status: "queued",
      created_at: daysAgo(1),
      sent_at: null
    },
    {
      id: uid("n"),
      channel: "in_app",
      recipient: "clerk@macokasa.org",
      subject: "Card ready for dispatch",
      body: "3 cards are printed and assigned to you for dispatch.",
      status: "queued",
      created_at: daysAgo(1),
      sent_at: null
    }
  );
}

/* ---------------- Business rules ---------------- */

function entry(group, code, party, amount, description, occurredAt, extra = {}) {
  return {
    id: db.ledger.length + 1,
    tenant_id: db.tenant.id,
    entry_group: group,
    account_id: `acc-${code}`,
    code,
    party,
    amount,
    description,
    occurred_at: occurredAt || nowIso(),
    ...extra
  };
}

export function feeAmount(packageId, feeType) {
  const f = db.fees.find((x) => x.package_id === packageId && x.fee_type === feeType && !x.effective_to);
  return f ? Number(f.amount) : 0;
}

/**
 * Mirrors post_payment_to_ledger(). The Quick-Think share is rounded and
 * MACOKASA takes the remainder, so the two always reconstruct the total.
 */
export function postToLedger(payment, { settle = false } = {}) {
  if (db.ledger.some((l) => l.payment_id === payment.id)) return;
  const group = uid("g");
  const split = db.settings.revenue_split || { macokasa: 0.8, quickthink: 0.2 };
  const splittable = ["registration", "renewal"].includes(payment.purpose);
  const qts = splittable ? round2(payment.amount * split.quickthink) : 0;
  const mck = round2(payment.amount - qts);

  db.ledger.push(
    entry(group, "REV-MEMBERSHIP", "macokasa", payment.amount, `Revenue: ${payment.purpose} receipt ${payment.receipt_no}`, payment.collected_at, { payment_id: payment.id }),
    entry(group, "SHARE-MACOKASA", "macokasa", mck, `MACOKASA share of ${payment.receipt_no}`, payment.collected_at, { payment_id: payment.id }),
    entry(group, "CUSTODY-CLERK", "clerk", payment.amount, `Custody: ${payment.receipt_no}`, payment.collected_at, { payment_id: payment.id, clerk_id: payment.collected_by })
  );
  if (qts > 0) {
    db.ledger.push(entry(group, "SHARE-QTS", "quickthink", qts, `Quick-Think share of ${payment.receipt_no}`, payment.collected_at, { payment_id: payment.id }));
  }

  db.custody.push({
    id: uid("cus"),
    tenant_id: db.tenant.id,
    clerk_id: payment.collected_by,
    payment_id: payment.id,
    amount: payment.amount,
    status: "held",
    created_at: payment.collected_at
  });

  // Older collections are treated as already remitted and reconciled.
  if (settle) {
    const rec = db.custody[db.custody.length - 1];
    rec.status = "reconciled";
    db.ledger.push(
      entry(uid("g"), "CUSTODY-REMIT", "clerk", -payment.amount, `Remittance verified`, payment.collected_at, { clerk_id: payment.collected_by })
    );
  }
}

function sumCodes(codes) {
  return round2(db.ledger.filter((l) => codes.includes(l.code)).reduce((t, l) => t + l.amount, 0));
}

export function balances() {
  return {
    tenant_id: db.tenant.id,
    actual_revenue: sumCodes(["REV-MEMBERSHIP"]),
    macokasa_available: sumCodes(["SHARE-MACOKASA", "MACOKASA-DRAW"]),
    quickthink_balance: sumCodes(["SHARE-QTS", "QTS-SETTLEMENT"]),
    clerk_custody: sumCodes(["CUSTODY-CLERK", "CUSTODY-REMIT"])
  };
}

function clerkHeld(clerkId) {
  return round2(
    db.custody.filter((c) => c.clerk_id === clerkId && c.status === "held").reduce((t, c) => t + c.amount, 0)
  );
}

export function clerkCustody() {
  const clerks = [...new Set(db.custody.map((c) => c.clerk_id))];
  return clerks.map((id) => {
    const rows = db.custody.filter((c) => c.clerk_id === id);
    const held = rows.filter((c) => c.status === "held");
    return {
      tenant_id: db.tenant.id,
      clerk_id: id,
      clerk_name: db.users.find((u) => u.id === id)?.full_name || "Unknown",
      held_count: held.length,
      held_amount: round2(held.reduce((t, c) => t + c.amount, 0)),
      remitted_amount: round2(rows.filter((c) => c.status === "remitted").reduce((t, c) => t + c.amount, 0)),
      reconciled_amount: round2(rows.filter((c) => c.status === "reconciled").reduce((t, c) => t + c.amount, 0)),
      oldest_held_at: held.length ? held.map((h) => h.created_at).sort()[0] : null
    };
  });
}

/** Mirrors confirm_payment(): ledger, membership, card, all at once. */
export function confirmPayment(paymentId) {
  const pay = db.payments.find((p) => p.id === paymentId);
  if (!pay) throw new Error("Payment not found.");
  if (pay.status === "confirmed") return;

  if (pay.collected_by === db.session.id && !db.settings.allow_clerk_self_confirm_payment) {
    throw new Error("You collected this payment. Another officer must confirm it.");
  }

  pay.status = "confirmed";
  pay.confirmed_by = db.session.id;
  pay.confirmed_at = nowIso();
  postToLedger(pay);

  const ms = db.memberships.find((m) => m.id === pay.membership_id);
  if (!ms) return;
  const member = db.members.find((m) => m.id === ms.member_id);
  const term = Number(db.settings.membership_term_months || 12);

  ms.status = "paid";
  ms.paid_at = nowIso();

  const district = db.districts.find((d) => d.id === member.district_id);
  member.status = "active";
  member.package_id = ms.package_id;
  member.joined_on = member.joined_on || today();
  member.period_start = today();
  member.period_end = addMonths(today(), term);
  if (!member.membership_no) {
    member.membership_no = nextMembershipNo(member.operator_type, district?.code || "XX");
  }

  let card = db.cards.find((c) => c.membership_id === ms.id && c.status !== "void");
  if (!card) {
    db.seq.card++;
    card = {
      id: uid("card"),
      tenant_id: db.tenant.id,
      member_id: member.id,
      membership_id: ms.id,
      card_no: `CRD-${member.operator_type === "motorist" ? "M" : "P"}-2026-${String(db.seq.card).padStart(5, "0")}`,
      operator_type: member.operator_type,
      design_variant: member.operator_type,
      qr_token: uid("qr") + uid(""),
      status: "ready_for_print",
      print_count: 0,
      printed_at: null,
      printed_by: null,
      dispatch_to_clerk: member.registered_by,
      dispatch_district_id: member.district_id,
      dispatch_area_id: member.area_id,
      dispatched_at: null,
      collected_at: null,
      expires_on: member.period_end,
      reprint_reason: null,
      created_at: nowIso()
    };
    db.cards.push(card);
  } else {
    card.status = "ready_for_print";
  }
}

/** Mirrors the print-once trigger. */
export function markCardPrinted(cardId) {
  const card = db.cards.find((c) => c.id === cardId);
  if (!card) throw new Error("Card not found.");
  if (card.status === "printed") {
    throw new Error(`Card ${card.card_no} has already been printed. A reprint must be approved by operations.`);
  }
  if (card.print_count >= 1 && !card.reprint_approved_by) {
    throw new Error(`Reprint of card ${card.card_no} requires operations approval.`);
  }
  const ms = db.memberships.find((m) => m.id === card.membership_id);
  if (ms && ms.status !== "paid") {
    throw new Error(`Card ${card.card_no} cannot be printed before the membership fee is paid.`);
  }

  card.status = "printed";
  card.print_count += 1;
  card.printed_at = nowIso();
  card.printed_by = db.session.id;

  const member = db.members.find((m) => m.id === card.member_id);
  const area = db.areas.find((a) => a.id === member.area_id);
  db.notifications.unshift({
    id: uid("n"),
    channel: "sms",
    recipient: member.phone,
    subject: "ID card printed",
    body: `MACOKASA: Your ${member.operator_type === "motorist" ? "motorcycle" : "pedal"} operator ID card (${member.membership_no}) has been printed and is being sent to ${area?.name || "your area"} for collection.`,
    status: "queued",
    created_at: nowIso(),
    sent_at: null
  });
  if (card.dispatch_to_clerk) {
    db.notifications.unshift({
      id: uid("n"),
      channel: "in_app",
      recipient: db.users.find((u) => u.id === card.dispatch_to_clerk)?.email || "clerk",
      subject: "Card ready for dispatch",
      body: `Card ${card.card_no} for ${member.first_name} ${member.last_name} is printed and assigned to you for dispatch.`,
      status: "queued",
      created_at: nowIso(),
      sent_at: null
    });
  }
}

export function approveReprint(cardId, reason) {
  if (!["platform_admin", "tenant_admin", "operations"].includes(db.session.role)) {
    throw new Error("Only the operations manager may approve a reprint.");
  }
  const card = db.cards.find((c) => c.id === cardId);
  card.status = "ready_for_print";
  card.reprint_reason = reason;
  card.reprint_approved_by = db.session.id;
  card.reprint_approved_at = nowIso();
}

export function verifyRemittance(id) {
  const r = db.remittances.find((x) => x.id === id);
  if (!r) throw new Error("Remittance not found.");
  if (r.clerk_id === db.session.id) throw new Error("A clerk may not verify their own remittance.");
  if (!["platform_admin", "tenant_admin", "finance"].includes(db.session.role)) {
    throw new Error("Only finance may verify a remittance.");
  }

  db.ledger.push(
    entry(uid("g"), "CUSTODY-REMIT", "clerk", -r.declared_amount, `Remittance ${r.reference} verified`, nowIso(), {
      clerk_id: r.clerk_id
    })
  );
  db.custody
    .filter((c) => c.clerk_id === r.clerk_id && ["held", "remitted"].includes(c.status))
    .forEach((c) => {
      c.status = "reconciled";
      c.remittance_id = r.id;
    });
  r.status = "cleared";
  r.verified_by = db.session.id;
  r.verified_at = nowIso();
}

export function paySettlement({ id, amount, method, ref }) {
  const s = db.settlements.find((x) => x.id === id);
  if (!s) throw new Error("Settlement not found.");
  if (s.status !== "approved") throw new Error("Settlement must be approved before payment.");
  if (amount <= 0 || amount > s.amount_requested) {
    throw new Error("Payment must be positive and no more than the requested amount.");
  }
  const group = uid("g");
  db.ledger.push(
    entry(group, "QTS-SETTLEMENT", "quickthink", -amount, `Settlement paid, invoice ${s.invoice_no}`),
    entry(group, "EXP-PLATFORM-FEE", "macokasa", -amount, `Platform fee expense, invoice ${s.invoice_no}`)
  );
  s.status = "paid";
  s.amount_paid = amount;
  s.paid_at = nowIso();
  s.paid_by = db.session.id;
  s.payment_method = method;
  s.payment_ref = ref;
}

export function createSettlement(payload) {
  const available = balances().quickthink_balance;
  if (payload.amount_requested > available) {
    throw new Error(
      `Requested ${payload.amount_requested} exceeds the available Quick-Think balance of ${available}.`
    );
  }
  const row = {
    id: uid("stl"),
    ...payload,
    amount_available_at_request: available,
    amount_paid: null,
    requested_at: nowIso(),
    approved_by: null,
    approved_at: null,
    paid_at: null,
    payment_ref: null,
    rejection_reason: null
  };
  db.settlements.unshift(row);
  return row;
}

/* ---------------- Print queue ---------------- */

export function printQueue() {
  return db.cards
    .filter((c) => ["ready_for_print", "queued", "printing"].includes(c.status))
    .map((c) => {
      const m = db.members.find((x) => x.id === c.member_id);
      const d = db.districts.find((x) => x.id === c.dispatch_district_id);
      const a = db.areas.find((x) => x.id === c.dispatch_area_id);
      const clerk = db.users.find((u) => u.id === c.dispatch_to_clerk);
      const pkg = db.packages.find((p) => p.id === m?.package_id);
      return {
        card_id: c.id,
        tenant_id: c.tenant_id,
        card_no: c.card_no,
        operator_type: c.operator_type,
        status: c.status,
        membership_no: m?.membership_no,
        member_name: `${m?.first_name} ${m?.last_name}`,
        district: d?.name,
        district_id: d?.id,
        area: a?.name,
        area_id: a?.id,
        dispatch_to_clerk: c.dispatch_to_clerk,
        clerk_name: clerk?.full_name,
        package_name: pkg?.name,
        print_count: c.print_count,
        created_at: c.created_at
      };
    })
    .sort(
      (x, y) =>
        String(x.district).localeCompare(String(y.district)) ||
        String(x.area).localeCompare(String(y.area)) ||
        String(x.member_name).localeCompare(String(y.member_name))
    );
}

/* ---------------- Verification ---------------- */

export function verifyCard(token) {
  const card = db.cards.find((c) => c.qr_token === token);
  if (!card) return null;
  const m = db.members.find((x) => x.id === card.member_id);
  const pkg = db.packages.find((p) => p.id === m.package_id);
  const d = db.districts.find((x) => x.id === m.district_id);
  return {
    valid: m.status === "active" && (!m.period_end || m.period_end >= today()),
    member_name: `${m.first_name} ${m.last_name}`,
    membership_no: m.membership_no,
    operator_type: m.operator_type,
    package_name: pkg?.name,
    district: d?.name,
    status: m.status,
    expires_on: m.period_end
  };
}

/** A token that always resolves, so the demo verification link works. */
export function sampleToken() {
  const printed = db.cards.find((c) => c.status === "printed");
  return printed?.qr_token || db.cards[0]?.qr_token || "";
}

export { uid, today, nowIso, round2, addMonths };
