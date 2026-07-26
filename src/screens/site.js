/**
 * Public website.
 *
 * MACOKASA's outward face: what the association is, what membership
 * gives you, what it costs, and how to verify a card. The operations
 * platform lives behind a staff sign-in and is never advertised here
 * beyond a single discreet link.
 */

import { esc, html } from "../lib/dom.js";
import { icon } from "../ui/icons.js";
import { money } from "../lib/format.js";

const DISTRICTS = [
  "Blantyre", "Lilongwe", "Mzuzu", "Zomba", "Mangochi", "Kasungu",
  "Karonga", "Thyolo", "Salima", "Dedza", "Nkhotakota", "Mulanje"
];

const FAQS = [
  [
    "Who can join MACOKASA?",
    "Any pedal or motorcycle taxi operator working in Malawi, and any person who owns bicycles or motorcycles and rents them out to operators. You may be both — one person is one membership."
  ],
  [
    "How do I register?",
    "Registration is done in person by a MACOKASA clerk at your rank or district office. Bring your national ID if you have one, and your phone. The clerk captures your details, takes your photograph, and reads everything back to you before saving."
  ],
  [
    "What if I cannot pay on the day?",
    "You are still registered. Your record is saved as awaiting payment and kept on file. When you return with the fee, any clerk can find you by name, phone number or national ID and complete the membership."
  ],
  [
    "When do I get my card?",
    "Once your payment is confirmed by the finance office, your card enters the print queue. Cards are printed in batches and sorted by district and rank, then returned to the clerk who registered you. You receive an SMS when your card has been printed."
  ],
  [
    "I lost my card. What happens?",
    "Report it to your rank chairperson or the nearest MACOKASA office immediately so the QR code can be cancelled. A replacement must be authorised by the operations manager and carries a replacement fee."
  ],
  [
    "How does a passenger check my card?",
    "They scan the QR code with any phone camera. It shows your name, membership number, district and whether your membership is current. It shows nothing else — not your phone number, not your ID number, not your address."
  ]
];

export function renderSite({ tiers = [], onVerify } = {}) {
  return html`
    <div class="site">
      ${header()}
      <main id="main">
        ${hero()}
        ${marquee()}
        ${whatWeDo()}
        ${howItWorks()}
        ${forOwners()}
        ${pricing(tiers)}
        ${verifySection()}
        ${faq()}
      </main>
      ${footer()}
    </div>
  `;
}

/* ---------------- Header ---------------- */

function header() {
  return html`
    <header class="site-head" data-site-head>
      <div class="wrap">
        <a class="logo" href="#top" data-nav="top">
          <img src="./assets/macokasa-logo.png" alt="" />
          <span>
            <b>MACOKASA</b>
            <span>Kabaza Stakeholders</span>
          </span>
        </a>

        <nav class="site-nav" data-site-nav aria-label="Main">
          <a href="#what" data-nav="what">What we do</a>
          <a href="#how" data-nav="how">Joining</a>
          <a href="#owners" data-nav="owners">For owners</a>
          <a href="#fees" data-nav="fees">Fees</a>
          <a href="#verify" data-nav="verify">Verify a card</a>
        </nav>

        <div class="site-head-cta">
          <button class="btn btn-ghost btn-sm" type="button" data-open-portal>
            ${icon("shield")} Staff portal
          </button>
          <button class="btn btn-primary btn-sm" type="button" data-nav="how">Join MACOKASA</button>
          <button class="btn btn-ghost btn-icon burger" type="button" data-burger aria-label="Menu">
            ${icon("menu")}
          </button>
        </div>
      </div>
    </header>
  `;
}

/* ---------------- Hero ---------------- */

function hero() {
  return html`
    <section class="hero" id="top">
      <div class="wrap hero-grid">
        <div>
          <p class="eyebrow">Malawi Coalition for Kabaza Stakeholders</p>
          <h1>
            Every Kabaza rider on <em>one register</em>.
          </h1>
          <p class="hero-lede">
            MACOKASA registers pedal and motorcycle taxi operators across Malawi, issues verified
            identity cards, and gives owners a proper way to run their fleet. Safer roads, trusted
            riders, and a trade that can finally be counted.
          </p>

          <div class="hero-actions">
            <button class="btn btn-primary btn-lg" type="button" data-nav="how">
              How to join ${icon("arrowRight")}
            </button>
            <button class="btn btn-ghost btn-lg" type="button" data-nav="verify">
              ${icon("qr")} Verify a card
            </button>
          </div>

          <div class="hero-trust">
            <div><strong>2</strong><span>Operator types</span></div>
            <div><strong>28</strong><span>Districts covered</span></div>
            <div><strong>1 year</strong><span>Membership term</span></div>
            <div><strong>QR</strong><span>Public verification</span></div>
          </div>
        </div>

        <div class="hero-art" data-reveal>
          <div class="hero-photo">
            <img src="./assets/macokasa-rider-training.jpg"
                 alt="Kabaza operators at a road safety training session" />
          </div>
          <span class="hero-badge">Registration open</span>
          <div class="hero-chip">
            <span class="tick">${icon("check")}</span>
            <span>
              <b>Verified member</b>
              <span>MCK-M-BT-2026-0142</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function marquee() {
  const items = [...DISTRICTS, ...DISTRICTS];
  return html`
    <div class="marquee" aria-hidden="true">
      <div class="marquee-track">
        ${items.map((d) => `<span>${esc(d)}</span>`).join("")}
      </div>
    </div>
  `;
}

/* ---------------- What we do ---------------- */

function whatWeDo() {
  const items = [
    ["users", "", "A national register", "Every pedal and motorcycle taxi operator recorded once, with district, rank, and the vehicle they ride. No duplicates, no guesswork."],
    ["card", "sun", "Verified identity cards", "A card a passenger, a police officer or a rank marshal can check in seconds by scanning the QR code."],
    ["shield", "sky", "Safety and standards", "Helmets, reflectors, licences and training records tracked against every member, so compliance is visible rather than assumed."],
    ["motorcycle", "", "Fleet management for owners", "Owners see their vehicles, who is riding each one, on what terms, and how each agreement is performing."],
    ["wallet", "sun", "Accountable money", "Every kwacha collected is recorded against the clerk who took it, until it is banked and reconciled by finance."],
    ["chart", "crimson", "Evidence for advocacy", "Real numbers on the size and shape of the Kabaza trade, so MACOKASA can speak for its members with authority."]
  ];

  return html`
    <section class="section tinted" id="what">
      <div class="wrap">
        <div class="section-head">
          <p class="eyebrow">What MACOKASA does</p>
          <h2>The association behind the trade.</h2>
          <p>
            Kabaza moves Malawi. MACOKASA exists to organise it — so operators are recognised,
            passengers are safe, and the people who depend on this work can be counted.
          </p>
        </div>

        <div class="cards">
          ${items
            .map(
              ([ico, tone, title, body], i) => html`
                <article class="card ${tone}" data-reveal style="transition-delay:${i * 60}ms">
                  <span class="card-ico">${icon(ico)}</span>
                  <h3>${esc(title)}</h3>
                  <p>${esc(body)}</p>
                </article>
              `
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

/* ---------------- How to join ---------------- */

function howItWorks() {
  const steps = [
    ["Find a MACOKASA clerk", "Clerks work from district offices and major ranks. Bring your national ID if you have one, and the phone number you actually use."],
    ["Give your details", "The clerk records your name, district, rank and vehicle, then takes your photograph. Everything is read back to you before it is saved."],
    ["Pay when you can", "Pay on the day, or come back later. If you cannot pay now, you are still registered and kept on file as awaiting payment."],
    ["Collect your card", "Once finance confirms your payment your card is printed and sent to the clerk who registered you. You get an SMS when it is ready."]
  ];

  return html`
    <section class="section" id="how">
      <div class="wrap split">
        <div>
          <p class="eyebrow">Joining MACOKASA</p>
          <h2 class="section-head" style="margin-bottom:0">
            <span style="display:block;font-family:var(--display);font-size:var(--t-3xl);font-weight:600;letter-spacing:-0.03em;margin-top:16px">
              Four steps, done face to face.
            </span>
          </h2>
          <p style="margin-top:16px;color:var(--slate);max-width:52ch">
            There is no website form and no app to download. Registration happens in person, with a
            clerk, because that is how this trade actually works.
          </p>

          <ol class="steps-list">
            ${steps
              .map(
                ([title, body]) => html`
                  <li>
                    <div>
                      <strong>${esc(title)}</strong>
                      <p>${esc(body)}</p>
                    </div>
                  </li>
                `
              )
              .join("")}
          </ol>
        </div>

        <div class="split-media" data-reveal>
          <img src="./assets/macokasa-road-safety-training.jpg"
               alt="MACOKASA clerk registering an operator at a district rank" />
        </div>
      </div>
    </section>
  `;
}

/* ---------------- Owners ---------------- */

function forOwners() {
  const points = [
    ["Know your fleet", "Every bicycle or motorcycle you own, recorded with its plate or frame identification, condition and safety kit."],
    ["Know your riders", "See exactly who is on each vehicle, on what agreement, and since when. Ending or reassigning is a single action."],
    ["Source trusted operators", "Choose from MACOKASA-verified members with current membership — not whoever turns up at the rank."],
    ["Keep the record straight", "Agreements, targets and hire amounts held in one place, so disputes have an answer."]
  ];

  return html`
    <section class="section dark" id="owners">
      <div class="wrap">
        <div class="section-head">
          <p class="eyebrow">For vehicle owners</p>
          <h2>You bought the bike. Run it like a business.</h2>
          <p>
            Most Kabaza vehicles are rented out. MACOKASA membership gives owners a real tool for
            managing that — and access to riders the association has actually verified.
          </p>
        </div>

        <div class="cards">
          ${points
            .map(
              ([title, body], i) => html`
                <article class="card" data-reveal style="transition-delay:${i * 60}ms">
                  <span class="card-ico">${icon("checkCircle")}</span>
                  <h3>${esc(title)}</h3>
                  <p>${esc(body)}</p>
                </article>
              `
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

/* ---------------- Pricing ---------------- */

function pricing(tiers) {
  const motorist = tiers.filter((t) => t.operator_type === "motorist");
  const pedalist = tiers.filter((t) => t.operator_type === "pedalist");

  return html`
    <section class="section tinted" id="fees">
      <div class="wrap">
        <div class="section-head centred">
          <p class="eyebrow">Membership fees</p>
          <h2>Priced for the trade, not against it.</h2>
          <p>
            Pedal operators pay roughly half what motorcycle operators pay, because they earn
            roughly half. Fees are reviewed by MACOKASA as conditions change.
          </p>
        </div>

        <div style="display:grid;justify-items:center">
          <div class="tier-toggle" role="tablist" aria-label="Operator type">
            <button type="button" class="on" data-tier-tab="motorist" role="tab" aria-selected="true">
              ${icon("motorcycle")} Motorcycle
            </button>
            <button type="button" data-tier-tab="pedalist" role="tab" aria-selected="false">
              ${icon("bicycle")} Bicycle
            </button>
          </div>
        </div>

        <div class="tiers" data-tier-panel="motorist">${tierCards(motorist)}</div>
        <div class="tiers" data-tier-panel="pedalist" hidden>${tierCards(pedalist)}</div>

        <p class="tier-note">
          Fees shown are the current annual registration rate and include the identity card.
          Renewal is charged at a lower rate. Ask your clerk for the exact figure on the day.
        </p>
      </div>
    </section>
  `;
}

function tierCards(tiers) {
  if (!tiers.length) {
    return `<div class="empty">${icon("inbox")}<strong>Fees are being updated</strong><span>Ask your district clerk for current rates.</span></div>`;
  }
  return tiers
    .map(
      (t, i) => html`
        <article class="tier ${i === 2 ? "featured" : ""}" data-reveal style="transition-delay:${i * 60}ms">
          ${i === 2 ? `<span class="tier-flag">Most chosen</span>` : ""}
          <h3>${esc(t.name)}</h3>
          <div class="tier-price">
            ${money(t.fee, { withSymbol: false })}
            <small>MWK per year, card included</small>
          </div>
          <ul>
            ${(t.benefits || [])
              .map((b) => `<li>${icon("check")}<span>${esc(b)}</span></li>`)
              .join("")}
          </ul>
        </article>
      `
    )
    .join("");
}

/* ---------------- Verify ---------------- */

function verifySection() {
  return html`
    <section class="section" id="verify">
      <div class="wrap">
        <div class="verify-strip" data-reveal>
          <div>
            <h2>Check a card in seconds.</h2>
            <p>
              Scan the QR code on any MACOKASA card with your phone camera, or type the card number
              below. You will see whether the membership is current — and nothing private about the
              member.
            </p>
          </div>
          <form class="verify-form" data-verify-form>
            <input type="text" name="token" placeholder="Card or QR reference"
                   aria-label="Card reference" autocomplete="off" />
            <button class="btn btn-primary" type="submit">${icon("search")} Verify</button>
          </form>
        </div>
      </div>
    </section>
  `;
}

/* ---------------- FAQ ---------------- */

function faq() {
  return html`
    <section class="section tinted">
      <div class="wrap">
        <div class="section-head centred">
          <p class="eyebrow">Questions</p>
          <h2>Things people ask us.</h2>
        </div>
        <div class="faq">
          ${FAQS.map(
            ([q, a]) => html`
              <details>
                <summary>${esc(q)}</summary>
                <div class="answer">${esc(a)}</div>
              </details>
            `
          ).join("")}
        </div>
      </div>
    </section>
  `;
}

/* ---------------- Footer ---------------- */

function footer() {
  const year = new Date().getFullYear();
  return html`
    <footer class="site-foot">
      <div class="wrap">
        <div class="foot-grid">
          <div class="foot-brand">
            <b>MACOKASA</b>
            <p>
              Malawi Coalition for Kabaza Stakeholders Association. Organising pedal and motorcycle
              taxi operators for safer roads and stronger livelihoods.
            </p>
          </div>

          <div class="foot-col">
            <h4>Association</h4>
            <button type="button" data-nav="what">What we do</button>
            <button type="button" data-nav="how">How to join</button>
            <button type="button" data-nav="owners">For owners</button>
            <button type="button" data-nav="fees">Membership fees</button>
          </div>

          <div class="foot-col">
            <h4>Members</h4>
            <button type="button" data-nav="verify">Verify a card</button>
            <button type="button" data-nav="how">Renew membership</button>
            <button type="button" data-nav="verify">Report a lost card</button>
          </div>

          <div class="foot-col">
            <h4>Staff</h4>
            <button type="button" data-open-portal>Operations portal</button>
          </div>
        </div>

        <div class="foot-base">
          <span>&copy; ${year} MACOKASA. All rights reserved.</span>
          <span class="spacer"></span>
          <span>Built by Quick-Think Solution</span>
        </div>
      </div>
    </footer>
  `;
}

/* ---------------- Behaviour ---------------- */

export function bindSite(root, { onVerify, onPortal }) {
  // Sticky header state
  const head = root.querySelector("[data-site-head]");
  const onScroll = () => head?.classList.toggle("stuck", window.scrollY > 12);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Reveal on scroll
  const targets = root.querySelectorAll("[data-reveal]");
  if (targets.length && "IntersectionObserver" in window &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("shown");
          io.unobserve(e.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 }
    );
    targets.forEach((t) => io.observe(t));
  } else {
    targets.forEach((t) => t.classList.add("shown"));
  }

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-open-portal]")) {
      onPortal?.();
      return;
    }

    if (event.target.closest("[data-burger]")) {
      root.querySelector("[data-site-nav]")?.classList.toggle("open");
      return;
    }

    const nav = event.target.closest("[data-nav]");
    if (nav) {
      event.preventDefault();
      const id = nav.dataset.nav;
      root.querySelector("[data-site-nav]")?.classList.remove("open");
      const el = id === "top" ? root : document.getElementById(id);
      el?.scrollIntoView({ behavior: "smooth", block: id === "top" ? "start" : "start" });
      return;
    }

    const tab = event.target.closest("[data-tier-tab]");
    if (tab) {
      const which = tab.dataset.tierTab;
      root.querySelectorAll("[data-tier-tab]").forEach((b) => {
        const on = b.dataset.tierTab === which;
        b.classList.toggle("on", on);
        b.setAttribute("aria-selected", String(on));
      });
      root.querySelectorAll("[data-tier-panel]").forEach((p) => {
        p.hidden = p.dataset.tierPanel !== which;
      });
    }
  });

  root.querySelector("[data-verify-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = new FormData(event.target).get("token");
    if (value && String(value).trim()) onVerify?.(String(value).trim());
  });
}
