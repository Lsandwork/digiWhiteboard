/**
 * Fitdog posting policy: real photography only.
 * Reject AI-generated / synthetic imagery by text signals and source class.
 */

const AI_IMAGE_PATTERNS: RegExp[] = [
  /\bai[-\s]?generated\b/i,
  /\bai[-\s]?art\b/i,
  /\bartificial intelligence\b/i,
  /\bmidjourney\b/i,
  /\bdall[-\s]?e\b/i,
  /\bstable[-\s]?diffusion\b/i,
  /\bgenerative ai\b/i,
  /\bchatgpt\b/i,
  /\bai image\b/i,
  /\bsynthetic (dog|puppy|pet|photo|image)\b/i,
  /\bgenerated (with|by|using)\b/i,
  /\btext[-\s]?to[-\s]?image\b/i,
  /\bflux\.1\b/i,
  /\bleonardo\.?ai\b/i,
  /\bfirefly\b/i,
  /\bniji\b/i,
  /\bthis (image|photo) (was |is )?(created|made) (by|with) ai\b/i
];

export function textLooksAiGenerated(...parts: Array<string | null | undefined>): boolean {
  const blob = parts.filter(Boolean).join(" \n ");
  if (!blob.trim()) return false;
  // Strip common negations so "not AI-generated" does not false-positive.
  const normalized = blob
    .replace(/\b(?:not|never|no)\s+ai[-\s]?generated\b/gi, " ")
    .replace(/\b(?:not|never|no)\s+ai[-\s]?art\b/gi, " ")
    .replace(/\breal photography only\b/gi, " ");
  return AI_IMAGE_PATTERNS.some((re) => re.test(normalized));
}

export function isBlockedBlogSourceClass(sourceClass: string | null | undefined): boolean {
  return String(sourceClass || "").toLowerCase() === "ai_generated_approved";
}

export function assertRealPhotography(sourceClass?: string | null, ...textParts: Array<string | null | undefined>) {
  if (isBlockedBlogSourceClass(sourceClass)) {
    throw new Error("AI-generated images are not allowed for Fitdog blog or social posts.");
  }
  if (textLooksAiGenerated(...textParts)) {
    throw new Error("Rejected image that appears AI-generated. Use real Fitdog bulk photos or licensed web photography.");
  }
}
