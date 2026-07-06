import type { UserAccess } from "@/lib/admin/permissions";
import { canAccessActionIntent, fallbackActionLinks, normalizeActionIntent, resolveActionLinks, type FitdogActionIntent, type FitdogActionLink } from "@/lib/ai/fitdogActionLinks";
import type { FitdogAiPushNoticeDraft } from "@/lib/ai/fitdogAiPushNotice";
import { normalizePushNoticeDraft } from "@/lib/ai/fitdogAiPushNotice";

export type FitdogAiTone = "normal" | "frustrated" | "urgent" | "safety" | "hr" | "client_issue";

const FRUSTRATED_KEYWORDS = [
  "frustrated",
  "upset",
  "mad",
  "angry",
  "annoyed",
  "not okay",
  "tired",
  "overwhelmed",
  "this keeps happening",
  "no one listens",
  "unsafe",
  "ridiculous",
  "sick of this",
  "done with this",
  "not cool"
];

const URGENT_KEYWORDS = [
  "bite",
  "bit",
  "blood",
  "injured",
  "injury",
  "limping",
  "choking",
  "seizure",
  "dog fight",
  "attacked",
  "escaped",
  "gate open",
  "medication missed",
  "meds missed",
  "heat stroke",
  "vomiting blood",
  "collapse",
  "aggressive",
  "not breathing",
  "foxtail",
  "paw bleeding"
];

const BLOCKED_REPLY_PATTERNS = [
  /as an ai/i,
  /i(?:'| a)?m an ai/i,
  /how may i assist you further/i,
  /based on the information provided/i,
  /in conclusion/i,
  /i hope this helps/i,
  /please contact your administrator/i
];

export function detectToneHint(message: string): FitdogAiTone | null {
  const lower = message.toLowerCase();
  if (URGENT_KEYWORDS.some((word) => lower.includes(word))) return "safety";
  if (FRUSTRATED_KEYWORDS.some((word) => lower.includes(word))) return "frustrated";
  if (lower.includes("owner complained") || lower.includes("client")) return "client_issue";
  if (lower.includes("hr") || lower.includes("write up") || lower.includes("write-up")) return "hr";
  return null;
}

export function sanitizeAiReply(reply: string): string {
  let text = reply.trim();
  for (const pattern of BLOCKED_REPLY_PATTERNS) {
    text = text.replace(pattern, "").trim();
  }
  text = text.replace(/\n{3,}/g, "\n\n");
  // Trim boilerplate link nudges when the assistant already handled the workflow in chat.
  text = text.replace(/\n+Let me know if you want to broadcast.*$/i, "").trim();
  text = text.replace(/\n+If you want to broadcast.*$/i, "").trim();
  return text;
}

export type GeminiChatJson = {
  reply: string;
  actionIntent: string;
  secondaryActionIntent: string;
  tone: FitdogAiTone;
  needsEscalation: boolean;
  escalationReason: string;
  pushNotice?: FitdogAiPushNoticeDraft | null;
};

export type GeminiVideoJson = GeminiChatJson & {
  summary: string;
  timeline: Array<{ timestamp: string; observation: string }>;
  keyObservations: string[];
  safetyConcerns: string[];
  dogBodyLanguage: string[];
  staffHandlingNotes: string[];
  recommendedNextSteps: string[];
  documentationSuggestion: string;
  suggestedLogText: string;
};

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function safeTimeline(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const timestamp = String(row.timestamp ?? "").trim();
      const observation = String(row.observation ?? "").trim();
      if (!observation) return null;
      return { timestamp: timestamp || "—", observation };
    })
    .filter(Boolean) as Array<{ timestamp: string; observation: string }>;
}

export function parseGeminiJson<T>(text: string, fallback: T): T {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return fallback;
    }
  }
}

export function normalizeChatJson(raw: Partial<GeminiChatJson>, fallbackReply: string): GeminiChatJson {
  const toneValues: FitdogAiTone[] = ["normal", "frustrated", "urgent", "safety", "hr", "client_issue"];
  const tone = toneValues.includes(raw.tone as FitdogAiTone) ? (raw.tone as FitdogAiTone) : "normal";

  return {
    reply: sanitizeAiReply(String(raw.reply ?? fallbackReply)),
    actionIntent: normalizeActionIntent(raw.actionIntent),
    secondaryActionIntent: normalizeActionIntent(raw.secondaryActionIntent),
    tone,
    needsEscalation: Boolean(raw.needsEscalation),
    escalationReason: String(raw.escalationReason ?? "").trim(),
    pushNotice: normalizePushNoticeDraft(raw.pushNotice)
  };
}

export function normalizeVideoJson(raw: Partial<GeminiVideoJson>, fallbackReply: string): GeminiVideoJson {
  const base = normalizeChatJson(raw, fallbackReply);
  return {
    ...base,
    summary: String(raw.summary ?? "").trim(),
    timeline: safeTimeline(raw.timeline),
    keyObservations: safeArray(raw.keyObservations),
    safetyConcerns: safeArray(raw.safetyConcerns),
    dogBodyLanguage: safeArray(raw.dogBodyLanguage),
    staffHandlingNotes: safeArray(raw.staffHandlingNotes),
    recommendedNextSteps: safeArray(raw.recommendedNextSteps),
    documentationSuggestion: String(raw.documentationSuggestion ?? "").trim(),
    suggestedLogText: String(raw.suggestedLogText ?? "").trim()
  };
}

export function guardChatResponse(params: {
  access: UserAccess;
  parsed: GeminiChatJson;
  toneHint?: FitdogAiTone | null;
  pushNoticePushed?: boolean;
  pendingPushNotice?: FitdogAiPushNoticeDraft | null;
}): {
  reply: string;
  actionLinks: FitdogActionLink[];
  suggestedNextStep?: string;
  tone: FitdogAiTone;
  pendingPushNotice?: FitdogAiPushNoticeDraft | null;
} {
  const { access, parsed, toneHint, pushNoticePushed, pendingPushNotice } = params;
  let reply = parsed.reply;

  const isSafety = parsed.tone === "safety" || toneHint === "safety";
  if ((parsed.needsEscalation && isSafety) || isSafety) {
    if (!/team lead|manager|notify/i.test(reply)) {
      reply = `${reply}\n\nGet a team lead or manager now, then write down what you saw.`;
    }
  }

  if (normalizeActionIntent(parsed.actionIntent) === "write_up_submit" && !canAccessActionIntent(access, "write_up_submit")) {
    parsed.actionIntent = "file_complaint";
    parsed.secondaryActionIntent = "complaints_filed";
  }

  let primaryIntent = parsed.actionIntent;
  let secondaryIntent = parsed.secondaryActionIntent;

  if (pushNoticePushed) {
    primaryIntent = "staff_whiteboard";
    secondaryIntent = "none";
  } else if (pendingPushNotice?.title && canAccessActionIntent(access, "push_notice")) {
    primaryIntent = "none";
    secondaryIntent = "none";
  } else if (parsed.pushNotice?.ready && canAccessActionIntent(access, "push_notice")) {
    primaryIntent = "none";
    secondaryIntent = "none";
  }

  let actionLinks = resolveActionLinks(access, primaryIntent, secondaryIntent);
  if (pushNoticePushed) {
    actionLinks = actionLinks.filter((link) => !link.href.includes("push_notices"));
  }
  if (!actionLinks.length) {
    actionLinks = pushNoticePushed
      ? resolveActionLinks(access, "staff_whiteboard", "none")
      : fallbackActionLinks(access, parsed.tone ?? toneHint ?? "normal");
  }

  const suggestedNextStep = parsed.escalationReason || actionLinks[0]?.reason || actionLinks[0]?.label;

  return {
    reply: sanitizeAiReply(reply),
    actionLinks: actionLinks.slice(0, 2),
    suggestedNextStep,
    tone: parsed.tone ?? toneHint ?? "normal",
    pendingPushNotice: pendingPushNotice ?? undefined
  };
}

export function guardVideoResponse(params: {
  access: UserAccess;
  parsed: GeminiVideoJson;
  toneHint?: FitdogAiTone | null;
}) {
  const guarded = guardChatResponse({ access: params.access, parsed: params.parsed, toneHint: params.toneHint });
  return {
    ...guarded,
    summary: params.parsed.summary,
    timeline: params.parsed.timeline,
    keyObservations: params.parsed.keyObservations,
    safetyConcerns: params.parsed.safetyConcerns,
    dogBodyLanguage: params.parsed.dogBodyLanguage,
    staffHandlingNotes: params.parsed.staffHandlingNotes,
    recommendedNextSteps: params.parsed.recommendedNextSteps,
    documentationSuggestion: params.parsed.documentationSuggestion,
    suggestedLogText: params.parsed.suggestedLogText
  };
}

export const SUPPORTED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/mov",
  "video/avi",
  "video/x-flv",
  "video/mpg",
  "video/webm",
  "video/wmv",
  "video/3gpp"
]);

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
