import { json, savePayChanguTransaction, verifyTransaction } from "./_shared.js";

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const txRef = url.searchParams.get("tx_ref") || url.searchParams.get("txRef");
    if (!txRef) return json({ ok: false, error: "tx_ref is required." }, 400);

    const verified = await verifyTransaction(env, txRef);
    const saved = await savePayChanguTransaction(env, txRef, verified.data);
    return json({ ok: verified.ok, tx_ref: txRef, verified, saved }, verified.ok ? 200 : verified.status);
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
}
