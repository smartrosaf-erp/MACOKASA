import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const reminderDays = new Set([28, 14, 7, 3, 2, 1]);

serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing Supabase secrets", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from("macokasa_records")
    .select("payload")
    .eq("collection", "operators");

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const today = new Date();
  const queued = [];
  for (const row of data || []) {
    const operator = row.payload;
    if (!operator?.expiresOn) continue;
    const expiry = new Date(operator.expiresOn);
    const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
    if (!reminderDays.has(daysLeft)) continue;

    const message = `MACOKASA reminder: ${operator.fullName}, your membership ${operator.membershipNumber} expires in ${daysLeft} day(s). Renew by QR, AirtelMoney, Mpamba, POS, Bank, or Cash.`;
    queued.push({
      operator_membership_number: operator.membershipNumber,
      channel: "sms",
      reminder_day: daysLeft,
      message,
      status: "queued"
    });
  }

  if (queued.length) {
    const insert = await supabase.from("reminder_jobs").insert(queued);
    if (insert.error) return Response.json({ ok: false, error: insert.error.message }, { status: 500 });
  }

  return Response.json({ ok: true, queued: queued.length });
});
