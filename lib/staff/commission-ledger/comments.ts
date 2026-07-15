type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import { assertCanComment, assertCanManage, trainerOwnsRecord } from "./auth";
import { writeCommissionAudit } from "./audit";
import { getCommissionRecord } from "./records";
import { dispatchStaffOpsNotificationEvent } from "@/lib/staff/admin-ops";
import type {
  CommentableField,
  CommentThreadStatus,
  CommissionActor,
  CommissionViewer,
  ResolutionCode
} from "./types";
import { COMMENTABLE_FIELDS } from "./types";
import { centsToDisplay, bpsToDisplay } from "./money";

function fieldDisplayValue(
  record: Awaited<ReturnType<typeof getCommissionRecord>>,
  field: CommentableField
) {
  switch (field) {
    case "trainer":
      return record.trainer_name;
    case "sale_date":
      return record.sale_date ?? "";
    case "service_date":
      return record.service_date ?? "";
    case "client":
      return record.client_name;
    case "dog":
      return record.dog_name;
    case "package_or_class":
      return record.package_or_class;
    case "quantity":
      return String(record.quantity);
    case "gross_amount":
      return centsToDisplay(record.gross_amount_cents);
    case "commission_rate":
      return bpsToDisplay(record.commission_rate_bps);
    case "calculated_commission":
      return centsToDisplay(record.calculated_commission_cents);
    case "final_commission":
      return centsToDisplay(record.final_commission_cents);
    case "refund_status":
      return record.refund_status;
    default:
      return "";
  }
}

export async function listCommentThreads(supabase: SupabaseClient, recordId: string) {
  const { data: threads, error } = await supabase
    .from("package_commission_comment_threads")
    .select("*")
    .eq("record_id", recordId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const ids = (threads ?? []).map((t) => String((t as { id: string }).id));
  if (!ids.length) return [];
  const { data: replies } = await supabase
    .from("package_commission_comment_replies")
    .select("*")
    .in("thread_id", ids)
    .order("created_at", { ascending: true });
  return (threads ?? []).map((thread) => ({
    ...(thread as Record<string, unknown>),
    replies: (replies ?? []).filter((r) => String((r as { thread_id: string }).thread_id) === String((thread as { id: string }).id))
  }));
}

export async function createCellComment(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  input: { recordId: string; fieldName: CommentableField; body: string }
) {
  assertCanComment(viewer);
  const body = String(input.body ?? "").trim();
  if (!body) throw new Error("Comment is required.");
  if (!COMMENTABLE_FIELDS.includes(input.fieldName)) {
    throw new Error("That field cannot be commented on.");
  }

  const record = await getCommissionRecord(supabase, viewer, input.recordId);
  if (viewer.isTrainerOnly && !trainerOwnsRecord(record, viewer)) {
    throw new Error("You can only comment on your own commission records.");
  }

  const { data: thread, error } = await supabase
    .from("package_commission_comment_threads")
    .insert({
      record_id: record.id,
      field_name: input.fieldName,
      field_value_at_comment: fieldDisplayValue(record, input.fieldName),
      status: "open" satisfies CommentThreadStatus,
      created_by: actor.adminUserId ?? null,
      created_by_role: viewer.roleKey ?? viewer.role ?? null
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("package_commission_comment_replies").insert({
    thread_id: thread.id,
    body,
    author_user_id: actor.adminUserId ?? null,
    author_role: viewer.roleKey ?? viewer.role ?? null,
    author_name: actor.name || actor.email || "User"
  });

  await supabase
    .from("package_commission_records")
    .update({ has_open_comments: true, review_status: "needs_review" })
    .eq("id", record.id);

  await writeCommissionAudit(supabase, {
    recordId: record.id,
    action: "comment_created",
    fieldName: input.fieldName,
    newValue: body.slice(0, 200),
    actor
  });

  await dispatchStaffOpsNotificationEvent(supabase, {
    eventType: "auto_issue",
    sourceTable: "package_commission_records",
    sourceId: record.id,
    sourceTab: "package_commissions",
    title: "Commission question from trainer",
    body: `${actor.name || actor.email || "Trainer"} commented on ${input.fieldName} for ${record.dog_name} / ${record.package_or_class}: ${body}`,
    priority: "Normal",
    needsManagementReview: true,
    actor: actor.email ?? actor.adminUserId ?? "system"
  });

  return thread;
}

export async function replyToCommentThread(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  threadId: string,
  body: string
) {
  assertCanComment(viewer);
  const text = String(body ?? "").trim();
  if (!text) throw new Error("Reply is required.");

  const { data: thread, error } = await supabase
    .from("package_commission_comment_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();
  if (error || !thread) throw new Error("Comment thread not found.");

  const record = await getCommissionRecord(supabase, viewer, String(thread.record_id));
  if (viewer.isTrainerOnly && !trainerOwnsRecord(record, viewer)) {
    throw new Error("You can only reply on your own commission records.");
  }

  const nextStatus: CommentThreadStatus = viewer.canManage ? "waiting_trainer" : "waiting_management";
  await supabase.from("package_commission_comment_replies").insert({
    thread_id: threadId,
    body: text,
    author_user_id: actor.adminUserId ?? null,
    author_role: viewer.roleKey ?? viewer.role ?? null,
    author_name: actor.name || actor.email || "User"
  });
  await supabase
    .from("package_commission_comment_threads")
    .update({ status: nextStatus })
    .eq("id", threadId);

  await writeCommissionAudit(supabase, {
    recordId: record.id,
    action: "comment_reply",
    actor,
    newValue: text.slice(0, 200)
  });

  return { ok: true };
}

export async function resolveCommentThread(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  threadId: string,
  input: { resolutionCode: ResolutionCode; resolutionNote: string }
) {
  assertCanManage(viewer);
  const note = String(input.resolutionNote ?? "").trim();
  if (!note) throw new Error("Resolution note is required.");

  const { data: thread, error } = await supabase
    .from("package_commission_comment_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();
  if (error || !thread) throw new Error("Comment thread not found.");

  await supabase
    .from("package_commission_comment_threads")
    .update({
      status: "resolved",
      resolved_by: actor.adminUserId ?? null,
      resolved_at: new Date().toISOString(),
      resolution_code: input.resolutionCode,
      resolution_note: note
    })
    .eq("id", threadId);

  const { count } = await supabase
    .from("package_commission_comment_threads")
    .select("id", { count: "exact", head: true })
    .eq("record_id", thread.record_id)
    .neq("status", "resolved");

  await supabase
    .from("package_commission_records")
    .update({
      has_open_comments: (count ?? 0) > 0,
      review_status: (count ?? 0) > 0 ? "needs_review" : "resolved"
    })
    .eq("id", thread.record_id);

  await writeCommissionAudit(supabase, {
    recordId: String(thread.record_id),
    action: "comment_resolved",
    reason: `${input.resolutionCode}: ${note}`,
    actor
  });

  return { ok: true };
}

export async function reopenCommentThread(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  threadId: string,
  note?: string
) {
  assertCanManage(viewer);
  const { data: thread, error } = await supabase
    .from("package_commission_comment_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();
  if (error || !thread) throw new Error("Comment thread not found.");

  await supabase
    .from("package_commission_comment_threads")
    .update({
      status: "open",
      resolved_by: null,
      resolved_at: null,
      resolution_code: null,
      resolution_note: note ? `Reopened: ${note}` : null
    })
    .eq("id", threadId);

  await supabase
    .from("package_commission_records")
    .update({ has_open_comments: true, review_status: "needs_review" })
    .eq("id", thread.record_id);

  await writeCommissionAudit(supabase, {
    recordId: String(thread.record_id),
    action: "comment_reopened",
    reason: note ?? null,
    actor
  });

  return { ok: true };
}
