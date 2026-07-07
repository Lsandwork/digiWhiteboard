import type { UserAccess } from "@/lib/admin/permissions";
import { canAccessActionIntent } from "@/lib/ai/fitdogActionLinks";
import type { GeminiChatJson } from "@/lib/ai/fitdogAiGuards";
import type { FitdogAiChatHistoryItem, FitdogAiPushNoticeDraft } from "@/lib/ai/fitdogAiPushNotice";
import { inferPushNoticeDraft } from "@/lib/ai/fitdogAiPushNotice";
import type { FitdogUserContext } from "@/lib/ai/fitdogUserContext";

const PUSH_INTENT_PATTERN =
  /\b(push|send|broadcast|post)\b.*\b(notice|message|alert|reminder)\b|\b(notice|message|alert)\b.*\b(whiteboard|team)\b|\btell the team\b/i;

const GROOMING_INTENT_PATTERN =
  /\b(grooming push|put .+ in catch|catch for grooming|needs grooming|send .+ to grooming)\b/i;

const DOCUMENT_INTENT_PATTERN =
  /\b(document|write up|write-up|log this|front desk log|handoff)\b/i;

const WHERE_TO_GO_PATTERN = /\bwhere should (this|it) go\b/i;

function stripPushBoilerplate(message: string) {
  return message
    .replace(/^(hi|hey|hello)[,!.\s]+/i, "")
    .replace(/^(i need to|please|can you|could you)\s+/i, "")
    .replace(/\b(push|send|broadcast|post)\s+(a\s+)?(notice|message|alert|reminder)\s+(to\s+)?(the\s+)?(team|staff)\b/gi, "")
    .replace(/\bon the (staff\s+)?whiteboard\b/gi, "")
    .replace(/\bfor the team\b/gi, "")
    .replace(/^[\s:,-]+|[\s:,-]+$/g, "")
    .trim();
}

export function detectPushNoticeIntent(message: string): "discover" | "with_content" | null {
  if (!PUSH_INTENT_PATTERN.test(message)) return null;
  const content = stripPushBoilerplate(message);
  if (content.length >= 8) return "with_content";
  return "discover";
}

export function buildPushNoticeDraftFromMessage(message: string): FitdogAiPushNoticeDraft | null {
  const content = stripPushBoilerplate(message);
  if (content.length < 8) return null;

  const shortTitle =
    content.length <= 48 ? content.toUpperCase() : `${content.slice(0, 45).trim()}…`.toUpperCase();

  return {
    ready: true,
    title: shortTitle,
    message: content.length <= 48 ? `Team reminder: ${content.charAt(0).toUpperCase()}${content.slice(1)}.` : content,
    priority: /urgent|asap|now|immediately/i.test(content) ? "urgent" : "important",
    display_mode: /urgent|asap|now|immediately/i.test(content) ? "urgent" : "normal"
  };
}

export function buildLocalChatFallback(params: {
  message: string;
  history: FitdogAiChatHistoryItem[];
  context: FitdogUserContext;
}): GeminiChatJson | null {
  const { message, history, context } = params;
  const trimmed = message.trim();
  if (!trimmed) return null;

  const canPush = canAccessActionIntent(context.access, "push_notice");
  const inferred = inferPushNoticeDraft(trimmed, history);
  if (inferred?.ready && canPush) {
    return {
      reply: "Got it — I'll push that to the staff whiteboard now.",
      actionIntent: "none",
      secondaryActionIntent: "none",
      tone: "normal",
      needsEscalation: false,
      escalationReason: "",
      pushNotice: inferred
    };
  }

  const pushIntent = detectPushNoticeIntent(trimmed);
  if (pushIntent === "with_content" && canPush) {
    const draft = buildPushNoticeDraftFromMessage(trimmed);
    if (draft) {
      return {
        reply: "Got it — I'll push that to the staff whiteboard now.",
        actionIntent: "none",
        secondaryActionIntent: "none",
        tone: "normal",
        needsEscalation: false,
        escalationReason: "",
        pushNotice: draft
      };
    }
  }

  if (pushIntent === "discover") {
    if (!canPush) {
      return {
        reply:
          "Pushing to the staff whiteboard needs a team lead or admin with push access. Tell me what you want the team to know and I can help you word it — or log it in the Front Desk Log for handoff.",
        actionIntent: "front_desk_log",
        secondaryActionIntent: "management_support",
        tone: "normal",
        needsEscalation: false,
        escalationReason: "",
        pushNotice: null
      };
    }

    return {
      reply:
        "I can push that straight to the staff whiteboard. What should the notice say? One short headline works best — for example: \"Clean yards before close\" or \"Team huddle at 3 PM.\"",
      actionIntent: "push_notice",
      secondaryActionIntent: "staff_whiteboard",
      tone: "normal",
      needsEscalation: false,
      escalationReason: "",
      pushNotice: { ready: false, title: "", message: "" }
    };
  }

  if (GROOMING_INTENT_PATTERN.test(trimmed)) {
    return {
      reply:
        "For grooming catch, open Grooming Push, pick the dog checked in to Gingr, and send the alert. If you tell me the dog's name I can point you to the right screen.",
      actionIntent: "grooming_push",
      secondaryActionIntent: "staff_whiteboard",
      tone: "normal",
      needsEscalation: false,
      escalationReason: "",
      pushNotice: null
    };
  }

  if (WHERE_TO_GO_PATTERN.test(trimmed) || DOCUMENT_INTENT_PATTERN.test(trimmed)) {
    return {
      reply:
        "Quick guide: shift notes and handoffs go in Front Desk Log. Employee concerns go through Management Support (complaint or request). Urgent team-wide messages go to Push Notices on the staff whiteboard. What happened?",
      actionIntent: "front_desk_log",
      secondaryActionIntent: "management_support",
      tone: "normal",
      needsEscalation: false,
      escalationReason: "",
      pushNotice: null
    };
  }

  if (/frustrated|upset|mad|angry/i.test(trimmed)) {
    return {
      reply:
        "That's fair — busy shifts pile up. Tell me what happened in one or two sentences and I'll point you to the right Fitdog workflow (log, complaint, request, or whiteboard notice).",
      actionIntent: "front_desk_log",
      secondaryActionIntent: "management_support",
      tone: "frustrated",
      needsEscalation: false,
      escalationReason: "",
      pushNotice: null
    };
  }

  return null;
}
