export type TopicScoreInput = {
  title: string;
  readerConcern: string;
  primaryTakeaway: string;
  angle: string;
  localRelevance?: string;
  pillar?: string;
  existingTitles?: string[];
};

export type TopicScoreResult = {
  score: number;
  breakdown: Record<string, number>;
  deductions: string[];
  rejected: boolean;
  rejectionReason?: string;
};

const WEAK_TOPICS = [
  /why dogs are great/i,
  /five reasons to love dogs/i,
  /everything you need to know about dogs/i,
  /the ultimate dog guide/i,
  /why dog daycare is amazing/i,
  /top ten dog tips/i,
  /fun facts about dogs/i
];

export function scoreTopicQuality(input: TopicScoreInput): TopicScoreResult {
  const deductions: string[] = [];
  const breakdown: Record<string, number> = {
    usefulness: 20,
    specificity: 15,
    originality: 15,
    depthPotential: 15,
    fitdogExpertise: 10,
    localRelevance: 10,
    actionability: 15
  };

  for (const pattern of WEAK_TOPICS) {
    if (pattern.test(input.title)) {
      return {
        score: 20,
        breakdown,
        deductions: ["Topic is too generic / low-value for Fitdog readers."],
        rejected: true,
        rejectionReason: "Weak generic topic"
      };
    }
  }

  if (!input.readerConcern.trim() || input.readerConcern.trim().length < 20) {
    breakdown.usefulness -= 8;
    deductions.push("Reader concern is missing or too thin.");
  }
  if (!input.primaryTakeaway.trim() || input.primaryTakeaway.trim().length < 20) {
    breakdown.actionability -= 8;
    deductions.push("Primary takeaway is missing or too vague.");
  }
  if (!input.angle.trim() || input.angle.trim().length < 15) {
    breakdown.specificity -= 6;
    deductions.push("Content angle is not specific enough.");
  }
  if (/ultimate|comprehensive|everything about|top \d+/i.test(input.title)) {
    breakdown.originality -= 8;
    deductions.push("Title leans on mass-produced blog clichés.");
  }
  if ((input.existingTitles || []).some((title) => title.toLowerCase() === input.title.toLowerCase())) {
    breakdown.originality -= 12;
    deductions.push("Exact title already exists.");
  }
  if (input.localRelevance && /santa monica|los angeles|southern california/i.test(input.localRelevance)) {
    breakdown.localRelevance += 0;
  } else if (!input.localRelevance) {
    breakdown.localRelevance -= 3;
    deductions.push("No local relevance noted (optional but helpful).");
  }
  if (input.pillar) {
    breakdown.fitdogExpertise += 0;
  } else {
    breakdown.fitdogExpertise -= 4;
    deductions.push("No content pillar assigned.");
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      Object.values(breakdown).reduce((sum, value) => sum + value, 0)
    )
  );

  return {
    score,
    breakdown,
    deductions,
    rejected: score < 85,
    rejectionReason: score < 85 ? "Topic Quality Score below threshold" : undefined
  };
}
