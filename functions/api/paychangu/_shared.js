const PAYCHANGU_API = "https://api.paychangu.com";

export function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization"
    }
  });
}

export async function readBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return request.json();
  const text = await request.text();
  if (!text) return {};
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
  try {
    return JSON.parse(text);
  } catch {
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
}

export async function payChanguFetch(env, path, init = {}) {
  if (!env.PAYCHANGU_SECRET_KEY) {
    throw new Error("PAYCHANGU_SECRET_KEY is not configured.");
  }
  return fetch(`${PAYCHANGU_API}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${env.PAYCHANGU_SECRET_KEY}`,
      ...(init.headers || {})
    }
  });
}

export async function verifyTransaction(env, txRef) {
  const response = await payChanguFetch(env, `/verify-payment/${encodeURIComponent(txRef)}`);
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export function transactionStatus(payload) {
  return payload?.data?.status || payload?.status || "unknown";
}

export async function savePayChanguTransaction(env, txRef, payload, fallback = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { saved: false };
  const body = {
    tx_ref: txRef,
    amount: numericOrNull(fallback.amount || payload?.data?.amount),
    currency: fallback.currency || payload?.data?.currency || "MWK",
    payer_name: fallback.payerName || payload?.data?.customer?.name || "",
    status: transactionStatus(payload),
    payload
  };
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/paychangu_transactions?on_conflict=tx_ref`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(body)
  });
  return { saved: response.ok, status: response.status };
}

function numericOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
