/**
 * One-shot: send cleaned VIP re-book reminder emails for every Need to Re-Book = Yes client.
 * Does not send SMS.
 */
import { getServiceSupabase } from "../lib/supabase/server";
import { getEmailProvider } from "../lib/integrations/email/provider";
import { listVipAutoBookClients, buildVipRebookEmailContent } from "../lib/staff/vip-auto-book";

const TARGETS = ["contact@fitdog.com", "lonnie@fitdog.com"] as const;
/** Resend sandbox can only deliver here until a domain is verified. */
const SANDBOX_FALLBACK = "lsand.work@gmail.com";

async function main() {
  const supabase = getServiceSupabase();
  const listed = await listVipAutoBookClients(supabase, { status: "all", pageSize: 100 });
  const needing = listed.rows.filter((row) => row.needToRebook);
  const email = getEmailProvider();

  if (!email.isConfigured()) {
    throw new Error("Email provider not configured (RESEND_API_KEY / RUFFLY_EMAIL_FROM).");
  }

  const results: Array<{ dog: string; owner: string; to: string; ok: boolean; error?: string }> = [];

  for (const client of needing) {
    const content = buildVipRebookEmailContent(client);
    if (/2139131391|SMS reminders already sent/i.test(`${content.html}\n${content.text}`)) {
      throw new Error(`Blocked SMS wording in email for ${client.dogName}`);
    }

    const recipients = [...TARGETS];
    // Always also deliver a copy we can receive while Resend domain is unverified.
    if (!recipients.includes(SANDBOX_FALLBACK as (typeof TARGETS)[number])) {
      recipients.push(SANDBOX_FALLBACK as unknown as (typeof TARGETS)[number]);
    }

    for (const to of [...TARGETS, SANDBOX_FALLBACK]) {
      const sent = await email.send({
        to,
        subject: content.subject,
        html: content.html,
        text: content.text,
        purpose: "transactional"
      });
      results.push({
        dog: client.dogName,
        owner: client.ownerName,
        to,
        ok: Boolean(sent.ok),
        error: sent.ok ? undefined : sent.error
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        count: needing.length,
        delivered: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
