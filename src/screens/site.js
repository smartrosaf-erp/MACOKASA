/**
 * Public website — multi-page.
 *
 * Each header link opens a distinct page with its own URL, title and
 * scroll position. Nothing is a jump-link into a long scroller.
 *
 * Tone: an established national association. Restrained, institutional,
 * confident. Not a startup landing page.
 */

import { esc, html } from "../lib/dom.js";
import { icon } from "../ui/icons.js";
import { money } from "../lib/format.js";

export const PAGES = ["home", "about", "membership", "owners", "fees", "verify", "contact"];

const PAGE_META = {
  home: { label: "Home", title: "MACOKASA — Malawi Coalition for Kabaza Stakeholders Association" },
  about: { label: "About", title: "About the Association — MACOKASA" },
  membership: { label: "Membership", title: "Membership — MACOKASA" },
  owners: { label: "Vehicle Owners", title: "For Vehicle Owners — MACOKASA" },
  fees: { label: "Fees", title: "Membership Fees — MACOKASA" },
  verify: { label: "Verify a Card", title: "Verify a Card — MACOKASA" },
  contact: { label: "Contact", title: "Contact — MACOKASA" }
};

const NAV = ["about", "membership", "owners", "fees", "verify", "contact"];

export function pageTitle(page) {
  return PAGE_META[page]?.title || PAGE_META.home.title;
}

/* ============================================================
   Shell
   ============================================================ */

export function renderSite({ page = "home", tiers = [], verifyResult = null } = {}) {
  return html`
    ${header(page)}
    <main id="main" class="site-main">
      ${
        page === "about" ? aboutPage()
        : page === "membership" ? membershipPage()
        : page === "owners" ? ownersPage()
        : page === "fees" ? feesPage(tiers)
        : page === "verify" ? verifyPage(verifyResult)
        : page === "contact" ? contactPage()
        : homePage()
      }
    </main>
    ${footer()}
  `;
}

function header(page) {
  return html`
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="masthead" data-masthead>
      <div class="masthead-bar">
        <div class="wrap masthead-bar-inner">
          <span>Malawi Coalition for Kabaza Stakeholders Association</span>
          <span class="spacer"></span>
          <span class="masthead-est">Registered association · Malawi</span>
        </div>
      </div>

      <div class="masthead-main">
        <div class="wrap masthead-inner">
          <a class="crest" href="#/home" data-page="home">
            <img src="./assets/macokasa-logo.png" alt="" />
            <span class="crest-text">
              <b>MACOKASA</b>
              <small>Kabaza Stakeholders Association</small>
            </span>
          </a>

          <nav class="masthead-nav" data-nav aria-label="Main navigation">
            ${NAV.map(
              (p) => html`
                <a href="#/${p}" data-page="${p}"
                   class="${page === p ? "current" : ""}"
                   ${page === p ? 'aria-current="page"' : ""}>${esc(PAGE_META[p].label)}</a>
              `
            ).join("")}
          </nav>

          <div class="masthead-actions">
            <button class="btn btn-outline btn-sm" type="button" data-open-portal>
              ${icon("shield")} Staff Portal
            </button>
            <button class="btn btn-ghost btn-icon burger" type="button" data-burger aria-label="Open menu"
                    aria-expanded="false">
              ${icon("menu")}
            </button>
          </div>
        </div>
      </div>
    </header>
  `;
}

function pageHead({ eyebrow, title, lede, wide = false }) {
  return html`
    <section class="page-head">
      <div class="wrap">
        <p class="eyebrow">${esc(eyebrow)}</p>
        <h1 class="${wide ? "" : "measure"}">${esc(title)}</h1>
        ${lede ? `<p class="page-lede">${esc(lede)}</p>` : ""}
      </div>
    </section>
  `;
}

/* ============================================================
   Home
   ============================================================ */

function homePage() {
  return html`
    <section class="hero">
      <div class="wrap hero-inner">
        <div class="hero-copy">
          <p class="eyebrow">Established for the Kabaza trade</p>
          <h1>
            The national register of<br />
            Malawi's Kabaza operators
          </h1>
          <p class="hero-lede">
            MACOKASA registers pedal and motorcycle taxi operators, issues verified identity
            cards, and represents the trade to government, police and the travelling public.
          </p>
          <div class="hero-actions">
            <a class="btn btn-primary btn-lg" href="#/membership" data-page="membership">
              Become a member ${icon("arrowRight")}
            </a>
            <a class="btn btn-outline btn-lg" href="#/verify" data-page="verify">
              ${icon("qr")} Verify a card
            </a>
          </div>
        </div>

        <figure class="hero-figure">
          <img src="./assets/macokasa-rider-training.jpg"
               alt="MACOKASA operators at a road safety session" />
          <figcaption>Road safety training, Southern Region</figcaption>
        </figure>
      </div>

      <div class="hero-facts">
        <div class="wrap hero-facts-grid">
          ${[
            ["28", "Districts covered"],
            ["2", "Operator classes"],
            ["12 months", "Membership term"],
            ["QR", "Public verification"]
          ]
            .map(
              ([v, l]) => `<div><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`
            )
            .join("")}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head">
          <p class="eyebrow">Mandate</p>
          <h2>What the Association does</h2>
        </div>

        <div class="pillars">
          ${[
            ["users", "Registration", "A single national record of every pedal and motorcycle taxi operator, held by district and rank.", "membership"],
            ["card", "Identity cards", "Verified cards a passenger, officer or marshal can check by scanning a QR code.", "verify"],
            ["shield", "Safety standards", "Helmets, reflectors, licences and training recorded against each member.", "about"],
            ["motorcycle", "Owner services", "Fleet records, rider agreements and access to verified operators.", "owners"]
          ]
            .map(
              ([ico, title, body, link]) => html`
                <article class="pillar">
                  <span class="pillar-ico">${icon(ico)}</span>
                  <h3>${esc(title)}</h3>
                  <p>${esc(body)}</p>
                  <a class="text-link" href="#/${link}" data-page="${link}">
                    Read more ${icon("arrowRight")}
                  </a>
                </article>
              `
            )
            .join("")}
        </div>
      </div>
    </section>

    <section class="section band">
      <div class="wrap statement-grid">
        <div>
          <p class="eyebrow">Why it matters</p>
          <h2 class="statement">
            Kabaza carries Malawi. Until now it has not been counted.
          </h2>
        </div>
        <div class="statement-body">
          <p>
            Hundreds of thousands of livelihoods depend on the Kabaza trade, yet operators have
            long worked without recognition, without a shared standard of safety, and without a
            body able to speak on their behalf.
          </p>
          <p>
            MACOKASA exists to change that. A member holds a card that proves who they are. An
            owner holds a record of every vehicle and rider. And the Association holds evidence
            that lets it argue for the trade with authority.
          </p>
          <a class="btn btn-outline" href="#/about" data-page="about">About the Association</a>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap cta-panel">
        <div>
          <h2>Registration is open nationwide</h2>
          <p>Registration is carried out in person by Association clerks at district offices and major ranks.</p>
        </div>
        <a class="btn btn-primary btn-lg" href="#/membership" data-page="membership">
          How to join ${icon("arrowRight")}
        </a>
      </div>
    </section>
  `;
}

/* ============================================================
   About
   ============================================================ */

function aboutPage() {
  return html`
    ${pageHead({
      eyebrow: "About",
      title: "An association built around the people who ride",
      lede: "MACOKASA brings pedal and motorcycle taxi operators, vehicle owners and rank leadership into one organised body."
    })}

    <section class="section">
      <div class="wrap prose-grid">
        <div class="prose">
          <h2>Who we are</h2>
          <p>
            The Malawi Coalition for Kabaza Stakeholders Association represents the operators,
            owners and rank committees that make up the country's Kabaza transport trade. Membership
            is open to anyone who rides a pedal or motorcycle taxi for a living, and to anyone who
            owns such vehicles and hires them out.
          </p>

          <h2>What we stand for</h2>
          <p>
            Recognition, safety and accountability. An operator carrying a MACOKASA card has been
            recorded, verified and placed on a national register. That card is not a licence to
            operate, and it does not replace anything issued by a public authority — but it does
            prove that the person holding it is known to the Association.
          </p>

          <h2>How we are organised</h2>
          <p>
            The Association works through district offices and rank committees. Clerks register
            members face to face. Finance officers confirm payments and reconcile collections.
            Operations authorises card production and handles disputes. Every action is recorded
            against the person who took it.
          </p>

          <h2>Working with others</h2>
          <p>
            MACOKASA engages transport authorities, the police service, local government and
            training partners. Where a member needs formal licensing or refresher training, the
            Association points them to accredited providers rather than acting as one.
          </p>
        </div>

        <aside class="side-card">
          <h3>At a glance</h3>
          <dl class="facts">
            <div><dt>Coverage</dt><dd>All 28 districts</dd></div>
            <div><dt>Member classes</dt><dd>Motorcycle and pedal</dd></div>
            <div><dt>Membership term</dt><dd>12 months, renewable</dd></div>
            <div><dt>Registration</dt><dd>In person, by clerk</dd></div>
            <div><dt>Card verification</dt><dd>Public QR code</dd></div>
          </dl>
          <a class="btn btn-primary btn-block" href="#/membership" data-page="membership">
            Membership details
          </a>
        </aside>
      </div>
    </section>
  `;
}

/* ============================================================
   Membership
   ============================================================ */

function membershipPage() {
  const steps = [
    ["Find an Association clerk", "Clerks work from district offices and major ranks. Bring your national identity document if you hold one, and the telephone number you actually use."],
    ["Give your details", "The clerk records your name, district, rank, and the vehicle you ride, then takes your photograph. Everything is read back to you before it is saved."],
    ["Settle the fee", "Pay on the day if you can. If you cannot, you are still registered and held on file as awaiting payment until you return."],
    ["Collect your card", "Once the finance office confirms your payment, your card is produced and returned to the clerk who registered you."]
  ];

  return html`
    ${pageHead({
      eyebrow: "Membership",
      title: "Joining the Association",
      lede: "Registration is carried out in person. There is no online form and no application to download."
    })}

    <section class="section">
      <div class="wrap prose-grid">
        <div>
          <ol class="procedure">
            ${steps
              .map(
                ([t, b]) => html`
                  <li>
                    <div>
                      <h3>${esc(t)}</h3>
                      <p>${esc(b)}</p>
                    </div>
                  </li>
                `
              )
              .join("")}
          </ol>
        </div>

        <aside class="side-card">
          <h3>What to bring</h3>
          <ul class="ticks">
            <li>${icon("check")}<span>National identity document, if held</span></li>
            <li>${icon("check")}<span>Your working telephone number</span></li>
            <li>${icon("check")}<span>Vehicle plate or bicycle identification</span></li>
            <li>${icon("check")}<span>Driving licence, for motorcycle operators</span></li>
            <li>${icon("check")}<span>Next of kin name and number</span></li>
          </ul>
          <p class="side-note">
            A photograph is taken at registration. You do not need to bring one.
          </p>
        </aside>
      </div>
    </section>

    <section class="section band">
      <div class="wrap">
        <div class="section-head">
          <p class="eyebrow">Member classes</p>
          <h2>Two classes of operator</h2>
        </div>
        <div class="class-grid">
          <article class="class-card motor">
            <span class="class-ico">${icon("motorcycle")}</span>
            <h3>Motorcycle operator</h3>
            <p>For riders carrying passengers on a motorcycle. The Association records your driving licence, plate number, helmet provision and tracker status.</p>
            <p class="class-no">Membership numbers begin <code>MCK-M</code></p>
          </article>
          <article class="class-card pedal">
            <span class="class-ico">${icon("bicycle")}</span>
            <h3>Pedal operator</h3>
            <p>For riders carrying passengers by bicycle. The Association records your bicycle identification, reflector condition and road safety training.</p>
            <p class="class-no">Membership numbers begin <code>MCK-P</code></p>
          </article>
        </div>
        <p class="note">
          A person who both rides and owns vehicles holds one membership, not two.
        </p>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head"><p class="eyebrow">Common questions</p><h2>Questions members ask</h2></div>
        <div class="qa">
          ${[
            ["What if I cannot pay on the day?", "You are still registered. Your record is held as awaiting payment and any clerk can find you later by name, telephone number or identity document number."],
            ["When will I receive my card?", "Once the finance office confirms your payment, the card enters production. Cards are produced in batches, sorted by district and rank, and returned to the clerk who registered you."],
            ["My card was lost or stolen.", "Report it to your rank chairperson or nearest Association office immediately so the QR code can be cancelled. A replacement must be authorised by the operations manager and carries a fee."],
            ["What does a passenger see when they scan?", "Your name, membership number, class, district and whether your membership is current. Nothing else — not your telephone number, not your identity document number, not your address."],
            ["Does the card replace my driving licence?", "No. The card proves membership of the Association. It is not a licence to operate and does not replace anything issued by a public authority."]
          ]
            .map(
              ([q, a]) => html`
                <details>
                  <summary>${esc(q)}</summary>
                  <div class="qa-body">${esc(a)}</div>
                </details>
              `
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

/* ============================================================
   Owners
   ============================================================ */

function ownersPage() {
  return html`
    ${pageHead({
      eyebrow: "Vehicle owners",
      title: "For those who own and hire out",
      lede: "Most Kabaza vehicles are ridden by someone other than their owner. Membership gives owners a proper record of both."
    })}

    <section class="section">
      <div class="wrap prose-grid">
        <div class="prose">
          <h2>The difficulty</h2>
          <p>
            An owner with three motorcycles and three riders has three separate arrangements, each
            agreed verbally and remembered differently by each party. When a rider leaves, when a
            target is missed, or when a vehicle is damaged, there is no record to refer to.
          </p>

          <h2>What membership provides</h2>
          <p>
            Every vehicle you own is recorded with its plate or frame identification, make,
            condition and safety equipment. Every rider is recorded against the vehicle they ride,
            with the agreement type, the agreed amount and the date it began. Ending or reassigning
            an arrangement is a single recorded action, not a conversation.
          </p>

          <h2>Verified riders</h2>
          <p>
            When you need a rider, the Association can only offer you members whose membership is
            current and whose class matches your vehicle. A bicycle cannot be assigned to a
            motorcycle operator, and a lapsed member is not offered at all.
          </p>
        </div>

        <aside class="side-card">
          <h3>Owner membership includes</h3>
          <ul class="ticks">
            <li>${icon("check")}<span>Fleet register of every vehicle</span></li>
            <li>${icon("check")}<span>Rider agreements and terms</span></li>
            <li>${icon("check")}<span>Access to verified operators</span></li>
            <li>${icon("check")}<span>Assignment history per vehicle</span></li>
            <li>${icon("check")}<span>Association representation</span></li>
          </ul>
          <a class="btn btn-primary btn-block" href="#/fees" data-page="fees">Owner fees</a>
        </aside>
      </div>
    </section>
  `;
}

/* ============================================================
   Fees
   ============================================================ */

function feesPage(tiers) {
  const motor = tiers.filter((t) => t.operator_type === "motorist");
  const pedal = tiers.filter((t) => t.operator_type === "pedalist");

  return html`
    ${pageHead({
      eyebrow: "Fees",
      title: "Membership fees",
      lede: "Pedal operators pay approximately half the motorcycle rate. Fees are reviewed by the Association as economic conditions change."
    })}

    <section class="section">
      <div class="wrap">
        <div class="fee-tabs" role="tablist" aria-label="Operator class">
          <button type="button" class="on" data-tier-tab="motorist" role="tab" aria-selected="true">
            ${icon("motorcycle")} Motorcycle operators
          </button>
          <button type="button" data-tier-tab="pedalist" role="tab" aria-selected="false">
            ${icon("bicycle")} Pedal operators
          </button>
        </div>

        <div data-tier-panel="motorist">${feeTable(motor)}</div>
        <div data-tier-panel="pedalist" hidden>${feeTable(pedal)}</div>

        <div class="fee-notes">
          <h3>Notes on fees</h3>
          <ul>
            <li>Figures shown are the annual registration rate and include the identity card.</li>
            <li>Renewal is charged at a lower rate than first registration.</li>
            <li>A replacement card, where authorised, carries a separate fee.</li>
            <li>Payment may be made by cash, Airtel Money, TNM Mpamba or bank transfer.</li>
            <li>Confirm the exact amount with your district clerk on the day.</li>
          </ul>
        </div>
      </div>
    </section>
  `;
}

function feeTable(tiers) {
  if (!tiers.length) {
    return `<div class="empty">${icon("inbox")}<strong>Fees are being reviewed</strong><span>Please ask your district clerk for current rates.</span></div>`;
  }
  return html`
    <div class="fee-grid">
      ${tiers
        .map(
          (t) => html`
            <article class="fee-card">
              <header>
                <h3>${esc(t.name)}</h3>
                <p class="fee-amount">
                  <span class="cur">MWK</span>${money(t.fee, { withSymbol: false })}
                </p>
                <p class="fee-period">per year, card included</p>
              </header>
              <ul class="ticks">
                ${(t.benefits || []).map((b) => `<li>${icon("check")}<span>${esc(b)}</span></li>`).join("")}
              </ul>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

/* ============================================================
   Verify
   ============================================================ */

function verifyPage(result) {
  return html`
    ${pageHead({
      eyebrow: "Card verification",
      title: "Verify a member's card",
      lede: "Scan the QR code on any MACOKASA card, or enter the reference printed on it."
    })}

    <section class="section">
      <div class="wrap verify-layout">
        <div class="verify-box">
          <form data-verify-form>
            <label class="field">
              <span>Card or QR reference</span>
              <input class="input" type="text" name="token" autocomplete="off"
                     placeholder="For example, CRD-M-2026-00042" />
            </label>
            <button class="btn btn-primary btn-block btn-lg" type="submit">
              ${icon("search")} Verify card
            </button>
          </form>

          ${result ? verifyResultBlock(result) : ""}
        </div>

        <aside class="side-card">
          <h3>What verification shows</h3>
          <ul class="ticks">
            <li>${icon("check")}<span>The member's name</span></li>
            <li>${icon("check")}<span>Membership number and class</span></li>
            <li>${icon("check")}<span>District of operation</span></li>
            <li>${icon("check")}<span>Whether membership is current</span></li>
          </ul>
          <p class="side-note">
            Verification never reveals a member's telephone number, identity document number,
            address or photograph.
          </p>
        </aside>
      </div>
    </section>
  `;
}

function verifyResultBlock(r) {
  if (r.notFound) {
    return html`
      <div class="verify-result bad">
        <span class="vr-mark">${icon("xCircle")}</span>
        <h3>Card not recognised</h3>
        <p>${esc(r.message || "This reference does not match any MACOKASA membership card.")}</p>
      </div>
    `;
  }
  const valid = r.valid === true;
  return html`
    <div class="verify-result ${valid ? "ok" : "bad"}">
      <span class="vr-mark">${icon(valid ? "checkCircle" : "xCircle")}</span>
      <h3>${valid ? "Membership is current" : "Membership is not current"}</h3>
      <dl class="facts">
        <div><dt>Name</dt><dd>${esc(r.member_name || "—")}</dd></div>
        <div><dt>Membership no.</dt><dd>${esc(r.membership_no || "—")}</dd></div>
        <div><dt>Class</dt><dd>${esc(r.operator_type === "pedalist" ? "Pedal operator" : "Motorcycle operator")}</dd></div>
        <div><dt>District</dt><dd>${esc(r.district || "—")}</dd></div>
        <div><dt>Valid to</dt><dd>${esc(r.expires_on || "—")}</dd></div>
      </dl>
    </div>
  `;
}

/* ============================================================
   Contact
   ============================================================ */

function contactPage() {
  return html`
    ${pageHead({
      eyebrow: "Contact",
      title: "Reaching the Association",
      lede: "Registration and card collection are handled at district offices and major ranks."
    })}

    <section class="section">
      <div class="wrap contact-grid">
        <article class="contact-card">
          <span class="contact-ico">${icon("mapPin")}</span>
          <h3>District offices</h3>
          <p>Registration, renewal and card collection are handled by Association clerks at district offices and major ranks across all 28 districts.</p>
          <p class="contact-line">Ask your rank chairperson for the nearest office.</p>
        </article>

        <article class="contact-card">
          <span class="contact-ico">${icon("phone")}</span>
          <h3>Safety and complaints</h3>
          <p>To report an incident, a lost card, or the conduct of a member, contact the Association through your rank committee.</p>
          <p class="contact-line">A published telephone line is being established.</p>
        </article>

        <article class="contact-card">
          <span class="contact-ico">${icon("shield")}</span>
          <h3>Association staff</h3>
          <p>Clerks, finance officers, printing staff and operations managers access the register through the staff portal.</p>
          <button class="btn btn-outline" type="button" data-open-portal>Open staff portal</button>
        </article>
      </div>
    </section>
  `;
}

/* ============================================================
   Footer
   ============================================================ */

function footer() {
  return html`
    <footer class="site-foot">
      <div class="wrap">
        <div class="foot-top">
          <div class="foot-brand">
            <img src="./assets/macokasa-logo.png" alt="" />
            <div>
              <b>MACOKASA</b>
              <p>Malawi Coalition for Kabaza Stakeholders Association</p>
            </div>
          </div>

          <nav class="foot-nav" aria-label="Footer">
            <div>
              <h4>The Association</h4>
              <a href="#/about" data-page="about">About</a>
              <a href="#/membership" data-page="membership">Membership</a>
              <a href="#/owners" data-page="owners">Vehicle owners</a>
            </div>
            <div>
              <h4>Members</h4>
              <a href="#/fees" data-page="fees">Fees</a>
              <a href="#/verify" data-page="verify">Verify a card</a>
              <a href="#/contact" data-page="contact">Contact</a>
            </div>
            <div>
              <h4>Staff</h4>
              <button type="button" data-open-portal>Operations portal</button>
            </div>
          </nav>
        </div>

        <div class="foot-base">
          <span>&copy; ${new Date().getFullYear()} MACOKASA. All rights reserved.</span>
          <span class="spacer"></span>
          <span>System by Quick-Think Solution</span>
        </div>
      </div>
    </footer>
  `;
}

/* ============================================================
   Behaviour
   ============================================================ */

export function bindSite(root, { onNavigate, onVerify, onPortal }) {
  const head = root.querySelector("[data-masthead]");
  const onScroll = () => head?.classList.toggle("stuck", window.scrollY > 8);
  onScroll();
  window.removeEventListener("scroll", bindSite._scroll || (() => {}));
  bindSite._scroll = onScroll;
  window.addEventListener("scroll", onScroll, { passive: true });

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-open-portal]")) {
      event.preventDefault();
      onPortal?.();
      return;
    }

    if (event.target.closest("[data-burger]")) {
      const nav = root.querySelector("[data-nav]");
      const btn = event.target.closest("[data-burger]");
      const open = nav?.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(Boolean(open)));
      return;
    }

    const link = event.target.closest("[data-page]");
    if (link) {
      event.preventDefault();
      root.querySelector("[data-nav]")?.classList.remove("open");
      onNavigate?.(link.dataset.page);
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
