import { createHash } from "node:crypto";
import { dispatchStaffOpsNotificationEvent } from "@/lib/staff/admin-ops";
import { loadPackProTrainingState, savePackProTrainingState } from "@/lib/pack-pro/store";
import type { PackProLearnerRow } from "@/lib/pack-pro/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

function fingerprintFor(learners: PackProLearnerRow[]) {
  const incomplete = learners
    .filter((row) => !row.is_complete)
    .map((row) => `${row.email}:${row.incomplete_courses.join("|")}`)
    .sort();
  return createHash("sha1").update(incomplete.join("\n")).digest("hex");
}

function pacificDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export async function notifyPackProIncompleteTraining(
  supabase: SupabaseClient,
  learners: PackProLearnerRow[],
  options: { actor?: string; force?: boolean } = {}
) {
  const incomplete = learners
    .filter((row) => !row.is_complete)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  if (!incomplete.length) {
    return { sent: false as const, reason: "all_complete", incomplete_count: 0 };
  }

  const state = await loadPackProTrainingState(supabase);
  const fingerprint = `${pacificDayKey()}::${fingerprintFor(incomplete)}`;
  if (!options.force && state.last_alert_fingerprint === fingerprint) {
    return { sent: false as const, reason: "already_alerted_today", incomplete_count: incomplete.length };
  }

  const top = incomplete.slice(0, 8);
  const bodyLines = top.map(
    (row) =>
      `${row.name} — ${row.completed_count}/${row.required_count} complete` +
      (row.incomplete_courses.length ? ` (missing: ${row.incomplete_courses.join(", ")})` : "")
  );
  if (incomplete.length > top.length) {
    bodyLines.push(`…and ${incomplete.length - top.length} more employees.`);
  }

  await dispatchStaffOpsNotificationEvent(supabase, {
    eventType: "created",
    sourceTable: "pack_pro_training",
    sourceId: `incomplete-${pacificDayKey()}`,
    sourceTab: "pack_pro_training",
    title: `Pack Pro Training incomplete (${incomplete.length})`,
    body: bodyLines.join("\n"),
    priority: "High",
    urgent: incomplete.length >= 10,
    needsManagementReview: true,
    actor: options.actor ?? "pack-pro-training"
  });

  state.last_alert_at = new Date().toISOString();
  state.last_alert_fingerprint = fingerprint;
  await savePackProTrainingState(supabase, state);

  return { sent: true as const, incomplete_count: incomplete.length, fingerprint };
}
