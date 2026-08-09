import { getServiceSupabase } from "../lib/supabase/server";
import { listVipAutoBookClients, sendVipRebookAlert } from "../lib/staff/vip-auto-book";

async function main() {
  const supabase = getServiceSupabase();
  const listed = await listVipAutoBookClients(supabase, { status: "all", pageSize: 100 });
  const needing = listed.rows.filter((row) => row.needToRebook);

  if (!needing.length) {
    console.log(JSON.stringify({ ok: true, sent: 0, message: "No VIP clients marked Need to Re-Book." }));
    return;
  }

  const results = [];
  for (const client of needing) {
    try {
      const sent = await sendVipRebookAlert(supabase, client);
      results.push({
        dog: client.dogName,
        owner: client.ownerName,
        ok: true,
        emailOk: sent.emailOk,
        smsOk: sent.smsOk,
        emailError: sent.emailError,
        smsError: sent.smsError
      });
    } catch (error) {
      results.push({
        dog: client.dogName,
        owner: client.ownerName,
        ok: false,
        error: error instanceof Error ? error.message : "Send failed"
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: results.every((row) => row.ok),
        count: needing.length,
        smsTo: "2139131391",
        emailTo: ["contact@fitdog.com", "lonnie@fitdog.com"],
        results
      },
      null,
      2
    )
  );

  if (results.some((row) => !row.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
