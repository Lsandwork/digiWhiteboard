import { processStoredGingrWebhook } from "@/lib/integrations/gingr/webhooks/process";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { writeRufflyAuditLog } from "@/lib/ruffly/audit";
import { canSendToContact } from "@/lib/ruffly/consent/gate";
import { isRufflySmsSendingEnabled } from "@/lib/ruffly/flags";
import { rufflyReviewPath } from "@/lib/ruffly/public-url";
import { claimDueRufflyJobs } from "@/lib/ruffly/queue/jobs";
import { getServiceSupabase } from "@/lib/supabase/server";
import { hashToken, newOpaqueToken, signRufflyToken } from "@/lib/ruffly/tokens/signed-token";

async function completeJob(id: string, patch: Record<string, unknown> = {}) {
  const supabase = getServiceSupabase();
  await supabase
    .from("ruffly_job_queue")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...patch
    })
    .eq("id", id);
}

async function failJob(id: string, error: string) {
  const supabase = getServiceSupabase();
  await supabase
    .from("ruffly_job_queue")
    .update({
      status: "failed",
      last_error: error,
      updated_at: new Date().toISOString(),
      run_after: new Date(Date.now() + 5 * 60_000).toISOString()
    })
    .eq("id", id);
}

export async function processRufflyJobs(limit = 20) {
  const jobs = await claimDueRufflyJobs(limit);
  const results = [];
  for (const job of jobs) {
    try {
      if (job.job_type === "gingr_webhook_process") {
        const eventId = String(job.payload?.eventId || "");
        await processStoredGingrWebhook(eventId);
        await completeJob(job.id);
        results.push({ id: job.id, ok: true });
        continue;
      }

      if (job.job_type === "review_request_from_checkout") {
        const supabase = getServiceSupabase();
        const ownerId = job.payload?.ownerId ? String(job.payload.ownerId) : null;
        if (!ownerId) {
          await completeJob(job.id);
          results.push({ id: job.id, ok: true, skipped: "no_owner" });
          continue;
        }
        const { data: contact } = await supabase
          .from("ruffly_contacts")
          .select("id, phone, phone_normalized")
          .eq("gingr_owner_id", ownerId)
          .maybeSingle();
        if (!contact) {
          await completeJob(job.id);
          results.push({ id: job.id, ok: true, skipped: "no_contact" });
          continue;
        }
        const gate = await canSendToContact({
          contactId: contact.id,
          channel: "sms",
          purpose: "transactional"
        });
        if (!gate.allowed) {
          await completeJob(job.id);
          results.push({ id: job.id, ok: true, skipped: gate.reason });
          continue;
        }
        const opaque = newOpaqueToken();
        const tokenHash = hashToken(opaque);
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from("ruffly_review_requests").insert({
          contact_id: contact.id,
          channel: "sms",
          status: "queued",
          token_hash: tokenHash,
          expires_at: expiresAt,
          gingr_reservation_id: job.payload?.reservationId ? String(job.payload.reservationId) : null,
          service_type: job.payload?.serviceType ? String(job.payload.serviceType) : null,
          idempotency_key: job.idempotency_key
        });
        // Public URL uses signed token for landing page auth
        const signed = signRufflyToken({
          typ: "review",
          sub: contact.id,
          ttlSeconds: 14 * 24 * 60 * 60,
          meta: { t: opaque.slice(0, 12) }
        });
        const link = rufflyReviewPath(signed);
        const reservationId = job.payload?.reservationId ? String(job.payload.reservationId) : job.id;
        if (contact.phone_normalized || contact.phone) {
          const sms = getSmsProvider();
          if (sms.isConfigured() && isRufflySmsSendingEnabled()) {
            await sms.send({
              to: contact.phone || contact.phone_normalized!,
              purpose: "transactional",
              body: `Fitdog: Thanks for visiting! Share feedback anytime: ${link}`,
              idempotencyKey: `ruffly-review:${reservationId}`.slice(0, 64),
              costMetadata: { category: "CLIENT_RUFFLY_REVIEW", templateKey: "ruffly_review_request" }
            });
          }
        }
        await completeJob(job.id);
        results.push({ id: job.id, ok: true });
        continue;
      }

      if (job.job_type === "send_sms") {
        const supabase = getServiceSupabase();
        const contactId = String(job.payload?.contactId || "");
        const gate = await canSendToContact({
          contactId,
          channel: "sms",
          purpose: (job.payload?.purpose as "transactional" | "marketing") || "transactional"
        });
        if (!gate.allowed) {
          await completeJob(job.id);
          results.push({ id: job.id, ok: true, skipped: gate.reason });
          continue;
        }
        if (!isRufflySmsSendingEnabled()) {
          await completeJob(job.id);
          results.push({ id: job.id, ok: true, skipped: "sending_disabled" });
          continue;
        }
        const sms = getSmsProvider();
        const jobIdempotency = job.idempotency_key ? String(job.idempotency_key) : `ruffly-job:${job.id}`;
        const sent = await sms.send({
          to: String(job.payload?.to || ""),
          body: String(job.payload?.body || ""),
          purpose: (job.payload?.purpose as "transactional" | "marketing") || "transactional",
          idempotencyKey: jobIdempotency.slice(0, 64),
          costMetadata: { category: "CLIENT_TRANSACTIONAL", templateKey: "ruffly_job_send_sms" }
        });
        if (!sent.ok) throw new Error(sent.error || "SMS send failed");
        await completeJob(job.id);
        results.push({ id: job.id, ok: true });
        continue;
      }

      if (job.job_type === "low_feedback_alert") {
        const supabase = getServiceSupabase();
        const feedbackId = String(job.payload?.feedbackId || "");
        if (feedbackId) {
          await supabase
            .from("ruffly_feedback")
            .update({ status: "needs_follow_up", urgency: "critical", updated_at: new Date().toISOString() })
            .eq("id", feedbackId);
        }
        await writeRufflyAuditLog({
          action: "ruffly.feedback.low_alert",
          entityType: "ruffly_feedback",
          entityId: feedbackId || undefined,
          details: {
            contactId: job.payload?.contactId ?? null,
            rating: job.payload?.rating ?? null
          }
        });
        await completeJob(job.id);
        results.push({ id: job.id, ok: true });
        continue;
      }

      await completeJob(job.id);
      results.push({ id: job.id, ok: true, skipped: "unsupported_or_noop" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Job failed";
      await failJob(job.id, message);
      results.push({ id: job.id, ok: false, error: message });
    }
  }
  return results;
}
