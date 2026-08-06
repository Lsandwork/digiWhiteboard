import {
  averageSentenceLength,
  containsFakeStoryPattern,
  countEmDashes,
  findBannedPhrases,
  paragraphLengthVariance,
  startsWithGenericQuestion
} from "@/lib/blog/editorial/banned-phrases";

export type HumanScoreInput = {
  title: string;
  body: string;
  excerpt?: string;
  fitdogMentions?: number;
  previousOpenings?: string[];
};

export type HumanScoreResult = {
  score: number;
  deductions: Array<{ code: string; points: number; reason: string }>;
  naturalVoiceScore: number;
  empathyScore: number;
  readAloudNotes: string[];
};

export function scoreHumanEditorialQuality(input: HumanScoreInput): HumanScoreResult {
  let score = 100;
  const deductions: HumanScoreResult["deductions"] = [];
  const readAloudNotes: string[] = [];
  const body = input.body || "";
  const words = body.split(/\s+/).filter(Boolean).length;

  function deduct(code: string, points: number, reason: string) {
    score -= points;
    deductions.push({ code, points, reason });
  }

  const banned = findBannedPhrases(`${input.title}\n${body}\n${input.excerpt || ""}`);
  if (banned.length) {
    deduct("filler_language", Math.min(20, banned.length * 4), `Filler / machine phrases found: ${banned.slice(0, 5).join("; ")}`);
  }
  if (startsWithGenericQuestion(body)) {
    deduct("generic_intro", 8, "Opens with a generic question pattern.");
  }
  if (containsFakeStoryPattern(body)) {
    deduct("fake_story", 15, "Contains fabricated story patterns.");
  }
  const emDashes = countEmDashes(body);
  if (emDashes > 6) {
    deduct("em_dash_overuse", 6, `Overuses em/en dashes (${emDashes}).`);
  }
  const avgSentence = averageSentenceLength(body);
  if (avgSentence > 28) {
    deduct("long_sentences", 5, "Average sentence length is too high for natural reading.");
    readAloudNotes.push("Shorten a few long sentences for read-aloud flow.");
  }
  if (avgSentence > 0 && avgSentence < 8) {
    deduct("choppy_sentences", 4, "Sentences are overly short and choppy.");
  }
  const variance = paragraphLengthVariance(body);
  if (variance < 3 && words > 250) {
    deduct("repetitive_paragraphs", 5, "Paragraph lengths are too uniform.");
  }
  if (/\b(in conclusion|to sum it all up|this article will explore)\b/i.test(body)) {
    deduct("generic_conclusion", 6, "Uses a generic conclusion pattern.");
  }
  const fitdogCount = (body.match(/\bfitdog\b/gi) || []).length;
  if (fitdogCount > 8) {
    deduct("promo_heavy", 8, "Mentions Fitdog too often for natural promotional balance.");
  }
  if (fitdogCount === 0 && /daycare|boarding|training|grooming/i.test(body)) {
    // ok — promotion optional
  }
  if (words < 280) {
    deduct("too_thin", 10, "Article is too thin to be practically useful.");
  }
  if (words > 1800) {
    deduct("too_long", 4, "Article may be padded beyond what the topic needs.");
  }
  if (!/\b(for example|for instance|one approach|try|start with|consider)\b/i.test(body)) {
    deduct("missing_examples", 6, "Lacks practical examples or actionable phrasing.");
  }
  if (!/\b(every dog|your dog|some dogs|not every dog|depends)\b/i.test(body)) {
    deduct("one_size_fits_all", 5, "Does not acknowledge that every dog is different.");
  }
  if (!/\b(vet|veterinarian|trainer|professional|qualified)\b/i.test(body) && /\b(medical|medication|supplement|emergency|diagnosis)\b/i.test(body)) {
    deduct("missing_professional_boundary", 10, "Health-adjacent content lacks professional boundary language.");
  }
  if ((input.previousOpenings || []).some((opening) => opening && body.slice(0, 120).includes(opening.slice(0, 40)))) {
    deduct("repeated_opening", 6, "Opening resembles recent articles too closely.");
  }
  if (/\b(amazing|exceptional|unmatched|perfect|the best|premium)\b/i.test(body)) {
    deduct("exaggeration", 5, "Uses exaggerated marketing language.");
  }
  if (/\bcanine\b/i.test(body) && (body.match(/\bcanine\b/gi) || []).length > 3) {
    deduct("overly_formal", 3, "Overuses “canine” where “dog” would sound more natural.");
  }

  const naturalVoiceScore = Math.max(0, 100 - deductions.filter((d) => ["filler_language", "generic_intro", "repetitive_paragraphs", "repeated_opening", "choppy_sentences"].includes(d.code)).reduce((s, d) => s + d.points, 0) * 1.2);
  const empathyScore = Math.max(
    0,
    100 -
      deductions
        .filter((d) => ["one_size_fits_all", "fake_story", "exaggeration"].includes(d.code))
        .reduce((s, d) => s + d.points, 0) *
        1.5
  );

  if (avgSentence > 24) {
    readAloudNotes.push("Some sentences may feel stiff when spoken aloud.");
  }
  if (emDashes > 4) {
    readAloudNotes.push("Em dashes can sound unnatural when read aloud — consider commas or shorter sentences.");
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    deductions,
    naturalVoiceScore: Math.round(naturalVoiceScore),
    empathyScore: Math.round(empathyScore),
    readAloudNotes
  };
}
