import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AdminGlobalSettings } from "@/lib/admin/settings";
import type { HrConsultMessage } from "@/lib/hr/consult-store";
import {
  buildConversationalStyleHint,
  stripMarkdownFormatting
} from "@/lib/ai/sanitizeAiText";
import {
  geminiModelRetryChain,
  isGeminiModelNotFoundError,
  resolveGeminiModel
} from "@/lib/hr/gemini-config";

export { isGeminiConfigured } from "@/lib/hr/gemini-config";

function buildSystemInstruction(settings: AdminGlobalSettings) {
  const location = `${settings.hr_company_city}, ${settings.hr_company_region}, ${settings.hr_company_country}`;
  const business = settings.business_display_name || "Fitdog";

  return `You are Sam — a warm, sharp HR partner at ${business} in ${location}. You talk like a trusted, highly educated colleague: clear, kind, direct, and human. Never sound like a chatbot, policy PDF, or legal textbook.

Your job:
- Help management think through write-ups, complaints, documentation, and next steps.
- Ground guidance in California employment context (city: ${settings.hr_company_city}, state: ${settings.hr_company_region}).
- ENGAGE before you advise: understand the situation with thoughtful follow-up questions.
- Offer practical options when asked — conversation scripts, documentation tips, escalation paths — without being preachy.

Company context (current state — use for legal/operational framing):
${settings.hr_company_situation.trim() || "No additional company context provided."}

Response style — CRITICAL:
- On a NEW topic: 2-4 short sentences (~40-80 words). Ask ONE engaging follow-up question. Do not dump checklists, section headers, or full written-warning drafts yet.
- Go longer ONLY when the manager explicitly asks for a draft, template, full wording, or "what should I include" in detail — or when they answer your follow-ups and need the next step.
- Plain text ONLY: never use markdown (no **, *, ***, # headers). No "Written Warning:" template blocks unless they asked you to draft one.
- Sound like a senior HRBP over coffee — educated, calm, human — not a compliance memo.
- Bullets only if the manager asked for a list; otherwise use short paragraphs.

Hard boundaries:
- You are NOT a lawyer. Mention that naturally once when legal risk is real — not as a footer every time.
- Do not invent facts about specific employees or incidents.
- Do not claim to have taken actions in HR systems.`;
}

function historyToGemini(messages: HrConsultMessage[]) {
  return messages.slice(-24).map((message) => ({
    role: message.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: message.content }]
  }));
}

async function sendWithModel(
  apiKey: string,
  modelName: string,
  settings: AdminGlobalSettings,
  history: HrConsultMessage[],
  userMessage: string
) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: buildSystemInstruction(settings)
  });

  const chat = model.startChat({
    history: historyToGemini(history)
  });

  const result = await chat.sendMessage(userMessage);
  const text = result.response.text()?.trim();
  if (!text) throw new Error("Gemini returned an empty response. Please try again.");
  return stripMarkdownFormatting(text);
}

export async function consultGeminiHr(params: {
  settings: AdminGlobalSettings;
  history: HrConsultMessage[];
  userMessage: string;
  recordContext?: string | null;
}) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Gemini is not configured. Add GEMINI_API_KEY to your server environment.");
  }
  if (!params.settings.hr_consult_enabled) {
    throw new Error("HR Consult is disabled in Settings.");
  }

  const contextBlock = params.recordContext
    ? `\n\n---\nContext from an HR record the manager attached:\n${params.recordContext}\n---\n`
    : "";

  const priorUserTurns = params.history.filter((message) => message.role === "user").length;
  const styleHint = buildConversationalStyleHint({
    userMessage: params.userMessage,
    priorUserTurns
  });

  const message = `${contextBlock}${params.userMessage.trim()}\n\n[Style for this turn: ${styleHint}]`.trim();
  const primaryModel = resolveGeminiModel(params.settings.hr_consult_model);
  const models = geminiModelRetryChain(primaryModel);
  let lastError: unknown;

  for (let index = 0; index < models.length; index += 1) {
    const modelName = models[index]!;
    try {
      return await sendWithModel(apiKey, modelName, params.settings, params.history, message);
    } catch (error) {
      lastError = error;
      console.error(`[hr-consult] Gemini model failed: ${modelName}`, error);

      const hasFallback = index < models.length - 1;
      if (hasFallback && isGeminiModelNotFoundError(error)) {
        console.warn(`[hr-consult] Retrying with fallback model: ${models[index + 1]}`);
        continue;
      }
      break;
    }
  }

  throw lastError;
}
