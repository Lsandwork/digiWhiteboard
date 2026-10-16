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
  // ON CONFLICT cannot target the partial unique index on idempotency_key (Postgres 42P10),
  // so insert and treat a duplicate key as "already queued".
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
  if (!inserted.error) return inserted.data;

  if (input.idempotencyKey && inserted.error.code === "23505") {
    const { data: existing, error } = await supabase
      .from("ruffly_job_queue")
      .select("id")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (error) throw new Error(`ruffly_job_queue lookup failed: ${error.message}`);
    return existing;
  }
  throw new Error(`ruffly_job_queue insert failed: ${inserted.error.message}`);
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
