import { NextResponse } from "next/server";
import { getBlogSettings, publishBlogArticle, seedBlogTopics, writeBlogAudit } from "@/lib/blog/service";
import { runFullAutoSeoCycle, retryFailedWordPressMirrors } from "@/lib/blog/scheduler/auto-run";
import { processSocialPostQueue } from "@/lib/blog/social/service";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const settings = await getBlogSettings();
  if (settings.emergency_off) {
    return NextResponse.json({ ok: true, skipped: true, reason: "emergency_off" });
  }

  const supabase = getServiceSupabase();
  const results: Record<string, unknown> = {};

  try {
    results.seed = await seedBlogTopics("cron");
  } catch (error) {
    results.seedError = error instanceof Error ? error.message : "seed failed";
  }

  // Full-auto human-like SEO: generate + schedule when enabled.
  try {
    results.fullAuto = await runFullAutoSeoCycle("cron");
  } catch (error) {
    results.fullAutoError = error instanceof Error ? error.message : "full auto failed";
  }

  const nowIso = new Date().toISOString();
  const { data: due } = await supabase
    .from("blog_articles")
    .select("id, status, scheduled_for, approved_by")
    .eq("status", "SCHEDULED")
    .lte("scheduled_for", nowIso)
    .limit(5);

  const published: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  const fullAuto = Boolean((settings as Record<string, unknown>).full_auto_enabled);
  for (const row of due || []) {
    if (!settings.auto_publish_enabled && !fullAuto && !row.approved_by) {
      continue;
    }
    try {
      await publishBlogArticle(String(row.id), "cron");
      published.push(String(row.id));
    } catch (error) {
      failed.push({ id: String(row.id), error: error instanceof Error ? error.message : "publish failed" });
    }
  }
  results.published = published;
  results.failed = failed;

  try {
    results.wordpressRetries = await retryFailedWordPressMirrors(3);
  } catch (error) {
    results.wordpressRetryError = error instanceof Error ? error.message : "wp retry failed";
  }

  try {
    results.socialQueue = await processSocialPostQueue(5);
  } catch (error) {
    results.socialQueueError = error instanceof Error ? error.message : "social queue failed";
  }

  const { data: jobs } = await supabase
    .from("blog_generation_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("run_after", nowIso)
    .order("run_after", { ascending: true })
    .limit(5);

  const jobResults: Array<{ id: string; status: string }> = [];
  for (const job of jobs || []) {
    await supabase
      .from("blog_generation_jobs")
      .update({ status: "running", locked_at: nowIso, attempts: Number(job.attempts || 0) + 1 })
      .eq("id", job.id);
    try {
      if (job.job_type === "seed_topics") {
        await seedBlogTopics("cron");
      } else if (job.job_type === "auto_generate_and_schedule") {
        await runFullAutoSeoCycle("cron");
      }
      await supabase
        .from("blog_generation_jobs")
        .update({ status: "succeeded", result: { ok: true }, updated_at: nowIso })
        .eq("id", job.id);
      jobResults.push({ id: String(job.id), status: "succeeded" });
    } catch (error) {
      const attempts = Number(job.attempts || 0) + 1;
      const failedStatus = attempts >= Number(job.max_attempts || 3) ? "failed" : "queued";
      await supabase
        .from("blog_generation_jobs")
        .update({
          status: failedStatus,
          last_error: error instanceof Error ? error.message : "job failed",
          run_after: new Date(Date.now() + 15 * 60_000).toISOString(),
          updated_at: nowIso
        })
        .eq("id", job.id);
      jobResults.push({ id: String(job.id), status: failedStatus });
    }
  }
  results.jobs = jobResults;
  await writeBlogAudit("cron", "cron.blog_jobs", "system", undefined, results);
  return NextResponse.json({ ok: true, results });
}
