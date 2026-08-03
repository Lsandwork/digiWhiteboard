import { GoogleGenerativeAI } from "@google/generative-ai";
import { geminiModelRetryChain, isGeminiModelNotFoundError, resolveGeminiModel } from "@/lib/hr/gemini-config";
import { isRufflyAiEnabled } from "@/lib/ruffly/flags";
import { FITDOG_BOOKING, fitdogBookingKnowledgeContent } from "@/lib/ruffly/knowledge/booking-links";
import { RUFFLY_STARTER_KNOWLEDGE_ARTICLES } from "@/lib/ruffly/knowledge/starter-articles";
import { getServiceSupabase } from "@/lib/supabase/server";

export type WebchatKnowledgeArticle = {
  title: string;
  category: string;
  content: string;
  source?: string | null;
};

export type WebchatReplyResult = {
  reply: string;
  handoff: boolean;
  reason?: string;
  usedAi: boolean;
  matchedTitles: string[];
};

const BOOKING_KNOWLEDGE_ARTICLE: WebchatKnowledgeArticle = {
  title: "How to book and sign up — Fitdog links",
  category: "Onboarding",
  content: fitdogBookingKnowledgeContent(),
  source: FITDOG_BOOKING.assessmentUrl
};

function withBookingKnowledge(articles: WebchatKnowledgeArticle[]): WebchatKnowledgeArticle[] {
  const withoutStale = articles.filter((article) => !/how to book and sign up/i.test(article.title));
  return [BOOKING_KNOWLEDGE_ARTICLE, ...withoutStale];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function scoreArticle(message: string, article: WebchatKnowledgeArticle): number {
  const haystack = `${article.title} ${article.category} ${article.content}`.toLowerCase();
  const tokens = tokenize(message);
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += 1;
  }
  const lower = message.toLowerCase();
  if (/\b(hours?|open|close|when.*(open|close)|business hours)\b/.test(lower) && /hour|7:00|8:00|daily/.test(haystack)) {
    score += 8;
  }
  if (/\b(address|where|location|parking)\b/.test(lower) && /1712|santa monica|address/.test(haystack)) {
    score += 8;
  }
  if (/\b(price|pricing|cost|rate|how much)\b/.test(lower) && /\$|pricing|rate/.test(haystack)) {
    score += 8;
  }
  if (/\b(daycare|day care)\b/.test(lower) && /daycare/.test(haystack)) score += 4;
  if (/\b(board|boarding|overnight)\b/.test(lower) && /board/.test(haystack)) score += 4;
  if (/\b(groom|grooming|bath|haircut)\b/.test(lower) && /groom/.test(haystack)) score += 4;
  if (/\b(train|training|consult)\b/.test(lower) && /train|consult/.test(haystack)) score += 4;
  if (
    /\b(schedule|book|sign.?up|assessment|tour|account|sports|beach|hike|adventure|class(?:es)?)\b/.test(lower) &&
    /assessment|signup|sign-up|consult|sports|gingrapp|app\.fitdog/.test(haystack)
  ) {
    score += 10;
  }
  return score;
}

export function selectRelevantArticles(
  message: string,
  articles: WebchatKnowledgeArticle[],
  limit = 4
): WebchatKnowledgeArticle[] {
  return articles
    .map((article) => ({ article, score: scoreArticle(message, article) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.article);
}

export async function loadPublishedKnowledgeArticles(): Promise<WebchatKnowledgeArticle[]> {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("ruffly_knowledge_articles")
      .select("title, category, content, source")
      .eq("status", "published")
      .eq("customer_visible", true)
      .order("updated_at", { ascending: false })
      .limit(40);
    if (!error && data?.length) {
      return withBookingKnowledge(
        data.map((row) => ({
          title: String(row.title),
          category: String(row.category),
          content: String(row.content || ""),
          source: row.source ? String(row.source) : null
        }))
      );
    }
  } catch {
    // fall through to starter pack
  }
  return withBookingKnowledge(
    RUFFLY_STARTER_KNOWLEDGE_ARTICLES.map((article) => ({
      title: article.title,
      category: article.category,
      content: article.content,
      source: article.source
    }))
  );
}

const SERVICE_OR_TOPIC_WORDS =
  /\b(daycare|day\s*care|board(?:ing)?|groom(?:ing)?|train(?:ing)?|consult|sports?|beach|hike|adventure|hours?|pricing|price|cost|rates?|tour|assessment|schedule|book|sign.?up|account|location|address|parking|taxi|walks?|class(?:es)?|both)\b/i;

const NON_NAME_PHRASES =
  /\b(i said|you said|just said|like i said|yes|yeah|yep|yup|no|nope|ok|okay|thanks|thank you|please|help|info|information|tell me|more|that one|the first|option|both|what|huh|confused)\b/i;

function looksLikeNameIntro(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length > 80 || trimmed.length < 2) return false;
  if (/[?]/.test(trimmed)) return false;
  if (SERVICE_OR_TOPIC_WORDS.test(trimmed) || NON_NAME_PHRASES.test(trimmed)) return false;

  if (/\b(my name is|i'?m|this is|dog'?s name is|my dog is)\b/i.test(trimmed)) {
    return true;
  }

  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 5) return false;
  if (!/^[A-Za-z][A-Za-z\s'-]+$/.test(trimmed)) return false;
  const titleCaseCount = tokens.filter((token) => /^[A-Z][a-zA-Z'-]*$/.test(token)).length;
  return titleCaseCount >= 2;
}

function recentAssistantText(recentTurns?: Array<{ role: "user" | "assistant"; text: string }>) {
  return (recentTurns || [])
    .filter((turn) => turn.role === "assistant")
    .slice(-3)
    .map((turn) => turn.text)
    .join(" \n ");
}

function recentUserText(recentTurns?: Array<{ role: "user" | "assistant"; text: string }>) {
  return (recentTurns || [])
    .filter((turn) => turn.role === "user")
    .slice(-3)
    .map((turn) => turn.text)
    .join(" \n ");
}

function assessmentAndSignupReply(label = "daycare/boarding") {
  return `For ${label}, start with the ${FITDOG_BOOKING.assessmentFee} assessment here: ${FITDOG_BOOKING.assessmentUrl}. It includes ${FITDOG_BOOKING.assessmentIncludes}. After that, create your club account at ${FITDOG_BOOKING.clubSignupUrl}`;
}

/** Reject Gemini outputs that leak prompts or talk about the customer in third person. */
export function isUnsafeWebchatReply(text: string): boolean {
  const value = String(text || "").trim();
  if (!value || value.length < 8) return true;
  if (/^(customer|ruffly|fitdog|assistant|user)\s*:/i.test(value)) return true;
  if (/\b(customer|user)\s*:/i.test(value)) return true;
  if (/\b(meaning they|they are interested|the customer (said|wants|asked)|as an ai|language model)\b/i.test(value)) {
    return true;
  }
  if (/^\*+\s*/.test(value) || /```/.test(value)) return true;
  if (/["“]how much is\b/i.test(value) && value.length < 80) return true;
  if (/\bKNOWLEDGE PACK\b|\bRECENT CHAT\b|\bRUFFLY:\b/i.test(value)) return true;
  return false;
}

export function sanitizeWebchatReply(text: string): string | null {
  let value = String(text || "")
    .replace(/^RUFFLY:\s*/i, "")
    .replace(/^Fitdog:\s*/i, "")
    .trim();
  if (isUnsafeWebchatReply(value)) return null;
  // Drop accidental leading bullets / quote wrappers
  value = value.replace(/^[-*]\s+/, "").replace(/^["']|["']$/g, "").trim();
  if (isUnsafeWebchatReply(value)) return null;
  return value;
}

function contextualFollowUpReply(
  message: string,
  recentTurns?: Array<{ role: "user" | "assistant"; text: string }>
): string | null {
  const lower = message.toLowerCase().replace(/\s+/g, " ").trim();
  const priorBot = recentAssistantText(recentTurns).toLowerCase();
  const priorUser = recentUserText(recentTurns).toLowerCase();
  const short = lower.length <= 40;

  if (!short && !/^(both|yes|yeah|yep|yup|ok|okay|sure|that|those|what|huh|confused)\b/.test(lower)) {
    return null;
  }

  const confused = /^(what\??|huh\??|come again\??|confused|say that again\??)$/i.test(lower);
  if (confused) {
    return `Sorry about that — I can help with daycare, boarding, grooming, training, or sports. For daycare/boarding, book the ${FITDOG_BOOKING.assessmentFee} assessment here: ${FITDOG_BOOKING.assessmentUrl}`;
  }

  const askedWhichService = /which service|looking at|daycare|boarding|grooming/.test(priorBot);
  const mentionedPricing = /\$|pricing|rate|assessment/.test(priorBot);
  const both =
    /\bboth\b/.test(lower) ||
    /\bdaycare\b/.test(lower) && /\bboard/.test(lower) ||
    (/\byes\b|\byeah\b|\bsure\b|\bok\b/.test(lower) && askedWhichService);

  if (both && (askedWhichService || mentionedPricing || /daycare|board/.test(priorUser))) {
    return assessmentAndSignupReply("daycare and boarding");
  }

  if (/\bdaycare\b/.test(lower) && (askedWhichService || mentionedPricing)) {
    return assessmentAndSignupReply("daycare");
  }

  if (/\bboard/.test(lower) && (askedWhichService || mentionedPricing)) {
    return assessmentAndSignupReply("boarding");
  }

  if (/\bgroom/.test(lower) && (askedWhichService || mentionedPricing)) {
    return `For grooming, create a Fitdog account here: ${FITDOG_BOOKING.clubSignupUrl}. Want the desk to estimate a package for your dog’s coat?`;
  }

  if ((/\byes\b|\byeah\b|\bsure\b|\bok\b|\bplease\b/.test(lower) || lower === "link") && /assessment|book|link|schedule/.test(priorBot)) {
    return assessmentAndSignupReply("daycare/boarding");
  }

  return null;
}

function deterministicReply(
  message: string,
  articles: WebchatKnowledgeArticle[],
  recentTurns?: Array<{ role: "user" | "assistant"; text: string }>
): string | null {
  const contextual = contextualFollowUpReply(message, recentTurns);
  if (contextual) return contextual;

  const lower = message.toLowerCase().replace(/\bi said\b/g, " ").replace(/\s+/g, " ").trim();
  const hours = articles.find((a) => /hour|location|about fitdog/i.test(a.title));
  const daycare = articles.find((a) => /daycare/i.test(a.title));
  const boarding = articles.find((a) => /board/i.test(a.title));
  const grooming = articles.find((a) => /groom/i.test(a.title));
  const pricing = articles.find((a) => /pric/i.test(a.title));

  const wantsSports = /\b(sports?|beach|adventure|hike|hiking|excursion|group class(?:es)?)\b/.test(lower);
  const wantsAssessment = /\b(assessment|tour|evaluate|temperament)\b/.test(lower);
  const wantsSignup = /\b(sign\s*up|signup|create (an )?account|new (customer|account)|register)\b/.test(lower);
  const wantsSchedule = /\b(schedule|book|booking|reserve|set up|get started|how (do|to) join|start)\b/.test(lower);

  if (/\b(hours?|open|close|business hours|when are you)\b/.test(lower) && hours) {
    return `We're typically open 7:00 a.m. to 8:00 p.m. daily at 1712 21st St, Santa Monica. Want help with daycare, boarding, or booking an assessment?`;
  }

  if (/\b(address|where are you|location|directions)\b/.test(lower) && hours) {
    return `We're at 1712 21st St, Santa Monica, CA 90404. Phone is (310) 828-3647 if you'd rather call. What were you hoping to set up?`;
  }

  if (wantsSports) {
    return `For Sports like beach excursions, adventure hikes, and group classes, sign up here: ${FITDOG_BOOKING.sportsSignupUrl}`;
  }

  if (/\b(train(?:ing)?|consult)\b/.test(lower)) {
    if (/\b(private train|private training)\b/.test(lower) && wantsSignup) {
      return `For a private training account, sign up here: ${FITDOG_BOOKING.clubSignupUrl}. Free training consults are at ${FITDOG_BOOKING.trainingConsultUrl}`;
    }
    return `Training consults are free — schedule here: ${FITDOG_BOOKING.trainingConsultUrl}. If you want group classes, beach trips, or adventure hikes instead, use ${FITDOG_BOOKING.sportsSignupUrl}`;
  }

  if (
    wantsAssessment ||
    ((wantsSchedule || wantsSignup) && /\b(daycare|day\s*care|board(?:ing)?)\b/.test(lower))
  ) {
    return assessmentAndSignupReply("daycare/boarding");
  }

  if (wantsSignup && /\b(groom(?:ing)?|private train)\b/.test(lower)) {
    return `You can create a Fitdog account for grooming or private training here: ${FITDOG_BOOKING.clubSignupUrl}`;
  }

  if (wantsSignup) {
    return `Club account (daycare, boarding, grooming, private training): ${FITDOG_BOOKING.clubSignupUrl}. Sports / group classes / beach / hikes: ${FITDOG_BOOKING.sportsSignupUrl}. New to daycare or boarding? Start with the assessment: ${FITDOG_BOOKING.assessmentUrl}`;
  }

  if (/\b(price|pricing|cost|how much|rate)\b/.test(lower) && (pricing || daycare)) {
    if (/\b(assessment|tour)\b/.test(lower)) {
      return `Assessments are ${FITDOG_BOOKING.assessmentFee} and include ${FITDOG_BOOKING.assessmentIncludes}. Book here: ${FITDOG_BOOKING.assessmentUrl}`;
    }
    if (/\b(daycare|day\s*care)\b/.test(lower) && /\bboard/.test(lower)) {
      return `Daycare is about $15/hr or $49/full day, and boarding is about $70–80/night. Both start with the same ${FITDOG_BOOKING.assessmentFee} assessment: ${FITDOG_BOOKING.assessmentUrl}`;
    }
    if (/\b(daycare|day\s*care)\b/.test(lower)) {
      return `Published daycare rates: hourly $15, half day $37, full day $49. New dogs start with a ${FITDOG_BOOKING.assessmentFee} assessment: ${FITDOG_BOOKING.assessmentUrl}`;
    }
    if (/\bboard/.test(lower)) {
      return `Boarding is about $70–80/night. New dogs start with a ${FITDOG_BOOKING.assessmentFee} assessment: ${FITDOG_BOOKING.assessmentUrl}`;
    }
    return `Happy to help with pricing — daycare starts around $15/hr or $49/full day, boarding about $70–80/night, and grooming packages vary by coat. Assessments are ${FITDOG_BOOKING.assessmentFee}. Which service are you looking at?`;
  }

  if (/\b(daycare|day\s*care)\b/.test(lower) && /\bboard/.test(lower)) {
    return assessmentAndSignupReply("daycare and boarding");
  }

  if (/\b(daycare|day\s*care)\b/.test(lower) && daycare) {
    return `Daycare is open play with enrichment, report cards, and live webcams. New dogs book a ${FITDOG_BOOKING.assessmentFee} assessment first (${FITDOG_BOOKING.assessmentIncludes}): ${FITDOG_BOOKING.assessmentUrl}. After that, create your account at ${FITDOG_BOOKING.clubSignupUrl}`;
  }

  if (/\b(board(?:ing)?|overnight)\b/.test(lower) && boarding) {
    return `Boarding includes open-play daycare, a daily group walk, and a private sleeping space (about $70–80/night). New dogs need the same ${FITDOG_BOOKING.assessmentFee} assessment: ${FITDOG_BOOKING.assessmentUrl}. Club signup: ${FITDOG_BOOKING.clubSignupUrl}`;
  }

  if (/\b(groom(?:ing)?|bath|haircut)\b/.test(lower) && grooming) {
    return `We offer full-service grooming — baths, cut & style, nail trims, and spa packages (price depends on coat/breed). Create a Fitdog account here: ${FITDOG_BOOKING.clubSignupUrl}. Want the desk to give you an estimate?`;
  }

  if (/\b(tour|assessment|how (do|to) join|get started)\b/.test(lower)) {
    return assessmentAndSignupReply("daycare/boarding");
  }

  if (looksLikeNameIntro(message)) {
    return `Thanks — got it. How can I help you and your pup today? Daycare, boarding, grooming, training, or sports?`;
  }

  if (/\b(hi|hello|hey)\b/.test(lower) && lower.length < 24) {
    return `Hey! Welcome to Fitdog. I can help with hours, daycare, boarding, grooming, training, sports, or getting an assessment booked. What do you need?`;
  }

  return null;
}

async function geminiGroundedReply(input: {
  message: string;
  articles: WebchatKnowledgeArticle[];
  recentTurns?: Array<{ role: "user" | "assistant"; text: string }>;
}): Promise<string | null> {
  if (!isRufflyAiEnabled()) return null;
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || !input.articles.length) return null;

  // Short / vague messages are unsafe for the model — use deterministic/context paths instead.
  if (input.message.trim().length < 12) return null;

  const knowledgeBlock = input.articles
    .map((article, index) => `[${index + 1}] ${article.title}\n${article.content}`)
    .join("\n\n---\n\n");

  const historyBlock = (input.recentTurns || [])
    .slice(-4)
    .map((turn) => `${turn.role === "user" ? "Customer" : "Fitdog"}: ${turn.text}`)
    .join("\n");

  const prompt = [
    "You are Ruffly, Fitdog Customer Care in Santa Monica.",
    "Reply ONLY as the Fitdog teammate speaking directly to the customer.",
    "Never narrate, summarize, or talk about the customer in third person.",
    "Never output labels like Customer:, Fitdog:, RUFFLY:, or quote the chat log.",
    "Never claim to be a human person. Do not say you are an AI unless asked.",
    "ONLY use facts from the knowledge pack below. If the answer is not there, say you'll get a teammate to follow up — do not invent prices, availability, medical advice, or policies.",
    "When owners ask how to book, schedule, assess, or sign up, include the exact URLs from the knowledge pack.",
    "Keep replies to 1–3 short sentences.",
    "",
    "KNOWLEDGE PACK:",
    knowledgeBlock,
    "",
    historyBlock ? `RECENT CHAT (context only — do not copy this format):\n${historyBlock}\n` : "",
    `Customer message: ${input.message}`,
    "Your reply:"
  ].join("\n");

  const models = geminiModelRetryChain(resolveGeminiModel());
  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError: unknown;

  for (let i = 0; i < models.length; i += 1) {
    const modelName = models[i]!;
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.35, maxOutputTokens: 180 }
      });
      const result = await model.generateContent(prompt);
      const text = sanitizeWebchatReply(result.response.text() || "");
      if (text) return text;
    } catch (error) {
      lastError = error;
      if (i < models.length - 1 && isGeminiModelNotFoundError(error)) continue;
      break;
    }
  }

  if (lastError) {
    console.error("[ruffly-webchat] Gemini reply failed", lastError);
  }
  return null;
}

export async function craftWebchatReply(input: {
  message: string;
  recentTurns?: Array<{ role: "user" | "assistant"; text: string }>;
  forceHandoff?: { handoff: boolean; reason?: string };
}): Promise<WebchatReplyResult> {
  if (input.forceHandoff?.handoff) {
    return {
      reply:
        "I want to make sure you get the right help on that — I'm looping in a Fitdog teammate now. Someone will follow up shortly.",
      handoff: true,
      reason: input.forceHandoff.reason,
      usedAi: false,
      matchedTitles: []
    };
  }

  const articles = await loadPublishedKnowledgeArticles();
  const matched = selectRelevantArticles(input.message, articles, 4);
  const corpus = matched.length ? matched : articles.slice(0, 3);

  const quick = deterministicReply(input.message, articles, input.recentTurns);
  if (quick) {
    return {
      reply: quick,
      handoff: false,
      usedAi: false,
      matchedTitles: matched.map((article) => article.title)
    };
  }

  const aiText = await geminiGroundedReply({
    message: input.message,
    articles: corpus,
    recentTurns: input.recentTurns
  });
  if (aiText) {
    return {
      reply: aiText,
      handoff: false,
      usedAi: true,
      matchedTitles: corpus.map((article) => article.title)
    };
  }

  return {
    reply: `Happy to help — I can cover hours, daycare, boarding, grooming, training, and sports. For daycare/boarding, book the ${FITDOG_BOOKING.assessmentFee} assessment here: ${FITDOG_BOOKING.assessmentUrl}`,
    handoff: false,
    usedAi: false,
    matchedTitles: matched.map((article) => article.title)
  };
}
