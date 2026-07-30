import type { SupabaseClient } from "@supabase/supabase-js";
import type { MissedCall, MissedCallStatus, MissedCallSummary, MissedCallSyncRun } from "@/lib/missed-calls/types";

export async function listMissedCalls(
  supabase: SupabaseClient,
  params?: { status?: MissedCallStatus | "all"; limit?: number; offset?: number }
): Promise<{ rows: MissedCall[]; total: number }> {
  const limit = params?.limit ?? 100;
  const offset = params?.offset ?? 0;
  let query = supabase
    .from("missed_calls")
    .select("*", { count: "exact" })
    .order("received_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (params?.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as MissedCall[], total: count ?? 0 };
}

export async function getMissedCall(supabase: SupabaseClient, id: string): Promise<MissedCall | null> {
  const { data, error } = await supabase.from("missed_calls").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MissedCall | null) ?? null;
}

export async function getMissedCallSummary(supabase: SupabaseClient): Promise<MissedCallSummary> {
  const { data, error } = await supabase
    .from("missed_calls")
    .select("status, call_type");
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    total_count: rows.length,
    new_count: rows.filter((r) => r.status === "new").length,
    listened_count: rows.filter((r) => r.status === "listened").length,
    voicemail_count: rows.filter((r) => r.call_type === "voicemail").length
  };
}

export async function countNewMissedCalls(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("missed_calls")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function upsertMissedCall(
  supabase: SupabaseClient,
  row: Partial<MissedCall> & {
    gmail_message_id: string;
    received_at: string;
    subject: string;
  }
): Promise<{ row: MissedCall; created: boolean }> {
  const { data: existing } = await supabase
    .from("missed_calls")
    .select("id")
    .eq("gmail_message_id", row.gmail_message_id)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase
      .from("missed_calls")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { row: data as MissedCall, created: false };
  }

  const { data, error } = await supabase
    .from("missed_calls")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { row: data as MissedCall, created: true };
}

export async function markMissedCallStatus(
  supabase: SupabaseClient,
  params: { id: string; status: MissedCallStatus; actorUserId?: string | null }
): Promise<MissedCall> {
  const patch: Record<string, unknown> = {
    status: params.status,
    updated_at: new Date().toISOString()
  };
  if (params.status === "listened") {
    patch.listened_at = new Date().toISOString();
    patch.listened_by = params.actorUserId ?? null;
  }
  const { data, error } = await supabase
    .from("missed_calls")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as MissedCall;
}

export async function startSyncRun(
  supabase: SupabaseClient,
  params: { trigger: "cron" | "manual"; actorUserId?: string | null }
): Promise<MissedCallSyncRun> {
  const { data, error } = await supabase
    .from("missed_call_sync_runs")
    .insert({
      trigger: params.trigger,
      status: "running",
      actor_user_id: params.actorUserId ?? null
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as MissedCallSyncRun;
}

export async function finishSyncRun(
  supabase: SupabaseClient,
  params: {
    id: string;
    status: "completed" | "failed" | "skipped";
    messages_scanned?: number;
    calls_created?: number;
    calls_updated?: number;
    error_count?: number;
    message?: string;
    error_details?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase
    .from("missed_call_sync_runs")
    .update({
      status: params.status,
      finished_at: new Date().toISOString(),
      messages_scanned: params.messages_scanned ?? 0,
      calls_created: params.calls_created ?? 0,
      calls_updated: params.calls_updated ?? 0,
      error_count: params.error_count ?? 0,
      message: params.message ?? null,
      error_details: params.error_details ?? null,
      metadata: params.metadata ?? {}
    })
    .eq("id", params.id);
  if (error) throw new Error(error.message);
}

export async function listSyncRuns(supabase: SupabaseClient, limit = 20): Promise<MissedCallSyncRun[]> {
  const { data, error } = await supabase
    .from("missed_call_sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as MissedCallSyncRun[];
}
