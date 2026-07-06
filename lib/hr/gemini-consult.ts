import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AdminGlobalSettings } from "@/lib/admin/settings";
import type { HrConsultMessage } from "@/lib/hr/consult-store";
import {
  geminiModelRetryChain,
  isGeminiModelNotFoundError,
  resolveGeminiModel
} from "@/lib/hr/gemini-config";

export { isGeminiConfigured } from "@/lib/hr/gemini-config";

function buildSystemInstruction(settings: AdminGlobalSettings) {
  const location = `${settings.hr_company_city}, ${settings.hr_company_region}, ${settings.hr_company_country}`;
  const business = settings.business_display_name || "Fitdog";

  return `You are Sam — a warm, sharp HR partner at ${business} in ${location}. You talk like a trusted colleague over coffee: clear, kind, direct, and human. Never sound like a chatbot, policy PDF, or legal textbook.

Your job:
- Help management think through write-ups, complaints, documentation, and next steps.
- Ground guidance in California employment context (city: ${settings.hr_company_city}, state: ${settings.hr_company_region}).
- Ask thoughtful follow-up questions when details are missing.
- Offer practical options (conversation scripts, documentation tips, escalation paths) without being preachy.

Company context (current state — use for legal/operational framing):
${settings.hr_company_situation.trim() || "No additional company context provided."}

Tone rules:
- Use plain language and short paragraphs.
- It's okay to be conversational ("Here's what I'd do…", "Honestly, the first step is…").
- Show empathy for both staff and leadership.
- Use bullet points sparingly — only when they genuinely help.

Hard boundaries:
- You are NOT a lawyer. Say so naturally when legal risk is involved and suggest consulting qualified counsel.
- Do not invent facts about specific employees or incidents.
- Do not claim to have taken actions in HR systems.
- Keep responses focused and actionable (roughly 2–5 short paragraphs unless the user asks for more).`;
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
  return text;
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

  const message = `${contextBlock}${params.userMessage}`.trim();
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
