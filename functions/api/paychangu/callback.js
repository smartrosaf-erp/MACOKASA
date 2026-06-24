import { json, readBody, savePayChanguTransaction, verifyTransaction } from "./_shared.js";

export function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequest({ request, env }) {
  try {
    const url = new URL(request.url);
    const body = request.method === "GET" ? {} : await readBody(request);
    const txRef = body.tx_ref || body.txRef || url.searchParams.get("tx_ref") || url.searchParams.get("txRef");
    if (!txRef) return json({ ok: false, error: "tx_ref is required." }, 400);

    const verified = await verifyTransaction(env, txRef);
    const saved = await savePayChanguTransaction(env, txRef, verified.data, {
      amount: body.amount,
      currency: body.currency,
      payerName: body.payerName
    });
    return json({ ok: verified.ok, tx_ref: txRef, verified, saved }, verified.ok ? 200 : verified.status);
  } catch (error) {
    return json({ ok: false, error: error.message }, 500);
  }
}
