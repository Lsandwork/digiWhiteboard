import { BANNED_FILLER_PHRASES } from "@/lib/blog/constants";

export function findBannedPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_FILLER_PHRASES.filter((phrase) => lower.includes(phrase.toLowerCase()));
}

export function startsWithGenericQuestion(text: string): boolean {
  const opening = text.trim().slice(0, 80).toLowerCase();
  return /^(have you ever wondered|are you looking for|do you want to|did you know)\b/.test(opening);
}

export function containsFakeStoryPattern(text: string): boolean {
  return /\b(imagine this|picture this|meet max|sarah recently|one dog owner learned)\b/i.test(text);
}

export function countEmDashes(text: string): number {
  return (text.match(/[—–]/g) || []).length;
}

export function averageSentenceLength(text: string): number {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!sentences.length) return 0;
  const words = sentences.reduce((sum, sentence) => sum + sentence.split(/\s+/).length, 0);
  return words / sentences.length;
}

export function paragraphLengthVariance(text: string): number {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length < 2) return 0;
  const lengths = paragraphs.map((p) => p.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, len) => sum + (len - mean) ** 2, 0) / lengths.length;
  return Math.sqrt(variance);
}
