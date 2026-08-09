/**
 * Score whether a photo (web or bulk) belongs with a Fitdog blog/social post.
 * Rejects holiday art, statues, skeletons, meme culture, and off-topic scenes.
 */

const OFF_TOPIC_PATTERNS: RegExp[] = [
  /\bd[ií]a\s*de\s*los\s*muertos\b/i,
  /\bday of the dead\b/i,
  /\bskeleton\b/i,
  /\bskull\b/i,
  /\bcalavera\b/i,
  /\bstatue\b/i,
  /\bsculpture\b/i,
  /\bfigurine\b/i,
  /\bmural\b/i,
  /\bgraffiti\b/i,
  /\bcartoon\b/i,
  /\billustration\b/i,
  /\bdrawing\b/i,
  /\bpainting\b/i,
  /\banime\b/i,
  /\bcostume\b/i,
  /\bhalloween\b/i,
  /\bchristmas\b/i,
  /\beaster\b/i,
  /\bvalentine\b/i,
  /\bstuffed\b/i,
  /\bplush\b/i,
  /\btoy dog\b/i,
  /\btaxidermy\b/i,
  /\bcemetery\b/i,
  /\bgrave\b/i,
  /\bfuneral\b/i,
  /\bwolf\b/i,
  /\bfox\b/i,
  /\bcat\b(?!egory)/i,
  /\bkitten\b/i,
  /\bhorse\b/i,
  /\bbird\b/i,
  /\blego\b/i,
  /\b3d render\b/i,
  /\bcgi\b/i,
  /\bmarigolds?\b/i,
  /\bofrenda\b/i
];

const LIVE_DOG_PATTERNS: RegExp[] = [
  /\bdog\b/i,
  /\bpup(?:py|pies)?\b/i,
  /\bcanine\b/i,
  /\bretriever\b/i,
  /\blabrador\b/i,
  /\bgolden\b/i,
  /\bterrier\b/i,
  /\bshepherd\b/i,
  /\bbulldog\b/i,
  /\bpoo?dle\b/i,
  /\bhusk(?:y|ies)\b/i,
  /\bbeagle\b/i,
  /\bpet\b/i
];

const ACTIVITY_PATTERNS: Array<{ re: RegExp; keys: string[] }> = [
  { re: /day.?care|play|yard|social|regular/i, keys: ["daycare", "play", "yard", "park", "group", "indoor", "outdoor", "happy", "running", "fetch"] },
  { re: /heat|summer|ac|air.?cond|cool|hot/i, keys: ["indoor", "shade", "water", "summer", "cool", "rest", "nap", "play"] },
  { re: /train|obedience|leash|cue|manners/i, keys: ["training", "leash", "sit", "heel", "class", "coach"] },
  { re: /board|overnight|sleep/i, keys: ["boarding", "rest", "bed", "crate", "nap"] },
  { re: /hike|trail|walk|outing|adventure/i, keys: ["hike", "trail", "walk", "outdoor", "leash", "nature"] },
  { re: /groom|bath|nail/i, keys: ["grooming", "bath", "wash", "towel"] },
  { re: /enrich|puzzle|brain|mental/i, keys: ["enrichment", "puzzle", "toy", "nosework"] }
];

export function topicTokens(topic: string): string[] {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !["the", "and", "for", "with", "their", "this", "that", "from", "got"].includes(t));
}

export function textBlob(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" \n ").toLowerCase();
}

export function isOffTopicImageText(...parts: Array<string | null | undefined>): boolean {
  const blob = textBlob(...parts);
  if (!blob.trim()) return true;
  return OFF_TOPIC_PATTERNS.some((re) => re.test(blob));
}

export function hasLiveDogSignal(...parts: Array<string | null | undefined>): boolean {
  const blob = textBlob(...parts);
  return LIVE_DOG_PATTERNS.some((re) => re.test(blob));
}

/** Higher is better. Below 40 should not be used for posting. */
export function scoreImageRelevance(
  topic: string,
  parts: {
    title?: string | null;
    alt?: string | null;
    tags?: string[];
    caption?: string | null;
    sceneDescription?: string | null;
    category?: string | null;
    yard?: string | null;
    sourceKind?: string | null;
  }
): number {
  const blob = textBlob(
    parts.title,
    parts.alt,
    parts.caption,
    parts.sceneDescription,
    parts.category,
    parts.yard,
    ...(parts.tags || [])
  );

  if (!blob.trim()) return 0;
  if (isOffTopicImageText(blob)) return 0;
  if (!hasLiveDogSignal(blob) && parts.sourceKind !== "bulk_photo") return 0;

  let score = parts.sourceKind === "bulk_photo" ? 55 : 30;

  if (hasLiveDogSignal(blob)) score += 20;

  const tokens = topicTokens(topic);
  let tokenHits = 0;
  for (const token of tokens) {
    if (blob.includes(token)) {
      tokenHits += 1;
      score += 8;
    }
  }
  if (tokens.length && tokenHits === 0 && parts.sourceKind !== "bulk_photo") {
    // Web photos must share at least one topic token OR an activity keyword.
    let activityHit = false;
    for (const activity of ACTIVITY_PATTERNS) {
      if (!activity.re.test(topic)) continue;
      if (activity.keys.some((key) => blob.includes(key))) {
        activityHit = true;
        score += 14;
      }
    }
    if (!activityHit) return Math.min(score, 25);
  }

  for (const activity of ACTIVITY_PATTERNS) {
    if (!activity.re.test(topic)) continue;
    const hits = activity.keys.filter((key) => blob.includes(key)).length;
    score += Math.min(24, hits * 8);
  }

  // Bulk Fitdog photos are preferred for facility posts.
  if (parts.sourceKind === "bulk_photo") score += 15;

  return score;
}

export const MIN_WEB_RELEVANCE_SCORE = 45;
export const MIN_BULK_RELEVANCE_SCORE = 35;
