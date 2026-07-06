import { canAccessActionIntent } from "@/lib/ai/fitdogActionLinks";
import type { UserAccess } from "@/lib/admin/permissions";
import { isDemoSession } from "@/lib/demo/session";
import { applyDemoStaffPush } from "@/lib/demo/store";
import { createAndPushStaffNotice, type StaffPushNotice, type StaffPushNoticeInput } from "@/lib/staff/push-notices";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { AdminSession } from "@/lib/admin/session";

export type FitdogAiPushNoticeDraft = {
  ready?: boolean;
  title?: string;
  message?: string;
  priority?: "normal" | "important" | "urgent";
  display_mode?: "normal" | "urgent";
};

export type FitdogAiChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export function normalizePushNoticeDraft(raw: unknown): FitdogAiPushNoticeDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const title = String(row.title ?? "").trim();
  const message = String(row.message ?? "").trim();
  if (!title && !message) return null;

  const priority =
    row.priority === "important" || row.priority === "urgent" ? row.priority : "normal";
  const display_mode =
    row.display_mode === "urgent" || priority === "urgent" ? "urgent" : "normal";

  return {
    ready: Boolean(row.ready),
    title: title || message.slice(0, 80).toUpperCase(),
    message: message || title,
    priority,
    display_mode
  };
}

function pushNoticeInputFromDraft(draft: FitdogAiPushNoticeDraft): StaffPushNoticeInput {
  const title = String(draft.title ?? "").trim().slice(0, 120);
  const message = String(draft.message ?? "").trim().slice(0, 600);
  return {
    title: title || "TEAM REMINDER",
    message: message || null,
    priority: draft.priority ?? "important",
    display_mode: draft.display_mode ?? (draft.priority === "urgent" ? "urgent" : "normal")
  };
}

/** Fallback when the model forgets pushNotice.ready but the user clearly gave notice text. */
export function inferPushNoticeDraft(
  message: string,
  history: FitdogAiChatHistoryItem[]
): FitdogAiPushNoticeDraft | null {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 280) return null;

  const recent = history.slice(-6);
  const askedForNotice = recent.some(
    (item) =>
      item.role === "assistant" &&
      /whiteboard|push.*notice|broadcast|what should (it|the notice|the message) say/i.test(item.content)
  );
  const userAskedToPush = recent.some(
    (item) =>
      item.role === "user" &&
      /push.*notice|broadcast.*team|send.*notice|tell the team/i.test(item.content)
  );

  if (!askedForNotice && !userAskedToPush) return null;
  if (/^(yes|yeah|yep|ok|okay|sure|push it|send it|do it)\.?$/i.test(trimmed)) return null;

  const shortTitle =
    trimmed.length <= 48 ? trimmed.toUpperCase() : `${trimmed.slice(0, 45).trim()}…`.toUpperCase();
  const body =
    trimmed.length <= 48
      ? `Team reminder: ${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}.`
      : trimmed;

  return {
    ready: true,
    title: shortTitle,
    message: body,
    priority: /urgent|asap|now|immediately/i.test(trimmed) ? "urgent" : "important",
    display_mode: /urgent|asap|now|immediately/i.test(trimmed) ? "urgent" : "normal"
  };
}

export async function executeFitdogAiPushNotice(params: {
  session: AdminSession;
  access: UserAccess;
  draft: FitdogAiPushNoticeDraft;
}): Promise<StaffPushNotice | null> {
  if (!canAccessActionIntent(params.access, "push_notice")) return null;

  const input = pushNoticeInputFromDraft(params.draft);
  const actor = params.session.email ?? params.session.adminUserId ?? "admin";
  const supabase = getServiceSupabase();

  if (isDemoSession(params.session)) {
    const result = await applyDemoStaffPush(
      supabase,
      { action: "create_and_push", ...input },
      actor
    );
    return result.notice ?? null;
  }

  return createAndPushStaffNotice(supabase, input, actor);
}

export function buildPushSuccessReply(notice: StaffPushNotice) {
  const detail = notice.message ? `\n${notice.message}` : "";
  return `Done — it's live on the staff whiteboard.\n\n${notice.title}${detail}`;
}
