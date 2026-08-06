import { findBannedPhrases, startsWithGenericQuestion, containsFakeStoryPattern } from "@/lib/blog/editorial/banned-phrases";
import { scoreHumanEditorialQuality } from "@/lib/blog/editorial/human-score";

export type AgentReviewResult = {
  agentName: string;
  ok: boolean;
  score: number;
  findings: string[];
  recommendations: string[];
  output: Record<string, unknown>;
};

function countMatches(body: string, pattern: RegExp) {
  return (body.match(pattern) || []).length;
}

/** Dog-Owner Empathy Agent — independent of the writer. */
export function runEmpathyAgent(body: string, readerConcern: string): AgentReviewResult {
  const findings: string[] = [];
  const recommendations: string[] = [];
  let score = 92;

  if (/\b(you should have|you failed|bad owner|obviously)\b/i.test(body)) {
    score -= 20;
    findings.push("Language may feel judgmental toward the owner.");
    recommendations.push("Rewrite blame-leaning sentences into supportive guidance.");
  }
  if (readerConcern && !body.toLowerCase().includes(readerConcern.slice(0, 24).toLowerCase()) && !/\b(worry|concern|anxious|unsure|overwhelm)\b/i.test(body)) {
    score -= 8;
    findings.push("Reader concern is not clearly acknowledged.");
    recommendations.push("Open with the likely owner concern in plain language.");
  }
  if (!/\b(every dog|some dogs|your dog|not every|depends)\b/i.test(body)) {
    score -= 10;
    findings.push("Does not leave room for individual differences.");
  }
  if (/\b(always|never|must)\b/i.test(body) && countMatches(body, /\b(always|never|must)\b/gi) > 6) {
    score -= 6;
    findings.push("Overuses absolute language.");
  }
  if (/\b(terrified|deadly|disastrous)\b/i.test(body)) {
    score -= 8;
    findings.push("Fear-based wording detected.");
  }

  return {
    agentName: "dog_owner_empathy",
    ok: score >= 80,
    score: Math.max(0, score),
    findings,
    recommendations,
    output: { readerConcernAcknowledged: findings.length === 0 }
  };
}

/** Practical Advice Agent */
export function runPracticalAdviceAgent(body: string): AgentReviewResult {
  const findings: string[] = [];
  const recommendations: string[] = [];
  let score = 90;
  const actionable = countMatches(body, /\b(try|start with|watch for|pack|ask|consider|practice|offer|give|choose)\b/gi);
  if (actionable < 3) {
    score -= 15;
    findings.push("Too few actionable steps.");
    recommendations.push("Add concrete next steps the owner can try this week.");
  }
  if (/\b(just be consistent|simply love your dog|it depends)\b/i.test(body) && actionable < 4) {
    score -= 8;
    findings.push("Advice is vague in places.");
  }
  if (!/\b(for example|for instance|one approach|such as)\b/i.test(body)) {
    score -= 6;
    findings.push("Missing realistic examples.");
    recommendations.push("Add one short, realistic example without inventing a named client.");
  }
  return {
    agentName: "practical_advice",
    ok: score >= 80,
    score: Math.max(0, score),
    findings,
    recommendations,
    output: { actionableCount: actionable }
  };
}

/** Natural Voice Evaluator — does not rewrite; scores only. */
export function runNaturalVoiceAgent(body: string, title: string, previousOpenings: string[] = []): AgentReviewResult {
  const human = scoreHumanEditorialQuality({ title, body, previousOpenings });
  const findings = human.deductions.map((d) => d.reason);
  const recommendations: string[] = [];
  if (startsWithGenericQuestion(body)) recommendations.push("Rewrite the opening without a generic question.");
  if (findBannedPhrases(body).length) recommendations.push("Remove banned filler phrases.");
  if (containsFakeStoryPattern(body)) recommendations.push("Remove fabricated story patterns.");
  recommendations.push(...human.readAloudNotes);

  return {
    agentName: "natural_voice_evaluator",
    ok: human.naturalVoiceScore >= 85,
    score: human.naturalVoiceScore,
    findings,
    recommendations,
    output: { deductions: human.deductions, readAloudNotes: human.readAloudNotes }
  };
}

/** Fact-check / safety heuristics (blocks unsupported medical/legal leaps). */
export function runFactCheckAgent(body: string): AgentReviewResult {
  const findings: string[] = [];
  const recommendations: string[] = [];
  const claims: Array<{ text: string; classification: string }> = [];
  let score = 95;
  let requiresManual = false;

  const sensitive =
    /\b(medication|supplement|diagnos|emergency|ESA|service animal|dog bite|liability|California law|prescribe|cure|toxic dose)\b/i.test(
      body
    );
  if (sensitive) {
    requiresManual = true;
    score -= 5;
    findings.push("Contains medical, legal, or high-risk guidance that requires manual approval.");
    recommendations.push("Keep Super Admin / qualified review before publish.");
    claims.push({ text: "Sensitive topic detected", classification: "needs_professional_review" });
  }

  if (/\b\d+%\b/.test(body) || /\bstudy (shows|found|proves)\b/i.test(body)) {
    score -= 20;
    findings.push("Contains statistics or study claims that were not verified in research records.");
    claims.push({ text: "Unverified statistic/study language", classification: "unsupported" });
  }
  if (/\b(according to Dr\.|veterinarians say|experts agree)\b/i.test(body)) {
    score -= 15;
    findings.push("Appeals to unnamed authority.");
    claims.push({ text: "Unnamed authority", classification: "unsupported" });
  }

  const ok = !findings.some((f) => /unsupported|statistic/i.test(f));
  return {
    agentName: "fact_check_safety",
    ok,
    score: Math.max(0, score),
    findings,
    recommendations,
    output: { claims, requiresManualApproval: requiresManual || !ok }
  };
}

/** Brand voice check */
export function runBrandVoiceAgent(body: string): AgentReviewResult {
  const findings: string[] = [];
  const recommendations: string[] = [];
  let score = 92;
  const fitdog = countMatches(body, /\bfitdog\b/gi);
  if (fitdog > 8) {
    score -= 12;
    findings.push("Fitdog promotion feels forced.");
  }
  if (/\b(amazing|exceptional|unmatched|premium|one-stop shop|the best)\b/i.test(body)) {
    score -= 10;
    findings.push("Corporate / exaggerated marketing language.");
    recommendations.push("Show value through practical advice instead of superlatives.");
  }
  if (findBannedPhrases(body).length) {
    score -= 8;
    findings.push("Banned brand phrases present.");
  }
  return {
    agentName: "brand_voice",
    ok: score >= 80,
    score: Math.max(0, score),
    findings,
    recommendations,
    output: { fitdogMentions: fitdog }
  };
}

/** SEO recommendations without inventing rankings */
export function runSeoAgent(input: {
  title: string;
  body: string;
  primaryKeyword?: string;
  slug?: string;
}): AgentReviewResult {
  const findings: string[] = [];
  const recommendations: string[] = [];
  let score = 90;
  const keyword = (input.primaryKeyword || "").trim().toLowerCase();
  if (keyword) {
    const density = countMatches(input.body.toLowerCase(), new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"));
    if (density === 0) {
      score -= 5;
      recommendations.push("Primary keyword is absent; add it naturally once if it fits.");
    }
    if (density > 12) {
      score -= 15;
      findings.push("Possible keyword stuffing.");
    }
  }
  if (input.title.length > 70) {
    score -= 4;
    recommendations.push("Shorten the title for clearer SERP display.");
  }
  if (!input.slug || input.slug.length > 80) {
    recommendations.push("Keep the slug short and readable.");
  }
  recommendations.push("Never invent rankings; connect Search Console only for verified metrics.");
  return {
    agentName: "seo",
    ok: score >= 75,
    score: Math.max(0, score),
    findings,
    recommendations,
    output: {
      recommendedSlug: input.slug,
      note: "SEO suggestions only — no fabricated rankings."
    }
  };
}

/** Social package — platform-specific, no engagement bait */
export function buildSocialPackage(title: string, excerpt: string, takeaway: string) {
  const base = takeaway || excerpt || title;
  return {
    instagram: `${base}\n\nSave this for the next time the question comes up.`,
    facebook: `${title}\n\n${base}`,
    googleBusiness: `${title} — ${excerpt}`.slice(0, 280),
    linkedin: `A practical note for dog owners and care teams:\n\n${base}`,
    x: `${title}`.slice(0, 240),
    newsletter: `This week: ${title}. ${excerpt}`.slice(0, 220),
    emailTeaser: excerpt.slice(0, 140),
    smsTeaser: `${title}`.slice(0, 120),
    storySlides: [
      title,
      takeaway || "One practical takeaway for your dog this week.",
      "Read the full article on the Fitdog blog."
    ],
    headlineHooks: [title, takeaway, `A calmer approach to: ${title}`].filter(Boolean).slice(0, 5),
    conversationPrompts: [
      "What has helped your dog with this?",
      "Which part feels hardest in your routine?"
    ],
    hashtags: ["#Fitdog", "#DogCare", "#SantaMonicaDogs", "#DogTraining", "#DogDaycare"]
  };
}

/** Final human-quality gate using independent scorer */
export function runFinalHumanQualityAgent(input: {
  title: string;
  body: string;
  excerpt?: string;
  previousOpenings?: string[];
  threshold: number;
}): AgentReviewResult & { humanScore: ReturnType<typeof scoreHumanEditorialQuality> } {
  const humanScore = scoreHumanEditorialQuality({
    title: input.title,
    body: input.body,
    excerpt: input.excerpt,
    previousOpenings: input.previousOpenings
  });
  const checklist = [
    "Would a real dog owner find this helpful?",
    "Does it show genuine care?",
    "Does it sound natural when read aloud?",
    "Is Fitdog promotion natural or absent?",
    "Would a Fitdog employee attach their name to this?"
  ];
  return {
    agentName: "final_human_quality",
    ok: humanScore.score >= input.threshold,
    score: humanScore.score,
    findings: humanScore.deductions.map((d) => `${d.code}: ${d.reason} (−${d.points})`),
    recommendations: humanScore.score >= input.threshold ? [] : ["Rewrite or request human editorial changes before approval."],
    output: { checklist, threshold: input.threshold },
    humanScore
  };
}
