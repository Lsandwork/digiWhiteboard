import { writeAdminAuditLog } from "@/lib/admin/audit";
import type { RuffopsChecklistCompletion, RuffopsChecklistSource } from "./types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

function isMissingChecklistRelation(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    Boolean(error?.message?.includes("ops_checklist_completions"))
  );
}

function asCompletion(row: Record<string, unknown>): RuffopsChecklistCompletion {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    item_key: String(row.item_key ?? ""),
    source: String(row.source ?? "reminder") as RuffopsChecklistSource,
    source_id: String(row.source_id ?? ""),
    shift_date: String(row.shift_date ?? ""),
    completed_at: String(row.completed_at ?? ""),
    completed_by: row.completed_by ? String(row.completed_by) : null,
    completed_by_name: row.completed_by_name ? String(row.completed_by_name) : null,
    undone_at: row.undone_at ? String(row.undone_at) : null,
    metadata
  };
}

export async function listChecklistCompletions(
  supabase: SupabaseClient,
  shiftDate: string
): Promise<Map<string, RuffopsChecklistCompletion>> {
  const { data, error } = await supabase
    .from("ops_checklist_completions")
    .select(
      "item_key, source, source_id, shift_date, completed_at, completed_by, completed_by_name, undone_at, metadata"
    )
    .eq("shift_date", shiftDate);
  if (error) {
    if (isMissingChecklistRelation(error)) return new Map();
    throw error;
  }
  const map = new Map<string, RuffopsChecklistCompletion>();
  for (const row of data ?? []) {
    const completion = asCompletion(row as Record<string, unknown>);
    if (completion.item_key) map.set(completion.item_key, completion);
  }
  return map;
}

export async function upsertChecklistCompletion(
  supabase: SupabaseClient,
  input: {
    itemKey: string;
    source: RuffopsChecklistSource;
    sourceId: string;
    shiftDate: string;
    actorUserId: string | null;
    actorName: string | null;
    actorEmail?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<RuffopsChecklistCompletion> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ops_checklist_completions")
    .upsert(
      {
        item_key: input.itemKey,
        source: input.source,
        source_id: input.sourceId,
        shift_date: input.shiftDate,
        completed_at: now,
        completed_by: input.actorUserId,
        completed_by_name: input.actorName,
        undone_at: null,
        undone_by: null,
        metadata: input.metadata ?? {}
      },
      { onConflict: "item_key" }
    )
    .select(
      "item_key, source, source_id, shift_date, completed_at, completed_by, completed_by_name, undone_at, metadata"
    )
    .maybeSingle();
  if (error) {
    if (isMissingChecklistRelation(error)) {
      throw new Error("RuffOps Checklist is not installed yet. Apply migration 079 and refresh.");
    }
    throw error;
  }
  if (!data) throw new Error("Unable to save checklist completion.");

  await writeAdminAuditLog({
    actorAdminId: input.actorUserId,
    actorEmail: input.actorEmail ?? null,
    action: "ruffops_checklist.completed",
    targetType: "ops_checklist_item",
    targetId: input.itemKey,
    details: { source: input.source, source_id: input.sourceId, shift_date: input.shiftDate }
  });

  return asCompletion(data as Record<string, unknown>);
}

export async function undoChecklistCompletion(
  supabase: SupabaseClient,
  input: {
    itemKey: string;
    actorUserId: string | null;
    actorEmail?: string | null;
  }
): Promise<RuffopsChecklistCompletion | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ops_checklist_completions")
    .update({
      undone_at: now,
      undone_by: input.actorUserId
    })
    .eq("item_key", input.itemKey)
    .is("undone_at", null)
    .select(
      "item_key, source, source_id, shift_date, completed_at, completed_by, completed_by_name, undone_at, metadata"
    )
    .maybeSingle();
  if (error) {
    if (isMissingChecklistRelation(error)) return null;
    throw error;
  }

  await writeAdminAuditLog({
    actorAdminId: input.actorUserId,
    actorEmail: input.actorEmail ?? null,
    action: "ruffops_checklist.undone",
    targetType: "ops_checklist_item",
    targetId: input.itemKey
  });

  return data ? asCompletion(data as Record<string, unknown>) : null;
}
