import { EngagementError } from "@/lib/team-engagement/errors";

export const COMMUNITY_GUIDELINE =
  "Welcome to The Pack! This is a place for appreciation, encouragement, teamwork, and constructive ideas. Keep posts respectful, positive, professional, and free of profanity. Celebrate one another, offer helpful feedback, and help make Fitdog a better place to work.";

export const CONTENT_BLOCKED_MESSAGE =
  "Let's keep The Pack positive and respectful. Please revise your message before posting.";

export const CONTENT_NOT_CONSTRUCTIVE_MESSAGE =
  "Please focus on the behavior, experience, or improvement you'd like to recognize or discuss—not personal criticism.";

export const VOICE_CONTENT_BLOCKED_MESSAGE =
  "Please share feedback respectfully. Profanity, threats, harassment, and personal attacks are not allowed—even in anonymous surveys.";

export type CommunitySurface =
  | "bark_out"
  | "comment"
  | "fun"
  | "idea"
  | "voice"
  | "milestone"
  | "report";

type ScreeningResult = { allowed: true } | { allowed: false; message: string; code: "profanity" | "harmful" };

/** NFKC, homoglyphs, leetspeak, and punctuation stripping for matching only (never shown to users). */
export function normalizeCommunityText(input: string): { spaced: string; collapsed: string } {
  const nfkc = input.normalize("NFKC").toLowerCase();
  const leet = nfkc
    .replace(/[@]/g, "a")
    .replace(/[$]/g, "s")
    .replace(/[!1|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[8]/g, "b")
    .replace(/\*/g, "");
  const spaced = leet.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const collapsed = spaced.replace(/\s/g, "");
  const deRepeated = collapsed.replace(/(.)\1{2,}/g, "$1$1");
  return { spaced, collapsed: deRepeated };
}

/**
 * Roots only — matched after normalization. Kept in one place for maintainers; never logged or returned to clients.
 */
const PROFANITY_ROOTS = [
  "fuck",
  "fuk",
  "fck",
  "fcuk",
  "shit",
  "sh1t",
  "bullshit",
  "bitch",
  "b1tch",
  "asshole",
  "dickhead",
  "bastard",
  "cunt",
  "whore",
  "slut",
  "piss",
  "prick",
  "douche",
  "wtf",
  "stfu",
  "milf",
  "dilf"
] as const;

const HARMFUL_PATTERNS: RegExp[] = [
  /\b(kill yourself|kys)\b/i,
  /\b(go die)\b/i,
  /\b(nazi|heil hitler)\b/i
];

/** Catches f*ck, sh!t-style spacing and repeated letters after normalization. */
const OBFUSCATED_PROFANITY: RegExp[] = [/f+u*c*k+/, /s+h+i+t+/, /b+i+t+c*h+/, /a+s+s+h+o+l+e+/];

function containsProfanity(spaced: string, collapsed: string): boolean {
  for (const pattern of OBFUSCATED_PROFANITY) {
    if (pattern.test(collapsed)) return true;
  }
  for (const root of PROFANITY_ROOTS) {
    if (spaced.includes(` ${root} `) || spaced.startsWith(`${root} `) || spaced.endsWith(` ${root}`) || spaced === root) {
      return true;
    }
    if (collapsed.includes(root)) return true;
    const loose = new RegExp(`\\b${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (loose.test(spaced)) return true;
  }
  return false;
}

function containsHarmful(spaced: string): boolean {
  for (const pattern of HARMFUL_PATTERNS) {
    if (pattern.test(spaced)) return true;
  }
  return false;
}

export function screenCommunityText(
  text: string,
  surface: CommunitySurface
): ScreeningResult {
  const trimmed = text.trim();
  if (!trimmed) return { allowed: true };
  const { spaced, collapsed } = normalizeCommunityText(trimmed);
  if (containsProfanity(spaced, collapsed)) {
    return {
      allowed: false,
      code: "profanity",
      message: surface === "voice" ? VOICE_CONTENT_BLOCKED_MESSAGE : CONTENT_BLOCKED_MESSAGE
    };
  }
  if (containsHarmful(spaced)) {
    return {
      allowed: false,
      code: "harmful",
      message: surface === "voice" ? VOICE_CONTENT_BLOCKED_MESSAGE : CONTENT_BLOCKED_MESSAGE
    };
  }
  return { allowed: true };
}

export function assertCommunityText(text: string, surface: CommunitySurface): void {
  const result = screenCommunityText(text, surface);
  if (!result.allowed) {
    throw new EngagementError(400, "content_blocked", result.message);
  }
}