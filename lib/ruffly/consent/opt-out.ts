import { SMS_OPT_OUT_KEYWORDS } from "@/lib/ruffly/constants";

const NATURAL_LANGUAGE_PATTERNS = [
  /\bstop\s+texting\s+me\b/i,
  /\bdo\s+not\s+contact\s+me\b/i,
  /\bdon'?t\s+contact\s+me\b/i,
  /\bremove\s+me\b/i,
  /\bno\s+more\s+messages\b/i,
  /\bplease\s+stop\b/i
];

export function normalizeSmsBody(body: string): string {
  return body.trim().replace(/\s+/g, " ");
}

export function isKeywordOptOut(body: string): boolean {
  const token = normalizeSmsBody(body).toUpperCase();
  return (SMS_OPT_OUT_KEYWORDS as readonly string[]).includes(token);
}

export function isNaturalLanguageOptOut(body: string): boolean {
  const text = normalizeSmsBody(body);
  return NATURAL_LANGUAGE_PATTERNS.some((pattern) => pattern.test(text));
}

export function isSmsOptOutRequest(body: string): boolean {
  return isKeywordOptOut(body) || isNaturalLanguageOptOut(body);
}

export const OPT_OUT_CONFIRMATION =
  "Fitdog: You are unsubscribed from all Fitdog texts. Reply HELP for help. Msg&data rates may apply.";
