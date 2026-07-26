import { getServiceSupabase } from "@/lib/supabase/server";

export type RufflyJobType =
  | "gingr_webhook_process"
  | "review_request_from_checkout"
  | "send_sms"
  | "send_email"
  | "campaign_send_batch"
  | "automation_step"
  | "ai_summary"
  | "missed_call_textback";

export async function enqueueRufflyJob(input: {
  jobType: RufflyJobType | string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  runAfterMinutes?: number;
  maxAttempts?: number;
}) {
  const supabase = getServiceSupabase();
  const runAfter = new Date(Date.now() + (input.runAfterMinutes ?? 0) * 60_000).toISOString();
  const { data, error } = await supabase
    .from("ruffly_job_queue")
    .upsert(
      {
        job_type: input.jobType,
        payload: input.payload,
        idempotency_key: input.idempotencyKey ?? null,
        run_after: runAfter,
        max_attempts: input.maxAttempts ?? 8,
        status: "pending",
        updated_at: new Date().toISOString()
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  if (error && !String(error.message).includes("duplicate")) {
    // Partial unique index upsert can fail on null keys — insert instead
    const inserted = await supabase
      .from("ruffly_job_queue")
      .insert({
        job_type: input.jobType,
        payload: input.payload,
        idempotency_key: input.idempotencyKey ?? null,
        run_after: runAfter,
        max_attempts: input.maxAttempts ?? 8,
        status: "pending"
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    return inserted.data;
  }
  return data;
}

export async function claimDueRufflyJobs(limit = 20) {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ruffly_job_queue")
    .select("*")
    .in("status", ["pending", "failed"])
    .lte("run_after", now)
    .order("run_after", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const claimed = [];
  for (const job of data || []) {
    if (job.attempts >= job.max_attempts) {
      await supabase.from("ruffly_job_queue").update({ status: "dead" }).eq("id", job.id);
      continue;
    }
    const { data: updated } = await supabase
      .from("ruffly_job_queue")
      .update({
        status: "running",
        locked_at: now,
        attempts: Number(job.attempts || 0) + 1,
        updated_at: now
      })
      .eq("id", job.id)
      .eq("status", job.status)
      .select("*")
      .maybeSingle();
    if (updated) claimed.push(updated);
  }
  return claimed;
}
