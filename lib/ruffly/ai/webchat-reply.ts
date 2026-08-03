import { GoogleGenerativeAI } from "@google/generative-ai";
import { geminiModelRetryChain, isGeminiModelNotFoundError, resolveGeminiModel } from "@/lib/hr/gemini-config";
import { isRufflyAiEnabled } from "@/lib/ruffly/flags";
import {
  actionsForUrls,
  extractUrls,
  FITDOG_BOOKING,
  FitdogWebchatAction,
  fitdogBookingKnowledgeContent,
  stripUrlsFromReply
} from "@/lib/ruffly/knowledge/booking-links";
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
  displayReply: string;
  actions: FitdogWebchatAction[];
  handoff: boolean;
  reason?: string;
  usedAi: boolean;
  matchedTitles: string[];
  serviceInterest: boolean;
};

type ChatTurn = { role: "user" | "assistant"; text: string };

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

function normalizeMessage(message: string) {
  return message.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Remove negated phrases so "no daycare" does not count as wanting daycare. */
function stripNegatedPhrases(lower: string) {
  return lower
    .replace(/\b(no|not|never|dont|don't|do not|without)\s+(daycare|day care|boarding|board|grooming|groom|training|train|sports?|assessment|tour)\b/gi, " ")
    .replace(/\b(daycare|day care|boarding|board|grooming|groom|training|train|sports?)\s+(no|not)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  if (/\b(hours?|open|close|business hours)\b/.test(lower) && /hour|7:00|8:00|daily/.test(haystack)) score += 8;
  if (/\b(address|where|location|parking)\b/.test(lower) && /1712|santa monica|address/.test(haystack)) score += 8;
  if (/\b(style|culture|vibe|policies|policy|about fitdog)\b/.test(lower) && /style|policy|webcam|open play|full-service/.test(haystack)) {
    score += 10;
  }
  if (/\b(price|pricing|cost|rate|how much)\b/.test(lower) && /\$|pricing|rate/.test(haystack)) score += 8;
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

export function selectRelevantArticles(message: string, articles: WebchatKnowledgeArticle[], limit = 4) {
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
    // fall through
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
  /\b(i said|you said|yes|yeah|yep|yup|no|nope|ok|okay|thanks|thank you|please|help|info|both|what|huh|confused|sign up)\b/i;

function looksLikeNameIntro(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length > 80 || trimmed.length < 2) return false;
  if (/[?]/.test(trimmed)) return false;
  if (SERVICE_OR_TOPIC_WORDS.test(trimmed) || NON_NAME_PHRASES.test(trimmed)) return false;
  if (/\b(my name is|i'?m|this is|dog'?s name is|my dog is)\b/i.test(trimmed)) return true;
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 5) return false;
  if (!/^[A-Za-z][A-Za-z\s'-]+$/.test(trimmed)) return false;
  return tokens.filter((token) => /^[A-Z][a-zA-Z'-]*$/.test(token)).length >= 2;
}

function conversationMemory(recentTurns?: ChatTurn[]) {
  const priorBot = (recentTurns || [])
    .filter((turn) => turn.role === "assistant")
    .slice(-4)
    .map((turn) => turn.text)
    .join(" ");
  const priorUser = (recentTurns || [])
    .filter((turn) => turn.role === "user")
    .slice(-4)
    .map((turn) => turn.text)
    .join(" ");
  const all = `${priorUser} ${priorBot}`.toLowerCase();
  return {
    priorBot: priorBot.toLowerCase(),
    priorUser: priorUser.toLowerCase(),
    discussedDaycare: /\bdaycare\b/.test(all),
    discussedBoarding: /\bboard/.test(all),
    discussedPricing: /\$|pricing|rate|how much/.test(all),
    offeredAssessment: /assessment|daycare-assessment/.test(all),
    offeredSignup: /new_customer|sign up|account/.test(all),
    askedWhichService: /which service|looking at/.test(priorBot)
  };
}

function explainDaycare() {
  return `Daycare is open play in our Santa Monica yard with enrichment, daily report cards, and live webcams. Full day is about $49 (half day $37, hourly $15). New dogs start with a ${FITDOG_BOOKING.assessmentFee} assessment (${FITDOG_BOOKING.assessmentIncludes}): ${FITDOG_BOOKING.assessmentUrl}`;
}

function explainBoarding() {
  return `Boarding includes open-play daycare, a daily group walk, and a private sleeping space (about $70–80/night). It’s the same ${FITDOG_BOOKING.assessmentFee} assessment as daycare — one assessment covers both: ${FITDOG_BOOKING.assessmentUrl}`;
}

function explainBoth() {
  return `Yes — one ${FITDOG_BOOKING.assessmentFee} assessment covers both daycare and boarding (${FITDOG_BOOKING.assessmentIncludes}). Book it here: ${FITDOG_BOOKING.assessmentUrl}. After you pass, create your club account at ${FITDOG_BOOKING.clubSignupUrl}`;
}

function signupClubReply(options?: { mentionAssessment?: boolean; mentionSports?: boolean }) {
  const parts = [
    `Create your Fitdog club account here: ${FITDOG_BOOKING.clubSignupUrl}.`,
    "That signup covers daycare, boarding, grooming, and private training."
  ];
  if (options?.mentionSports !== false) {
    parts.push(`For Sports (beach trips, adventure hikes, group classes), use ${FITDOG_BOOKING.sportsSignupUrl}.`);
  }
  if (options?.mentionAssessment) {
    parts.push(
      `If you still need daycare/boarding access, book the ${FITDOG_BOOKING.assessmentFee} assessment at ${FITDOG_BOOKING.assessmentUrl}.`
    );
  }
  return parts.join(" ");
}

function assessmentReply(label: "daycare" | "boarding" | "daycare and boarding" | "daycare/boarding") {
  return `Book the ${FITDOG_BOOKING.assessmentFee} ${label} assessment here: ${FITDOG_BOOKING.assessmentUrl}. It includes ${FITDOG_BOOKING.assessmentIncludes}. Then create your club account at ${FITDOG_BOOKING.clubSignupUrl}`;
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
  // Truncated / cut-off model output (e.g. "We are a full-")
  if (/[-–—]$/.test(value) || /\b(a|the|and|or|with|for|to|of|our|we are)\s*$/i.test(value)) return true;
  return false;
}

export function isServiceInterestMessage(message: string): boolean {
  return /\b(daycare|day care|board(?:ing)?|groom(?:ing)?|train(?:ing)?|sports?|beach|assessment|tour|sign\s*up|pricing|price|how much|both|package|class(?:es)?)\b/i.test(
    message
  );
}

function finalizeReply(reply: string, matchedTitles: string[], usedAi: boolean, extras?: Partial<WebchatReplyResult>): WebchatReplyResult {
  const actions = actionsForUrls(extractUrls(reply));
  return {
    reply,
    displayReply: stripUrlsFromReply(reply) || reply,
    actions,
    handoff: false,
    usedAi,
    matchedTitles,
    serviceInterest: false,
    ...extras
  };
}

export function sanitizeWebchatReply(text: string): string | null {
  let value = String(text || "")
    .replace(/^RUFFLY:\s*/i, "")
    .replace(/^Fitdog:\s*/i, "")
    .trim();
  if (isUnsafeWebchatReply(value)) return null;
  value = value.replace(/^[-*]\s+/, "").replace(/^["']|["']$/g, "").trim();
  if (isUnsafeWebchatReply(value)) return null;
  return value;
}

type Intent =
  | "confused"
  | "hours"
  | "location"
  | "sports"
  | "training"
  | "signup"
  | "assessment"
  | "pricing"
  | "explain_daycare"
  | "explain_boarding"
  | "both_services"
  | "grooming"
  | "style_policies"
  | "name"
  | "greeting"
  | "ack_yes"
  | "ack_both"
  | null;

export function detectWebchatIntent(message: string, recentTurns?: ChatTurn[]): Intent {
  const raw = normalizeMessage(message);
  const active = stripNegatedPhrases(raw);
  const memory = conversationMemory(recentTurns);

  if (/^(what\??|huh\??|come again\??|confused|say that again\??)$/i.test(raw)) return "confused";

  // Ultra-short acknowledgments only — never rewrite full questions from prior assessment mentions.
  if (/^(both|the both|both please)$/i.test(raw)) return "ack_both";
  if (/^(yes|yeah|yep|yup|sure|ok|okay|please|link|that one)$/i.test(raw)) return "ack_yes";

  if (/\b(hours?|open|close|business hours|when are you)\b/.test(active)) return "hours";
  if (/\b(address|where are you|location|directions)\b/.test(active)) return "location";
  if (/\b(style|culture|vibe|policies|policy|about fitdog|how (does|do) fitdog)\b/.test(raw)) return "style_policies";
  if (/\b(sports?|beach|adventure|hike|hiking|excursion|group class(?:es)?)\b/.test(active)) return "sports";
  if (/\b(train(?:ing)?|consult)\b/.test(active)) return "training";

  const wantsSignup = /\b(sign\s*up|signup|create (an )?account|new (customer|account)|register|join fitdog)\b/.test(raw);
  const negatedClubServices =
    /\b(no|not|never|dont|don't|do not)\b/.test(raw) &&
    /\b(daycare|day care|boarding)\b/.test(raw) &&
    wantsSignup;
  // "no daycare/boarding, I want to sign up" → club signup, not assessment.
  if (negatedClubServices) return "signup";
  if (wantsSignup && /\b(groom|private train)/.test(active)) return "signup";
  // Signup for daycare/boarding still needs the assessment first.
  if (wantsSignup && /\b(daycare|day care|board)/.test(active)) return "assessment";
  if (wantsSignup) return "signup";

  const wantsAssessment = /\b(assessment|tour|evaluate|temperament)\b/.test(active);
  const wantsBook =
    /\b(schedule|book|booking|reserve|get started|how (do|to) join|start)\b/.test(active) || wantsAssessment;
  if (wantsBook && (/\b(daycare|day care|board)/.test(active) || wantsAssessment || memory.discussedDaycare || memory.discussedBoarding)) {
    return "assessment";
  }

  if (/\b(price|pricing|cost|how much|rate)\b/.test(active)) return "pricing";

  const asksWhat = /\b(what(?:'s| is| are)?|whats|tell me about|explain|info on)\b/.test(raw) || /^(daycare|boarding|grooming)\??$/.test(raw);
  const hasDaycare = /\b(daycare|day care)\b/.test(active);
  const hasBoarding = /\b(board(?:ing)?|overnight)\b/.test(active);
  const asksBoth =
    /\b(both|either)\b/.test(raw) ||
    (/\b(can i|could i|is it possible)\b/.test(raw) && hasDaycare && hasBoarding) ||
    (hasDaycare && hasBoarding && /\b(and|or)\b/.test(raw) && !wantsSignup);

  if (asksBoth) return "both_services";
  if (hasDaycare && asksWhat) return "explain_daycare";
  if (hasBoarding && asksWhat) return "explain_boarding";
  if (hasDaycare && hasBoarding) return "both_services";
  if (hasDaycare) return "explain_daycare";
  if (hasBoarding) return "explain_boarding";
  if (/\b(groom(?:ing)?|bath|haircut)\b/.test(active)) return "grooming";

  // Short "daycare" / "boarding" after we already explained → move to booking help
  if (/^(daycare|day care)\??$/i.test(raw) && memory.discussedDaycare) return "assessment";
  if (/^(boarding|board)\??$/i.test(raw) && memory.discussedBoarding) return "assessment";

  if (looksLikeNameIntro(message)) return "name";
  if (/\b(hi|hello|hey)\b/.test(raw) && raw.length < 24) return "greeting";
  return null;
}

function replyForIntent(intent: Intent, message: string, recentTurns?: ChatTurn[]): string | null {
  if (!intent) return null;
  const memory = conversationMemory(recentTurns);
  const active = stripNegatedPhrases(normalizeMessage(message));

  switch (intent) {
    case "confused":
      return `Sorry — let’s reset. I can explain daycare/boarding, help you sign up, or book the ${FITDOG_BOOKING.assessmentFee} assessment. What do you want to do?`;
    case "hours":
      return `We're typically open 7:00 a.m. to 8:00 p.m. daily at 1712 21st St, Santa Monica. Want daycare, boarding, or signup next?`;
    case "location":
      return `We're at 1712 21st St, Santa Monica, CA 90404. Phone is (310) 828-3647. What were you hoping to set up?`;
    case "sports":
      return `For Sports like beach excursions, adventure hikes, and group classes, sign up here: ${FITDOG_BOOKING.sportsSignupUrl}`;
    case "training":
      if (/\bprivate\b/.test(active) && /\b(sign|account)\b/.test(active)) {
        return `Private training accounts start here: ${FITDOG_BOOKING.clubSignupUrl}. Free consults: ${FITDOG_BOOKING.trainingConsultUrl}`;
      }
      return `Training consults are free — schedule here: ${FITDOG_BOOKING.trainingConsultUrl}. Group classes / beach / hikes: ${FITDOG_BOOKING.sportsSignupUrl}`;
    case "signup": {
      const raw = normalizeMessage(message);
      const rejectedClubServices =
        /\b(no|not|never|dont|don't|do not)\b/.test(raw) && /\b(daycare|day care|boarding)\b/.test(raw);
      return signupClubReply({
        // If they explicitly said no daycare/boarding, don't push assessment again.
        mentionAssessment:
          !rejectedClubServices && (memory.discussedDaycare || memory.discussedBoarding || memory.offeredAssessment),
        mentionSports: true
      });
    }
    case "assessment":
      if (memory.discussedDaycare && memory.discussedBoarding) return assessmentReply("daycare and boarding");
      if (/\bboard/.test(active) && !/\bdaycare\b/.test(active)) return assessmentReply("boarding");
      if (/\bdaycare\b/.test(active) && !/\bboard/.test(active)) return assessmentReply("daycare");
      return assessmentReply("daycare/boarding");
    case "pricing": {
      if (/\bassessment\b/.test(active)) {
        return `Assessments are ${FITDOG_BOOKING.assessmentFee} and include ${FITDOG_BOOKING.assessmentIncludes}. Book here: ${FITDOG_BOOKING.assessmentUrl}`;
      }
      if (/\bdaycare\b/.test(active) && /\bboard/.test(active)) {
        return `Daycare is about $15/hr or $49/full day; boarding is about $70–80/night. Both use the same ${FITDOG_BOOKING.assessmentFee} assessment: ${FITDOG_BOOKING.assessmentUrl}`;
      }
      if (/\bdaycare\b/.test(active)) {
        return `Daycare rates: hourly $15, half day $37, full day $49. Assessment is ${FITDOG_BOOKING.assessmentFee}: ${FITDOG_BOOKING.assessmentUrl}`;
      }
      if (/\bboard/.test(active)) {
        return `Boarding is about $70–80/night. Assessment is ${FITDOG_BOOKING.assessmentFee}: ${FITDOG_BOOKING.assessmentUrl}`;
      }
      return `Daycare is about $15/hr or $49/full day, boarding about $70–80/night, and grooming varies by coat. Assessments are ${FITDOG_BOOKING.assessmentFee}. Which service are you pricing?`;
    }
    case "explain_daycare":
      return explainDaycare();
    case "explain_boarding":
      return explainBoarding();
    case "both_services":
      return explainBoth();
    case "grooming":
      return `We offer full-service grooming — baths, cut & style, nail trims, and spa packages (price depends on coat/breed). Create your account here: ${FITDOG_BOOKING.clubSignupUrl}`;
    case "style_policies":
      return `Fitdog is a full-service Santa Monica dog club built around open play, enrichment, and transparent care — live webcams and daily report cards for owners. New daycare/boarding dogs complete a ${FITDOG_BOOKING.assessmentFee} assessment first (${FITDOG_BOOKING.assessmentIncludes}). For vaccine lists or special cases, book an assessment or call (310) 828-3647. ${FITDOG_BOOKING.assessmentUrl}`;
    case "name":
      return `Thanks — got it. How can I help you and your pup today? Daycare, boarding, grooming, training, or sports?`;
    case "greeting":
      return `Hey! Welcome to Fitdog. I can explain services, share pricing, book an assessment, or send signup links. What do you need?`;
    case "ack_both":
      if (memory.askedWhichService || memory.discussedPricing || memory.discussedDaycare || memory.discussedBoarding) {
        return explainBoth();
      }
      return explainBoth();
    case "ack_yes":
      if (memory.offeredAssessment || /assessment|book|schedule/.test(memory.priorBot)) {
        return assessmentReply(
          memory.discussedDaycare && memory.discussedBoarding ? "daycare and boarding" : "daycare/boarding"
        );
      }
      if (memory.offeredSignup || /account|sign up|new_customer/.test(memory.priorBot)) {
        return signupClubReply({ mentionAssessment: false });
      }
      if (memory.askedWhichService) return explainBoth();
      return `Great — are you looking to learn about a service, book the assessment, or create a Fitdog account?`;
    default:
      return null;
  }
}

function deterministicReply(message: string, _articles: WebchatKnowledgeArticle[], recentTurns?: ChatTurn[]) {
  const intent = detectWebchatIntent(message, recentTurns);
  return replyForIntent(intent, message, recentTurns);
}

async function geminiGroundedReply(input: {
  message: string;
  articles: WebchatKnowledgeArticle[];
  recentTurns?: ChatTurn[];
}): Promise<string | null> {
  if (!isRufflyAiEnabled()) return null;
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || !input.articles.length) return null;
  if (input.message.trim().length < 12) return null;

  const knowledgeBlock = input.articles
    .map((article, index) => `[${index + 1}] ${article.title}\n${article.content}`)
    .join("\n\n---\n\n");

  const historyBlock = (input.recentTurns || [])
    .slice(-8)
    .map((turn) => `${turn.role === "user" ? "Customer" : "Fitdog"}: ${turn.text}`)
    .join("\n");

  const prompt = [
    "You are Ruffly, Fitdog Customer Care in Santa Monica.",
    "Reply ONLY as the Fitdog teammate speaking directly to the customer.",
    "Use the recent chat for memory — answer follow-ups in context (do not repeat the same canned assessment spiel unless they asked to book).",
    "If they ask what a service is, explain it first. If they want to sign up (and not book an assessment), send the signup URL.",
    "If they say they do NOT want daycare/boarding, do not push the assessment link.",
    "Never narrate or talk about the customer in third person.",
    "Never output labels like Customer:, Fitdog:, RUFFLY:, or quote the chat log.",
    "ONLY use facts from the knowledge pack. Include exact URLs when directing them to book or sign up.",
    "Keep replies to 1–3 complete short sentences. Never cut off mid-word or mid-sentence.",
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
        generationConfig: { temperature: 0.3, maxOutputTokens: 320 }
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

  if (lastError) console.error("[ruffly-webchat] Gemini reply failed", lastError);
  return null;
}

export async function craftWebchatReply(input: {
  message: string;
  recentTurns?: ChatTurn[];
  forceHandoff?: { handoff: boolean; reason?: string };
}): Promise<WebchatReplyResult> {
  const serviceInterest = isServiceInterestMessage(input.message);

  if (input.forceHandoff?.handoff) {
    return finalizeReply(
      "I want to make sure you get the right help on that — I'm looping in a Fitdog teammate now. Someone will follow up shortly.",
      [],
      false,
      { handoff: true, reason: input.forceHandoff.reason, serviceInterest }
    );
  }

  const articles = await loadPublishedKnowledgeArticles();
  const matched = selectRelevantArticles(input.message, articles, 4);
  const corpus = matched.length ? matched : articles.slice(0, 3);

  const quick = deterministicReply(input.message, articles, input.recentTurns);
  if (quick) {
    return finalizeReply(quick, matched.map((article) => article.title), false, { serviceInterest });
  }

  const aiText = await geminiGroundedReply({
    message: input.message,
    articles: corpus,
    recentTurns: input.recentTurns
  });
  if (aiText) {
    return finalizeReply(aiText, corpus.map((article) => article.title), true, { serviceInterest });
  }

  return finalizeReply(
    `Happy to help — tell me if you want daycare/boarding info, the ${FITDOG_BOOKING.assessmentFee} assessment, or a Fitdog signup link. ${FITDOG_BOOKING.assessmentUrl}`,
    matched.map((article) => article.title),
    false,
    { serviceInterest }
  );
}
