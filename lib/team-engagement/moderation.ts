import { createHash } from "node:crypto";
import type { AiPolicySettings, ModerationReasonCode } from "@/lib/team-engagement/constants";

/**
 * Bark Out moderation. Policy rules always run first and are final for clear violations, so no
 * number of confirmations can post them. The AI classifier only decides between auto-approval,
 * author confirmation, and human review. Without a configured provider everything that passes the
 * rules waits for a human moderator.
 */

export type RuleVerdict = "clear" | "ambiguous" | "review" | "prohibited";

export type RuleFinding = {
  code: ModerationReasonCode;
  severity: Exclude<RuleVerdict, "clear">;
  phrase: string;
};

export type RuleScreening = {
  verdict: RuleVerdict;
  findings: RuleFinding[];
};

type Rule = { code: ModerationReasonCode; severity: RuleFinding["severity"]; pattern: RegExp };

const YOU_BE = "(?:you(?:'re| are| were)|you're being|u r|ur)";
const THIRD_BE = "(?:he(?:'s| is| was)|she(?:'s| is| was)|they(?:'re| are| were))";
const STRONG_INSULTS = "(?:an?\\s+)?(?:idiot|moron|worthless|pathetic|incompetent|disgrace|garbage|trash|loser|piece of)";
const MILD_INSULTS =
  "(?:an?\\s+)?(?:stupid|dumb|useless|lazy|clown|joke|terrible|awful|the worst|disgusting|annoying|rude|a mess|clueless)";
const INTENSIFIER = "(?:so\\s+|such\\s+|really\\s+|totally\\s+|completely\\s+|always\\s+)?";

// Pronouns and health words in Bark Outs often refer to dogs (meds, surgery, anxiety), so third-person
// wording only hard-rejects the strongest insults and health checks stick to human-only terms.
const RULES: Rule[] = [
  // Clear violations: rejected outright, and no confirmation can post them.
  {
    code: "threat",
    severity: "prohibited",
    pattern: /\b(?:kill|beat up|punch|stab|choke|strangle|slap)\s+(?:you|him|her|them)\b(?!\s+with\s+kindness)/i
  },
  { code: "threat", severity: "prohibited", pattern: /\bwatch (?:your|his|her|their) back\b/i },
  { code: "threat", severity: "prohibited", pattern: /\b(?:you|he|she|they)(?:'ll| will) (?:regret|pay for) (?:it|this|that)\b/i },
  { code: "threat", severity: "prohibited", pattern: /\b(?:bring|brought|have) a (?:gun|knife|weapon)\b/i },
  { code: "threat", severity: "prohibited", pattern: /\bor else\s*(?:[.!?]|$)/i },
  { code: "personal_attack", severity: "prohibited", pattern: new RegExp(`\\b${YOU_BE}\\s+${INTENSIFIER}(?:${STRONG_INSULTS}|${MILD_INSULTS})\\b`, "i") },
  { code: "personal_attack", severity: "prohibited", pattern: new RegExp(`\\b${THIRD_BE}\\s+${INTENSIFIER}${STRONG_INSULTS}\\b`, "i") },
  { code: "personal_attack", severity: "prohibited", pattern: /\bi (?:hate|can't stand|cannot stand) (?:you|working with|being around)\b/i },
  { code: "harassment", severity: "prohibited", pattern: /\b(?:shut up|nobody likes (?:you|him|her|them))\b/i },
  { code: "harassment", severity: "prohibited", pattern: /\b(?:sexy|hot body|nice (?:butt|ass|legs|chest|rack))\b/i },
  {
    code: "bullying",
    severity: "prohibited",
    pattern: /\b(?:everyone|everybody|the whole team) (?:hates|laughs at|makes fun of) (?:you|him|her|them)\b/i
  },
  { code: "bullying", severity: "prohibited", pattern: /\b(?:no one|nobody) wants (?:you|him|her|them) (?:here|around)\b/i },
  {
    code: "retaliation",
    severity: "prohibited",
    pattern: /\b(?:snitch(?:ed|es)?|tattled?|rat(?:ted)? (?:me|us|them) out|payback|get back at (?:me|you|him|her|them)|reported me|turned me in)\b/i
  },
  { code: "personal_information", severity: "prohibited", pattern: /\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/ },
  { code: "personal_information", severity: "prohibited", pattern: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i },
  { code: "personal_information", severity: "prohibited", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { code: "discrimination", severity: "prohibited", pattern: /\b(?:for a (?:girl|woman|chick)|(?:like|for) a (?:little )?girl would)\b/i },

  // Sensitive details about a person: never auto-approved, always reviewed by a moderator.
  {
    code: "personal_information",
    severity: "review",
    pattern: /\b\d{2,5}\s+(?:[a-z]+\s){1,3}(?:street|avenue|ave|road|blvd|boulevard|lane|drive|court)\b/i
  },
  {
    code: "sensitive_topic",
    severity: "review",
    pattern:
      /\b(?:pregnan\w*|miscarriage|chemo\w*|mental health|sick leave|medical leave|maternity leave|divorc\w*|immigration|visa status|green card|racial|ethnicit\w*|sexual orientation|gay|lesbian|transgender|religion|religious)\b/i
  },
  {
    code: "sensitive_topic",
    severity: "review",
    pattern:
      /\b(?:her|his|your) (?:therapist|depression|disability|mental illness|recovery from|health issues?)\b/i
  },
  { code: "personal_attack", severity: "review", pattern: new RegExp(`\\b${THIRD_BE}\\s+${INTENSIFIER}${MILD_INSULTS}\\b`, "i") },

  // Ambiguous wording: the author confirms once, then a moderator reviews.
  {
    code: "backhanded_praise",
    severity: "ambiguous",
    pattern:
      /\b(?:for once|for a change|finally (?:did|showed|managed|got|learned)|surprisingly|actually showed up|about time|who knew|not as bad as|at least (?:you|he|she|they) (?:tried|showed)|despite (?:being|usually)|even though (?:you|he|she|they) (?:usually|normally|always)|for someone who)\b/i
  },
  {
    code: "not_recognition",
    severity: "ambiguous",
    pattern:
      /\b(?:should(?:n't)? have|needs to (?:improve|work on|stop|learn)|messed up|screwed up|attitude problem|(?:your|his|her|their) fault|always late|never on time|wasn't helpful|was not helpful)\b/i
  },
  {
    code: "personal_attack",
    severity: "ambiguous",
    pattern: /\b(?:idiot|stupid|dumb|moron|useless|worthless|pathetic|incompetent|loser)\b/i
  }
];

const SEVERITY_RANK: Record<RuleVerdict, number> = { clear: 0, ambiguous: 1, review: 2, prohibited: 3 };

export function screenBarkOutText(message: string, context?: string | null): RuleScreening {
  const text = `${message}\n${context ?? ""}`;
  const findings: RuleFinding[] = [];
  for (const rule of RULES) {
    const match = rule.pattern.exec(text);
    if (!match) continue;
    if (findings.some((finding) => finding.code === rule.code && SEVERITY_RANK[finding.severity] >= SEVERITY_RANK[rule.severity])) {
      continue;
    }
    findings.push({ code: rule.code, severity: rule.severity, phrase: match[0].trim().slice(0, 60) });
  }
  const verdict = findings.reduce<RuleVerdict>(
    (worst, finding) => (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[worst] ? finding.severity : worst),
    "clear"
  );
  return { verdict, findings };
}

/** Normalized message hash for duplicate detection; never shown to anyone. */
export function barkOutFingerprint(message: string) {
  const normalized = message.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

const AUTHOR_NOTICES: Partial<Record<ModerationReasonCode, string>> = {
  threat: "This Bark Out can't be posted because part of it reads as a threat.",
  personal_attack: "This Bark Out can't be posted because part of it reads as a personal attack.",
  harassment: "This Bark Out can't be posted because part of it reads as harassment.",
  bullying: "This Bark Out can't be posted because part of it reads as bullying.",
  retaliation: "This Bark Out can't be posted because part of it reads as retaliation.",
  discrimination: "This Bark Out can't be posted because part of it reads as discriminatory.",
  personal_information:
    "This Bark Out can't be posted because it includes personal contact details. Remove phone numbers, emails, or addresses and try again.",
  not_recognition: "This Bark Out can't be posted because it doesn't read as recognition."
};

export function authorNoticeFor(codes: readonly ModerationReasonCode[]) {
  for (const code of codes) {
    const notice = AUTHOR_NOTICES[code];
    if (notice) return notice;
  }
  return "This Bark Out can't be posted as written. Bark Outs are for positive recognition.";
}

export function confirmationPromptFor(findings: readonly RuleFinding[]) {
  const phrase = findings.find((finding) => finding.severity === "ambiguous")?.phrase;
  const quoted = phrase ? ` (“${phrase}”)` : "";
  return `Some wording${quoted} could read as criticism instead of praise. Post it as written, or withdraw it and rephrase. If you post it, a moderator reviews it first.`;
}

export const REVIEW_NOTICE = "Thanks! A moderator reviews this Bark Out before it posts.";
export const PUBLISHED_NOTICE = "Your Bark Out is posted.";

export type AiClassification = {
  verdict: "positive" | "ambiguous" | "prohibited";
  confidence: number;
  reasons: ModerationReasonCode[];
  authorPrompt: string | null;
  provider: string;
  model: string;
};

export interface ModerationAi {
  provider: string;
  configured(): boolean;
  classify(input: { message: string; context: string | null; category: string }): Promise<AiClassification>;
}

export type ModerationDecision = {
  status: "published" | "awaiting_confirmation" | "pending_review" | "rejected";
  outcome: "ai_approved" | "author_confirmation" | "human_review" | "policy_rejected";
  reasons: ModerationReasonCode[];
  authorPrompt: string | null;
  authorNotice: string;
  ai: { provider: string; model: string; confidence: number; verdict: AiClassification["verdict"] } | null;
  /** Why the AI step did not decide (not configured, turned off, failed). Shown to moderators only. */
  aiSkipped: "not_configured" | "disabled" | "failed" | "rules_decided" | null;
};

const AI_TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("AI moderation timed out.")), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function moderateBarkOut(input: {
  message: string;
  context: string | null;
  category: string;
  policy: AiPolicySettings;
  ai: ModerationAi | null;
  /** Set when the author already confirmed ambiguous wording once. */
  confirmed?: boolean;
}): Promise<ModerationDecision> {
  const screening = screenBarkOutText(input.message, input.context);
  const codes = [...new Set(screening.findings.map((finding) => finding.code))];

  if (screening.verdict === "prohibited") {
    const prohibitedCodes = screening.findings.filter((finding) => finding.severity === "prohibited").map((finding) => finding.code);
    return {
      status: "rejected",
      outcome: "policy_rejected",
      reasons: [...new Set(prohibitedCodes)],
      authorPrompt: null,
      authorNotice: authorNoticeFor(prohibitedCodes),
      ai: null,
      aiSkipped: "rules_decided"
    };
  }

  if (screening.verdict === "review" || (screening.verdict === "ambiguous" && input.confirmed)) {
    return {
      status: "pending_review",
      outcome: "human_review",
      reasons: codes,
      authorPrompt: null,
      authorNotice: REVIEW_NOTICE,
      ai: null,
      aiSkipped: "rules_decided"
    };
  }

  if (screening.verdict === "ambiguous") {
    return {
      status: "awaiting_confirmation",
      outcome: "author_confirmation",
      reasons: codes,
      authorPrompt: confirmationPromptFor(screening.findings),
      authorNotice: "Please confirm this Bark Out before it moves on.",
      ai: null,
      aiSkipped: "rules_decided"
    };
  }

  const humanReview = (aiSkipped: ModerationDecision["aiSkipped"], ai: ModerationDecision["ai"] = null, reasons: ModerationReasonCode[] = []): ModerationDecision => ({
    status: "pending_review",
    outcome: "human_review",
    reasons,
    authorPrompt: null,
    authorNotice: REVIEW_NOTICE,
    ai,
    aiSkipped
  });

  if (!input.policy.enabled) return humanReview("disabled");
  if (!input.ai || !input.ai.configured()) return humanReview("not_configured");

  let classification: AiClassification;
  try {
    classification = await withTimeout(
      input.ai.classify({ message: input.message, context: input.context, category: input.category }),
      AI_TIMEOUT_MS
    );
  } catch {
    return humanReview("failed");
  }

  const ai = {
    provider: classification.provider,
    model: classification.model,
    confidence: classification.confidence,
    verdict: classification.verdict
  };
  const threshold = input.policy.autoApproveThreshold;

  if (classification.verdict === "prohibited") {
    if (classification.confidence >= threshold) {
      const reasons = classification.reasons.length ? classification.reasons : (["not_recognition"] as ModerationReasonCode[]);
      return {
        status: "rejected",
        outcome: "policy_rejected",
        reasons,
        authorPrompt: null,
        authorNotice: authorNoticeFor(reasons),
        ai,
        aiSkipped: null
      };
    }
    return humanReview(null, ai, classification.reasons);
  }

  if (classification.verdict === "ambiguous" || classification.confidence < threshold) {
    if (input.confirmed) return humanReview(null, ai, classification.reasons);
    return {
      status: "awaiting_confirmation",
      outcome: "author_confirmation",
      reasons: classification.reasons,
      authorPrompt:
        classification.authorPrompt?.slice(0, 300) ||
        "Parts of this Bark Out may not read as clear praise. Post it as written, or withdraw it and rephrase. If you post it, a moderator reviews it first.",
      authorNotice: "Please confirm this Bark Out before it moves on.",
      ai,
      aiSkipped: null
    };
  }

  if (input.policy.reviewEveryBarkOut || input.confirmed) return humanReview(null, ai);

  return {
    status: "published",
    outcome: "ai_approved",
    reasons: [],
    authorPrompt: null,
    authorNotice: PUBLISHED_NOTICE,
    ai,
    aiSkipped: null
  };
}

const AI_REASON_CODES = new Set<ModerationReasonCode>([
  "personal_information",
  "harassment",
  "discrimination",
  "threat",
  "bullying",
  "personal_attack",
  "retaliation",
  "backhanded_praise",
  "not_recognition",
  "sensitive_topic",
  "other"
]);

const SYSTEM_INSTRUCTION = `You review short workplace recognition posts ("Bark Outs") at a dog daycare.
Decide whether the post is clearly positive recognition of a coworker.
Return JSON only: {"verdict":"positive"|"ambiguous"|"prohibited","confidence":0..1,"reasons":[codes],"author_prompt":string|null}.
- "positive": sincere praise or thanks with no criticism, sarcasm, or sensitive details.
- "ambiguous": praise mixed with criticism, sarcasm, backhanded compliments, unclear intent, or mild negativity.
- "prohibited": harassment, discrimination, threats, bullying, personal attacks, retaliation, sexual content, accusations, or personal details such as health, contact information, or home address.
Allowed reason codes: personal_information, harassment, discrimination, threat, bullying, personal_attack, retaliation, backhanded_praise, not_recognition, sensitive_topic, other.
author_prompt: one friendly sentence to the author when the verdict is "ambiguous", otherwise null. Never quote slurs.
Names are replaced with [Author] and [Recipient].`;

export function redactNames(text: string, names: readonly string[]) {
  let output = text;
  for (const name of names) {
    for (const part of name.split(/\s+/).filter((piece) => piece.length >= 2)) {
      output = output.replace(new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "[Name]");
    }
  }
  return output;
}

export function parseAiClassification(text: string, provider: string, model: string): AiClassification {
  const raw = JSON.parse(text) as Record<string, unknown>;
  const verdict = raw.verdict === "positive" || raw.verdict === "ambiguous" || raw.verdict === "prohibited" ? raw.verdict : null;
  const confidence = typeof raw.confidence === "number" ? Math.min(Math.max(raw.confidence, 0), 1) : null;
  if (!verdict || confidence === null) throw new Error("AI moderation returned an unexpected shape.");
  const reasons = Array.isArray(raw.reasons)
    ? raw.reasons.map(String).filter((code): code is ModerationReasonCode => AI_REASON_CODES.has(code as ModerationReasonCode))
    : [];
  const prompt = typeof raw.author_prompt === "string" ? raw.author_prompt.trim().slice(0, 300) : null;
  return { verdict, confidence, reasons, authorPrompt: prompt || null, provider, model };
}

/** Gemini-backed classifier using the server's existing GEMINI_API_KEY. Names are redacted before sending. */
export function createGeminiModerationAi(options: { redact: readonly string[] }): ModerationAi {
  return {
    provider: "gemini",
    configured() {
      return Boolean(process.env.GEMINI_API_KEY?.trim());
    },
    async classify(input) {
      const { generateFitdogText } = await import("@/lib/ai/geminiClient");
      const userMessage = JSON.stringify({
        category: input.category,
        message: redactNames(input.message, options.redact),
        context: input.context ? redactNames(input.context, options.redact) : null
      });
      const result = await generateFitdogText({ systemInstruction: SYSTEM_INSTRUCTION, userMessage, jsonMode: true, fastChat: true });
      return parseAiClassification(result.text, "gemini", result.model);
    }
  };
}
