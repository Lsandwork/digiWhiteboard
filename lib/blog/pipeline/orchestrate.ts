import {
  buildSocialPackage,
  runBrandVoiceAgent,
  runEmpathyAgent,
  runFactCheckAgent,
  runFinalHumanQualityAgent,
  runNaturalVoiceAgent,
  runPracticalAdviceAgent,
  runSeoAgent,
  type AgentReviewResult
} from "@/lib/blog/agents/reviews";
import { DEFAULT_HUMAN_SCORE_THRESHOLD } from "@/lib/blog/constants";
import { runHumanFirstDraft, type DraftBrief } from "@/lib/blog/pipeline/draft-article";

export type OrchestrationResult = {
  draft: Awaited<ReturnType<typeof runHumanFirstDraft>>;
  reviews: AgentReviewResult[];
  socialPackage: ReturnType<typeof buildSocialPackage>;
  blocked: boolean;
  blockReasons: string[];
};

export async function orchestrateArticleGeneration(input: {
  brief: DraftBrief;
  threshold?: number;
  previousOpenings?: string[];
}): Promise<OrchestrationResult> {
  const threshold = input.threshold ?? DEFAULT_HUMAN_SCORE_THRESHOLD;
  const draft = await runHumanFirstDraft(input.brief);
  const body = draft.bodyMarkdown;

  const empathy = runEmpathyAgent(body, input.brief.readerConcern);
  const practical = runPracticalAdviceAgent(body);
  const natural = runNaturalVoiceAgent(body, draft.title, input.previousOpenings);
  const fact = runFactCheckAgent(body);
  const brand = runBrandVoiceAgent(body);
  const seo = runSeoAgent({
    title: draft.title,
    body,
    primaryKeyword: input.brief.primaryKeyword,
    slug: draft.slug
  });
  const finalGate = runFinalHumanQualityAgent({
    title: draft.title,
    body,
    excerpt: draft.excerpt,
    previousOpenings: input.previousOpenings,
    threshold
  });

  // Prefer independent final score over writer-attached score.
  draft.humanScore = finalGate.humanScore;
  draft.agentNotes.push(
    `Empathy ${empathy.score}; Practical ${practical.score}; Natural voice ${natural.score}; Fact-check ${fact.score}; Brand ${brand.score}; Final ${finalGate.score}.`
  );

  const reviews: AgentReviewResult[] = [empathy, practical, natural, fact, brand, seo, finalGate];
  const blockReasons: string[] = [];
  if (!finalGate.ok) blockReasons.push(`Human Editorial Score ${finalGate.score} below ${threshold}.`);
  if (!fact.ok) blockReasons.push("Unsupported or high-risk claims require changes.");
  if (!empathy.ok) blockReasons.push("Empathy review failed.");
  if (!natural.ok) blockReasons.push("Natural voice review failed.");

  return {
    draft,
    reviews,
    socialPackage: buildSocialPackage(draft.title, draft.excerpt, input.brief.primaryTakeaway),
    blocked: blockReasons.length > 0,
    blockReasons
  };
}
