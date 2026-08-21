import { getServiceSupabase } from "@/lib/supabase/server";
import { recordOpsEvent } from "@/lib/ops-command-center/events";
import { createOpsNotification } from "@/lib/ops-command-center/notifications";
import { writeOpsAuditEvent } from "@/lib/ops-command-center/audit";
import type { OpsActor } from "@/lib/ops-command-center/types";

const ROUND_SLOTS = ["22:00", "00:00", "02:00", "04:00", "06:00"] as const;

function pacificDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

function dueAtForSlot(operatingDate: string, slot: string) {
  // Approximate Pacific wall time as UTC-7/-8 is handled by storing explicit ISO from local construction.
  const [hour, minute] = slot.split(":").map(Number);
  const base = new Date(`${operatingDate}T12:00:00`);
  // Build using LA formatter offset approximation via Date parsing of labeled string is messy;
  // store noon-relative adjustment: overnight slots after midnight belong to "next calendar morning" of the overnight shift starting previous evening.
  const dayOffset = hour < 12 ? 1 : 0;
  const d = new Date(base.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  d.setUTCHours(hour + 8, minute, 0, 0); // rough PT→UTC for winter; good enough for ops rounds
  return d.toISOString();
}

export async function ensureOvernightRoundsForDate(operatingDate = pacificDate()) {
  const supabase = getServiceSupabase();
  for (const slot of ROUND_SLOTS) {
    await supabase.from("ops_overnight_rounds").upsert(
      {
        operating_date: operatingDate,
        round_slot: slot,
        status: "due",
        due_at: dueAtForSlot(operatingDate, slot),
        updated_at: new Date().toISOString()
      },
      { onConflict: "operating_date,round_slot", ignoreDuplicates: true }
    );
  }
  const { data } = await supabase
    .from("ops_overnight_rounds")
    .select("*")
    .eq("operating_date", operatingDate)
    .order("due_at", { ascending: true });
  return data ?? [];
}

export async function completeOvernightRound(input: {
  roundId: string;
  notes?: string | null;
  actor?: OpsActor;
}) {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ops_overnight_rounds")
    .update({
      status: "completed",
      completed_at: now,
      completed_by_admin_id: input.actor?.adminId ?? null,
      notes: input.notes ?? null,
      updated_at: now
    })
    .eq("id", input.roundId)
    .neq("status", "completed")
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  await recordOpsEvent({
    eventType: "overnight.round_completed",
    category: "task",
    title: `Overnight round ${data.round_slot} completed`,
    summary: input.notes || null,
    actor: input.actor,
    sourceModule: "overnight",
    sourceRecordType: "ops_overnight_round",
    sourceRecordId: String(data.id)
  });
  await writeOpsAuditEvent({
    actor: input.actor,
    action: "ops.overnight.round_completed",
    objectType: "ops_overnight_round",
    objectId: String(data.id),
    sourceModule: "overnight"
  });
  return data;
}

export async function escalateMissedOvernightRounds(now = new Date()) {
  const supabase = getServiceSupabase();
  const graceMs = 20 * 60 * 1000;
  const { data } = await supabase
    .from("ops_overnight_rounds")
    .select("*")
    .eq("status", "due")
    .lt("due_at", new Date(now.getTime() - graceMs).toISOString());
  const missed = data ?? [];
  for (const row of missed) {
    await supabase
      .from("ops_overnight_rounds")
      .update({ status: "missed", updated_at: now.toISOString() })
      .eq("id", row.id);
    await createOpsNotification({
      roleKey: "overnight",
      title: `Missed overnight round ${row.round_slot}`,
      body: "Complete the wellness round and document resolution.",
      priority: "critical",
      dedupeKey: `overnight-missed:${row.id}`,
      hrefTab: "overnight_command",
      alertKey: String(row.id)
    });
    await createOpsNotification({
      roleKey: "management",
      title: `Escalation: overnight round ${row.round_slot} missed`,
      body: "Overnight check exceeded grace period.",
      priority: "high",
      dedupeKey: `overnight-escalated:${row.id}`,
      hrefTab: "overnight_command"
    });
  }
  return missed.length;
}

export async function createShiftHandoff(input: {
  fromShift: string;
  toShift: string;
  summary: string;
  fields: Record<string, string | null | undefined>;
  actor?: OpsActor;
}) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("ops_shift_handoffs")
    .insert({
      from_shift: input.fromShift,
      to_shift: input.toShift,
      submitted_by_admin_id: input.actor?.adminId ?? null,
      submitted_by_name: input.actor?.name || input.actor?.email || null,
      summary: input.summary,
      unresolved_incidents: input.fields.unresolvedIncidents ?? null,
      important_dogs: input.fields.importantDogs ?? null,
      medication: input.fields.medication ?? null,
      feeding: input.fields.feeding ?? null,
      behavior_concerns: input.fields.behaviorConcerns ?? null,
      late_pickups: input.fields.latePickups ?? null,
      transportation_issues: input.fields.transportationIssues ?? null,
      owner_follow_ups: input.fields.ownerFollowUps ?? null,
      grooming_pending: input.fields.groomingPending ?? null,
      training_pending: input.fields.trainingPending ?? null,
      open_tasks: input.fields.openTasks ?? null,
      system_issues: input.fields.systemIssues ?? null
    })
    .select("*")
    .single();
  if (error || !data) return null;
  await createOpsNotification({
    roleKey: input.toShift.includes("overnight") ? "overnight" : "team_leader",
    title: `Shift handoff ready: ${input.fromShift} → ${input.toShift}`,
    body: input.summary.slice(0, 180),
    priority: "high",
    hrefTab: "shift_handoff",
    dedupeKey: `handoff:${data.id}`
  });
  await writeOpsAuditEvent({
    actor: input.actor,
    action: "ops.shift_handoff.submitted",
    objectType: "ops_shift_handoff",
    objectId: String(data.id),
    sourceModule: "shift_handoff"
  });
  return data;
}

export async function acknowledgeShiftHandoff(input: { handoffId: string; actor?: OpsActor }) {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("ops_shift_handoffs")
    .update({
      acknowledged_at: now,
      acknowledged_by_admin_id: input.actor?.adminId ?? null,
      acknowledged_by_name: input.actor?.name || input.actor?.email || null,
      updated_at: now
    })
    .eq("id", input.handoffId)
    .select("*")
    .maybeSingle();
  return data;
}

export async function listRecentShiftHandoffs(limit = 10) {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("ops_shift_handoffs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
