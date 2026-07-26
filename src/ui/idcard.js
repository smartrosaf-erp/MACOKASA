/**
 * ID card rendering.
 *
 * Pedalist and motorist cards must be distinguishable at arm's length by
 * police, passengers and rank marshals — hence the coloured spine, the
 * diagonal corner band and the different background texture.
 */

import { esc, html } from "../lib/dom.js";
import { icon } from "./icons.js";
import { fullName, initials, date } from "../lib/format.js";

export function cardFront({ member, card, packageName, districtName, photoUrl, verifyUrl }) {
  const type = card?.operator_type || member.operator_type || "motorist";
  const pedal = type === "pedalist";
  const band = pedal ? "PEDAL TAXI" : "MOTORCYCLE TAXI";

  return html`
    <div class="id-card ${esc(type)}" data-card-face="front">
      <span class="id-band">${icon(pedal ? "bicycle" : "motorcycle")}<span>${band}</span></span>

      <div class="id-head">
        <img src="./assets/macokasa-logo.png" alt="" />
        <div>
          <strong>MACOKASA MEMBER ID</strong>
          <small>KABAZA VERIFIED MEMBERSHIP</small>
        </div>
      </div>

      <div class="id-body">
        <div class="id-photo-col">
          <div class="id-photo">
            ${photoUrl ? `<img src="${esc(photoUrl)}" alt="" />` : esc(initials(member.first_name, member.last_name))}
          </div>
          ${packageName ? `<div class="id-tier">${esc(packageName)}</div>` : ""}
        </div>

        <div class="id-fields">
          <div class="id-name">${esc(fullName(member))}</div>
          <div class="id-field">
            <span>Membership no.</span>
            <strong>${esc(member.membership_no || "PENDING")}</strong>
          </div>
          <div class="id-pair">
            <div class="id-field"><span>District</span><strong>${esc(districtName || "—")}</strong></div>
            <div class="id-field"><span>Sex</span><strong>${esc(member.sex || "—")}</strong></div>
          </div>
          <div class="id-pair">
            <div class="id-field">
              <span>${pedal ? "Bicycle ID" : "Plate"}</span>
              <strong>${esc(member._vehicle_id || "Not recorded")}</strong>
            </div>
            <div class="id-field">
              <span>Rank / area</span>
              <strong>${esc(member._area_name || "—")}</strong>
            </div>
          </div>
          <div class="id-field">
            <span>${pedal ? "Safety training" : "Licence"}</span>
            <strong>${member.has_licence ? esc(member.licence_no || member.training_ref || "Held") : "Not held"}</strong>
          </div>
        </div>

        <div class="id-qr">
          <div class="qr-box" data-qr="${esc(verifyUrl || "")}">QR</div>
          <small>SCAN</small>
        </div>
      </div>

      <div class="id-foot">
        <span>${esc(card?.card_no || "PREVIEW")}</span>
        <span>Valid to ${esc(card?.expires_on ? date(card.expires_on) : member.period_end ? date(member.period_end) : "—")}</span>
      </div>
    </div>
  `;
}

export function cardBack({ member, card }) {
  const type = card?.operator_type || member.operator_type || "motorist";
  const pedal = type === "pedalist";
  return html`
    <div class="id-card back ${esc(type)}" data-card-face="back">
      <div class="back-msg">
        <strong>This card is the property of MACOKASA.</strong>
        If found, return it to the nearest MACOKASA office, the chairperson of the Kabaza rank, or the
        nearest police unit. Use of this card by any person other than the named member is prohibited.
      </div>
      <div class="back-cat">
        ${icon(pedal ? "bicycle" : "motorcycle")}<span>${pedal ? "PEDAL TAXI" : "MOTORCYCLE TAXI"}</span>
      </div>
      <div class="back-strip">
        <span>${esc(member.membership_no || "PENDING")}</span>
        <span>${esc(card?.card_no || "PREVIEW")}</span>
      </div>
    </div>
  `;
}

export function cardPair(props) {
  return `<div class="card-preview-wrap">${cardFront(props)}${cardBack(props)}</div>`;
}

/** Render QR codes into any [data-qr] placeholders currently in the DOM. */
export function renderQrCodes(root = document) {
  const nodes = root.querySelectorAll("[data-qr]");
  if (!nodes.length || typeof window.QRCode === "undefined") return;
  nodes.forEach((node) => {
    const value = node.dataset.qr;
    if (!value || node.dataset.qrDone === value) return;
    node.innerHTML = "";
    try {
      new window.QRCode(node, {
        text: value,
        width: 52,
        height: 52,
        correctLevel: window.QRCode.CorrectLevel.M
      });
      node.dataset.qrDone = value;
    } catch (error) {
      console.error("QR render failed", error);
    }
  });
}
