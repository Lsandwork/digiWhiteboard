import { GoogleGenerativeAI } from "@google/generative-ai";
import { geminiModelRetryChain, isGeminiModelNotFoundError, resolveGeminiModel } from "@/lib/hr/gemini-config";
import { isRufflyAiEnabled } from "@/lib/ruffly/flags";
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
  // Boost common intents
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
  if (/\b(train|training|class)\b/.test(lower) && /train/.test(haystack)) score += 4;
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
      return data.map((row) => ({
        title: String(row.title),
        category: String(row.category),
        content: String(row.content || ""),
        source: row.source ? String(row.source) : null
      }));
    }
  } catch {
    // fall through to starter pack
  }
  return RUFFLY_STARTER_KNOWLEDGE_ARTICLES.map((article) => ({
    title: article.title,
    category: article.category,
    content: article.content,
    source: article.source
  }));
}

const SERVICE_OR_TOPIC_WORDS =
  /\b(daycare|day\s*care|board(?:ing)?|groom(?:ing)?|train(?:ing)?|hours?|pricing|price|cost|rates?|tour|assessment|location|address|parking|taxi|walks?)\b/i;

const NON_NAME_PHRASES =
  /\b(i said|you said|just said|like i said|yes|yeah|yep|no|nope|ok|okay|thanks|thank you|please|help|info|information|tell me|more|that one|the first|option)\b/i;

function looksLikeNameIntro(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length > 80 || trimmed.length < 2) return false;
  if (/[?]/.test(trimmed)) return false;
  if (SERVICE_OR_TOPIC_WORDS.test(trimmed) || NON_NAME_PHRASES.test(trimmed)) return false;

  if (/\b(my name is|i'?m|this is|dog'?s name is|my dog is)\b/i.test(trimmed)) {
    return true;
  }

  // Bare name intros: 2–5 title-case tokens (e.g. "Jasper Lonnie Sandoval"), not service words.
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 5) return false;
  if (!/^[A-Za-z][A-Za-z\s'-]+$/.test(trimmed)) return false;
  const titleCaseCount = tokens.filter((token) => /^[A-Z][a-zA-Z'-]*$/.test(token)).length;
  return titleCaseCount >= 2;
}

function deterministicReply(message: string, articles: WebchatKnowledgeArticle[]): string | null {
  const lower = message.toLowerCase().replace(/\bi said\b/g, " ").replace(/\s+/g, " ").trim();
  const hours = articles.find((a) => /hour|location|about fitdog/i.test(a.title));
  const daycare = articles.find((a) => /daycare/i.test(a.title));
  const boarding = articles.find((a) => /board/i.test(a.title));
  const grooming = articles.find((a) => /groom/i.test(a.title));
  const pricing = articles.find((a) => /pric/i.test(a.title));
  const tour = articles.find((a) => /tour|join|assessment/i.test(a.title));

  if (/\b(hours?|open|close|business hours|when are you)\b/.test(lower) && hours) {
    return `We're typically open 7:00 a.m. to 8:00 p.m. daily at 1712 21st St, Santa Monica. Want help with daycare, boarding, or booking a tour?`;
  }

  if (/\b(address|where are you|location|directions)\b/.test(lower) && hours) {
    return `We're at 1712 21st St, Santa Monica, CA 90404. Phone is (310) 828-3647 if you'd rather call. What were you hoping to set up?`;
  }

  if (/\b(price|pricing|cost|how much|rate)\b/.test(lower) && (pricing || daycare)) {
    if (/\b(daycare|day\s*care)\b/.test(lower)) {
      return `Published daycare rates: hourly $15, half day $37, full day $49 (packages available too). Want boarding or grooming numbers as well, or help booking a tour?`;
    }
    return `Happy to help with pricing — daycare starts around $15/hr or $49/full day, boarding about $70–80/night, and grooming packages vary by coat. Which service are you looking at?`;
  }

  if (/\b(daycare|day\s*care)\b/.test(lower) && daycare) {
    return `Daycare is open play in our big yard with enrichment, plus daily report cards and live webcams. New dogs usually need a quick tour & assessment first — want help getting that scheduled?`;
  }

  if (/\b(board(?:ing)?|overnight)\b/.test(lower) && boarding) {
    return `Boarding includes daycare-style open play, a daily group walk, and a private sleeping space (Den / Petite Suite / Suite). Published nights run about $70–80 before packages. Want me to walk you through booking?`;
  }

  if (/\b(groom(?:ing)?|bath|haircut)\b/.test(lower) && grooming) {
    return `We offer full-service grooming — baths, cut & style, nail trims, and spa packages. Final price depends on coat and breed; want a rough package range or to connect with the desk for an estimate?`;
  }

  if (/\b(train(?:ing)?|class(?:es)?)\b/.test(lower)) {
    return `We offer training and classes at the Santa Monica club. Tell me if you're looking for group classes or something more individual and I can point you the right way — or loop in a teammate.`;
  }

  if (/\b(tour|assessment|how (do|to) join|get started)\b/.test(lower) && (tour || daycare)) {
    return `New pups usually start with a tour & assessment before daycare. You can book that on fitdog.com or I can have the front desk follow up — what's your dog's name?`;
  }

  if (looksLikeNameIntro(message)) {
    return `Thanks — got it. How can I help you and your pup today? Daycare, boarding, grooming, training, or something else?`;
  }

  if (/\b(hi|hello|hey)\b/.test(lower) && lower.length < 24) {
    return `Hey! Welcome to Fitdog. I can help with hours, daycare, boarding, grooming, training, or getting a tour set up. What do you need?`;
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

  const knowledgeBlock = input.articles
    .map((article, index) => `[${index + 1}] ${article.title}\n${article.content}`)
    .join("\n\n---\n\n");

  const historyBlock = (input.recentTurns || [])
    .slice(-6)
    .map((turn) => `${turn.role === "user" ? "Customer" : "Fitdog"}: ${turn.text}`)
    .join("\n");

  const prompt = [
    "You are Ruffly, Fitdog Customer Care in Santa Monica.",
    "Sound warm, concise, and human — like a sharp front-desk teammate texting.",
    "Never claim to be a human person. Do not say you are an AI unless asked.",
    "ONLY use facts from the knowledge pack below. If the answer is not there, say you'll get a teammate to follow up — do not invent prices, availability, medical advice, or policies.",
    "Keep replies to 1–3 short sentences. Ask one useful follow-up when natural.",
    "If the customer just shared a name or dog name, acknowledge it briefly and ask how you can help.",
    "",
    "KNOWLEDGE PACK:",
    knowledgeBlock,
    "",
    historyBlock ? `RECENT CHAT:\n${historyBlock}\n` : "",
    `CUSTOMER: ${input.message}`,
    "RUFFLY:"
  ].join("\n");

  const models = geminiModelRetryChain(resolveGeminiModel());
  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError: unknown;

  for (let i = 0; i < models.length; i += 1) {
    const modelName = models[i]!;
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.55, maxOutputTokens: 220 }
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text()?.trim();
      if (text) return text.replace(/^RUFFLY:\s*/i, "").trim();
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

  // Fast, grounded answers for common intents before calling the model.
  const quick = deterministicReply(input.message, articles);
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
    reply:
      "Happy to help — I can cover hours, daycare, boarding, grooming, training, and tours. What are you looking for, and what's your dog's name?",
    handoff: false,
    usedAi: false,
    matchedTitles: matched.map((article) => article.title)
  };
}
