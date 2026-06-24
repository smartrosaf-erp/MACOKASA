import { json, payChanguFetch, readBody } from "./_shared.js";

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await readBody(request);
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ ok: false, error: "Valid amount is required." }, 400);
    }

    const txRef = body.tx_ref || `MCK-${Date.now()}`;
    const origin = env.PUBLIC_BASE_URL || new URL(request.url).origin;
    const payload = {
      amount,
      currency: body.currency || "MWK",
      tx_ref: txRef,
      callback_url: body.callback_url || `${origin}/api/paychangu/callback`,
      return_url: body.return_url || `${origin}/?payment=return&tx_ref=${encodeURIComponent(txRef)}`,
      email: body.email || "payments@macokasa.mw",
      first_name: body.first_name || "MACOKASA",
      last_name: body.last_name || "Member",
      title: body.title || "MACOKASA Payment",
      description: body.description || "MACOKASA payment",
      meta: body.meta || { source: "MACOKASA" }
    };

    const response = await payChanguFetch(env, "/payment", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    return json({ ok: response.ok, tx_ref: txRef, paychangu: data }, response.ok ? 200 : response.status);
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
}
