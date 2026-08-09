import { generateBlogText } from "@/lib/blog/ai/gateway";
import { BANNED_FILLER_PHRASES } from "@/lib/blog/constants";
import { scoreHumanEditorialQuality } from "@/lib/blog/editorial/human-score";
import { markdownToSimpleHtml } from "@/lib/blog/utils/markdown";
import { slugifyBlogTitle } from "@/lib/blog/utils/slug";

export { markdownToSimpleHtml };

export type DraftBrief = {
  title: string;
  audience: string;
  readerConcern: string;
  primaryTakeaway: string;
  angle: string;
  tonePreset: string;
  primaryKeyword?: string;
  localRelevance?: string;
  fitdogConnection?: string;
  questionsToAnswer?: string[];
  /** Real photo scenes the draft must make sense with (never AI art). */
  photoContext?: string;
  photoRules?: string[];
};

export type DraftPipelineResult = {
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  bodyHtml: string;
  seoTitle: string;
  metaDescription: string;
  coverAlt?: string;
  humanScore: ReturnType<typeof scoreHumanEditorialQuality>;
  usedAi: boolean;
  provider?: string;
  model?: string;
  estimatedCostCents: number;
  agentNotes: string[];
};

function deterministicDraft(brief: DraftBrief): { markdown: string; excerpt: string } {
  const local = brief.localRelevance ? ` For owners around ${brief.localRelevance}, this comes up often.` : "";
  const fitdog =
    brief.fitdogConnection && brief.fitdogConnection.trim()
      ? `\n\nIf you want hands-on support with this, Fitdog can help through ${brief.fitdogConnection.trim()} — only when it fits your dog’s needs.`
      : "";
  const photoBridge = brief.photoContext?.includes("Real Fitdog")
    ? `\n\n## What a real day can look like\n\nThe photos with this post are real Fitdog moments from our Digi Board library — not staged AI art. Use them as a reminder that progress usually looks ordinary: supervised play, clear routines, and dogs learning at their own pace.`
    : brief.photoContext
      ? `\n\n## Keep the picture honest\n\nThe images paired with this article are real photographs (licensed), not AI-generated. Match your expectations to what you can actually see in a normal dog day — not a perfect stock fantasy.`
      : "";

  const markdown = [
    `${brief.readerConcern.trim() || "Many dog owners run into this at some point."}${local}`,
    ``,
    `## What usually helps`,
    ``,
    brief.primaryTakeaway.trim() || "Focus on practical steps that match your individual dog.",
    ``,
    `## A realistic approach`,
    ``,
    `Start with what you can observe at home. ${brief.angle.trim() || "Keep the plan simple and adjustable."} Not every dog needs the same pace, tools, or amount of social time.`,
    ``,
    `Try one small change for a few days before stacking more. If your dog seems stressed, stop and give them an easier version of the same skill.`,
    photoBridge,
    ``,
    `## When to get extra support`,
    ``,
    `If you are seeing pain signs, sudden behavior changes, or anything that feels unsafe, talk with a veterinarian or a qualified professional. Good advice leaves room for your dog’s personality and history.`,
    fitdog
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  const excerpt = (brief.primaryTakeaway || brief.readerConcern || brief.title).slice(0, 180);
  return { markdown, excerpt };
}

export async function runHumanFirstDraft(brief: DraftBrief): Promise<DraftPipelineResult> {
  const agentNotes: string[] = [];
  let markdown = "";
  let excerpt = "";
  let usedAi = false;
  let provider: string | undefined;
  let model: string | undefined;
  let estimatedCostCents = 0;

  try {
    const bannedList = BANNED_FILLER_PHRASES.slice(0, 40).join("; ");
    const ai = await generateBlogText({
      purpose: "human_first_writer",
      jsonMode: true,
      systemInstruction: [
        "You are the Human-First Writer for Fitdog Automatic Blog.",
        "Write warm, practical, honest advice for dog owners.",
        "Never invent stories, quotes, staff opinions, client names, statistics, or studies.",
        "Do not sound like a content machine. Avoid filler phrases.",
        `Never use: ${bannedList}`,
        "Do not start with Have you ever wondered / Are you looking for / Did you know / Imagine this.",
        "Acknowledge that every dog is different.",
        "Mention Fitdog only if it naturally helps, and keep promotion light.",
        "REAL PHOTOS ONLY: Cover and supporting images are real photography (Fitdog bulk library and/or licensed web photos). Never describe AI art, illustrations, or synthetic dogs.",
        ...(brief.photoRules || []),
        "If photoContext is provided, make the article coherent with those scenes — do not contradict what the photos show, and do not invent extra photo details.",
        "Return JSON: {\"title\":\"\",\"excerpt\":\"\",\"bodyMarkdown\":\"\",\"seoTitle\":\"\",\"metaDescription\":\"\",\"coverAlt\":\"\"}",
        "coverAlt should describe the real cover photo scene accessibly when photoContext exists.",
        "bodyMarkdown should use at most 2-4 headings and feel natural when read aloud."
      ].join("\n"),
      userMessage: JSON.stringify({
        ...brief,
        photoContext: brief.photoContext || "none",
        imagePolicy: "real_photography_only_no_ai"
      })
    });
    usedAi = true;
    provider = ai.provider;
    model = ai.model;
    estimatedCostCents = ai.estimatedCostCents;
    const parsed = JSON.parse(ai.text) as {
      title?: string;
      excerpt?: string;
      bodyMarkdown?: string;
      seoTitle?: string;
      metaDescription?: string;
      coverAlt?: string;
    };
    markdown = String(parsed.bodyMarkdown || "").trim();
    excerpt = String(parsed.excerpt || "").trim();
    if (!markdown) throw new Error("Empty AI draft");
    brief.title = String(parsed.title || brief.title).trim() || brief.title;
    agentNotes.push("Human-First Writer produced an AI-assisted draft.");
    const seoTitle = String(parsed.seoTitle || brief.title);
    const metaDescription = String(parsed.metaDescription || excerpt).slice(0, 160);
    const coverAlt = String(parsed.coverAlt || "").trim() || undefined;
    const humanScore = scoreHumanEditorialQuality({
      title: brief.title,
      body: markdown,
      excerpt
    });
    return {
      title: brief.title,
      slug: slugifyBlogTitle(brief.title),
      excerpt: excerpt || brief.primaryTakeaway.slice(0, 180),
      bodyMarkdown: markdown,
      bodyHtml: markdownToSimpleHtml(markdown),
      seoTitle,
      metaDescription,
      coverAlt,
      humanScore,
      usedAi,
      provider,
      model,
      estimatedCostCents,
      agentNotes
    };
  } catch (error) {
    agentNotes.push(
      `AI draft unavailable (${error instanceof Error ? error.message : "error"}); used deterministic editorial template.`
    );
    const fallback = deterministicDraft(brief);
    markdown = fallback.markdown;
    excerpt = fallback.excerpt;
  }

  const humanScore = scoreHumanEditorialQuality({
    title: brief.title,
    body: markdown,
    excerpt
  });

  return {
    title: brief.title,
    slug: slugifyBlogTitle(brief.title),
    excerpt,
    bodyMarkdown: markdown,
    bodyHtml: markdownToSimpleHtml(markdown),
    seoTitle: brief.title,
    metaDescription: excerpt.slice(0, 160),
    coverAlt: brief.photoContext?.includes("Real Fitdog")
      ? "Real Fitdog daycare photo from the Digi Board library"
      : undefined,
    humanScore,
    usedAi,
    provider,
    model,
    estimatedCostCents,
    agentNotes
  };
}
