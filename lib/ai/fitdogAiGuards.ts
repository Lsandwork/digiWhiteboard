import type { UserAccess } from "@/lib/admin/permissions";
import {
  canAccessActionIntent,
  fallbackActionLinks,
  normalizeActionIntent,
  resolveActionLinks,
  type FitdogActionIntent,
  type FitdogActionLink
} from "@/lib/ai/fitdogActionLinks";

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
  return text.replace(/\n{3,}/g, "\n\n");
}

export type GeminiChatJson = {
  reply: string;
  actionIntent: string;
  secondaryActionIntent: string;
  tone: FitdogAiTone;
  needsEscalation: boolean;
  escalationReason: string;
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
    escalationReason: String(raw.escalationReason ?? "").trim()
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
}): {
  reply: string;
  actionLinks: FitdogActionLink[];
  suggestedNextStep?: string;
  tone: FitdogAiTone;
} {
  const { access, parsed, toneHint } = params;
  let reply = parsed.reply;

  if (parsed.needsEscalation || parsed.tone === "safety" || toneHint === "safety") {
    if (!/team lead|manager|notify/i.test(reply)) {
      reply = `${reply}\n\nNotify a team lead or manager right now, then document what you saw while it's fresh.`;
    }
  }

  if (normalizeActionIntent(parsed.actionIntent) === "write_up_submit" && !canAccessActionIntent(access, "write_up_submit")) {
    parsed.actionIntent = "file_complaint";
    parsed.secondaryActionIntent = "complaints_filed";
  }

  let actionLinks = resolveActionLinks(access, parsed.actionIntent, parsed.secondaryActionIntent);
  if (!actionLinks.length) {
    actionLinks = fallbackActionLinks(access, parsed.tone ?? toneHint ?? "normal");
  }

  const suggestedNextStep = parsed.escalationReason || actionLinks[0]?.reason || actionLinks[0]?.label;

  return {
    reply: sanitizeAiReply(reply),
    actionLinks,
    suggestedNextStep,
    tone: parsed.tone ?? toneHint ?? "normal"
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
