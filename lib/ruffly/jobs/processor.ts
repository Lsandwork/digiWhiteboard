import { processStoredGingrWebhook } from "@/lib/integrations/gingr/webhooks/process";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { writeRufflyAuditLog } from "@/lib/ruffly/audit";
import { canSendToContact } from "@/lib/ruffly/consent/gate";
import { isWithinQuietHours } from "@/lib/ruffly/consent/quiet-hours";
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

async function deferJob(id: string, reason: string, runAfterMs = 60 * 60_000) {
  const supabase = getServiceSupabase();
  await supabase
    .from("ruffly_job_queue")
    .update({
      status: "pending",
      last_error: reason,
      locked_at: null,
      updated_at: new Date().toISOString(),
      run_after: new Date(Date.now() + runAfterMs).toISOString()
    })
    .eq("id", id);
}

async function quietHoursActive(): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data: settings } = await supabase
    .from("ruffly_settings")
    .select("quiet_hours")
    .eq("id", "default")
    .maybeSingle();
  return isWithinQuietHours(settings?.quiet_hours as { start?: string; end?: string; timezone?: string } | null);
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
        if (await quietHoursActive()) {
          await deferJob(job.id, "Quiet hours are active.");
          results.push({ id: job.id, ok: true, deferred: "quiet_hours" });
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
          purpose: "transactional",
          respectQuietHours: false
        });
        if (!gate.allowed) {
          await completeJob(job.id);
          results.push({ id: job.id, ok: true, skipped: gate.reason });
          continue;
        }

        const to = contact.phone || contact.phone_normalized;
        if (!to) {
          await completeJob(job.id);
          results.push({ id: job.id, ok: true, skipped: "no_phone" });
          continue;
        }
        if (!isRufflySmsSendingEnabled()) {
          await completeJob(job.id);
          results.push({ id: job.id, ok: true, skipped: "sending_disabled" });
          continue;
        }
        const sms = getSmsProvider();
        if (!sms.isConfigured()) {
          await completeJob(job.id);
          results.push({ id: job.id, ok: true, skipped: "sms_not_configured" });
          continue;
        }

        const opaque = newOpaqueToken();
        const tokenHash = hashToken(opaque);
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
        const { data: reviewRequest, error: reviewError } = await supabase
          .from("ruffly_review_requests")
          .insert({
            contact_id: contact.id,
            channel: "sms",
            status: "queued",
            token_hash: tokenHash,
            expires_at: expiresAt,
            gingr_reservation_id: job.payload?.reservationId ? String(job.payload.reservationId) : null,
            service_type: job.payload?.serviceType ? String(job.payload.serviceType) : null,
            idempotency_key: job.idempotency_key
          })
          .select("id")
          .single();
        if (reviewError) throw reviewError;

        const signed = signRufflyToken({
          typ: "review",
          sub: contact.id,
          ttlSeconds: 14 * 24 * 60 * 60,
          meta: { t: opaque.slice(0, 12) }
        });
        const link = rufflyReviewPath(signed);
        const sent = await sms.send({
          to,
          purpose: "transactional",
          body: `Fitdog: Thanks for visiting! Share feedback anytime: ${link}`
        });
        if (!sent.ok) {
          await supabase
            .from("ruffly_review_requests")
            .update({ status: "failed", metadata: { error: sent.error || "SMS send failed" } })
            .eq("id", reviewRequest.id);
          throw new Error(sent.error || "SMS send failed");
        }
        await supabase
          .from("ruffly_review_requests")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            metadata: { providerMessageId: sent.providerMessageId ?? null }
          })
          .eq("id", reviewRequest.id);
        await completeJob(job.id);
        results.push({ id: job.id, ok: true });
        continue;
      }

      if (job.job_type === "send_sms") {
        const supabase = getServiceSupabase();
        const contactId = String(job.payload?.contactId || "");
        const purpose = (job.payload?.purpose as "transactional" | "marketing") || "transactional";
        if (await quietHoursActive()) {
          await deferJob(job.id, "Quiet hours are active.");
          results.push({ id: job.id, ok: true, deferred: "quiet_hours" });
          continue;
        }
        const gate = await canSendToContact({
          contactId,
          channel: "sms",
          purpose,
          respectQuietHours: false
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
        const sent = await sms.send({
          to: String(job.payload?.to || ""),
          body: String(job.payload?.body || ""),
          purpose
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
