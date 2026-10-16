import { getServiceSupabase } from "@/lib/supabase/server";

const since = new Date().toISOString();
const deadline = Date.now() + 30 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`watching for first verified Gingr check-in after ${since}`);
  while (Date.now() < deadline) {
    try {
      const db = getServiceSupabase({ timeoutMs: 20000 });
      const { data } = await db
        .from("gingr_webhook_events")
        .select("id, webhook_type, entity_id, created_at")
        .in("webhook_type", ["checking_in", "check_in"])
        .eq("verified", true)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(1);
      const first = data?.[0];
      if (first) {
        await sleep(5 * 60 * 1000);
        const prompt = `First Gingr check-in arrived (${first.webhook_type} reservation ${first.entity_id} at ${first.created_at}, event ${first.id}). Verify the check-in flow end to end: live transition, activity log, Shelly dog_check_in claim in shelly_alert_log, Ops event and ops_dog_status, and fighter-rotation behavior. Then report to the user.`;
        console.log(`AGENT_LOOP_WAKE_checkin-verify ${JSON.stringify({ prompt })}`);
        return;
      }
    } catch {
      // transient DB/network error; retry on next poll
    }
    await sleep(5 * 60 * 1000);
  }
  console.log(`AGENT_LOOP_WAKE_checkin-verify ${JSON.stringify({ prompt: "No verified Gingr check-in arrived within 30 hours. Investigate whether Gingr webhooks stopped and report to the user." })}`);
}

main();
