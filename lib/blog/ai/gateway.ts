import { generateFitdogText, isGeminiConfigured } from "@/lib/ai/geminiClient";

export type BlogAiProviderName = "gemini" | "openai" | "anthropic" | "perplexity" | "cursor" | "none";

export type BlogAiRequest = {
  systemInstruction: string;
  userMessage: string;
  jsonMode?: boolean;
  provider?: BlogAiProviderName;
  purpose: string;
};

export type BlogAiResponse = {
  text: string;
  provider: BlogAiProviderName;
  model: string;
  estimatedCostCents: number;
};

function configuredProviders(): BlogAiProviderName[] {
  const providers: BlogAiProviderName[] = [];
  if (isGeminiConfigured() || process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
    providers.push("gemini");
  }
  if (process.env.OPENAI_API_KEY?.trim()) providers.push("openai");
  if (process.env.ANTHROPIC_API_KEY?.trim()) providers.push("anthropic");
  if (process.env.PERPLEXITY_API_KEY?.trim()) providers.push("perplexity");
  if (process.env.CURSOR_API_KEY?.trim()) providers.push("cursor");
  return providers;
}

export function getBlogProviderStatus() {
  return {
    gemini: Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()),
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    perplexity: Boolean(process.env.PERPLEXITY_API_KEY?.trim()),
    cursor: Boolean(process.env.CURSOR_API_KEY?.trim()),
    available: configuredProviders()
  };
}

export async function generateBlogText(request: BlogAiRequest): Promise<BlogAiResponse> {
  const preferred = request.provider || "gemini";
  const available = configuredProviders();

  if ((preferred === "gemini" || preferred === "none") && available.includes("gemini")) {
    // Prefer existing Gemini path used across RuffOps.
    if (!process.env.GEMINI_API_KEY?.trim() && process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
      process.env.GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    }
    const result = await generateFitdogText({
      systemInstruction: request.systemInstruction,
      userMessage: request.userMessage,
      jsonMode: request.jsonMode,
      fastChat: true
    });
    return {
      text: result.text,
      provider: "gemini",
      model: result.model,
      estimatedCostCents: 8
    };
  }

  // Other providers are scaffolded for Super Admin configuration; do not invent live clients.
  if (preferred !== "gemini" && available.includes(preferred)) {
    throw new Error(
      `${preferred} is configured but not yet wired as an active writing provider in this environment. Use Gemini or enable the approved adapter.`
    );
  }

  throw new Error("No AI provider is configured. Add GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY) in Vercel.");
}

export async function testBlogProviderConnection(provider: BlogAiProviderName): Promise<{
  status: "connected" | "invalid_credentials" | "not_configured" | "service_unavailable";
  detail?: string;
}> {
  const status = getBlogProviderStatus();
  if (provider === "cursor") {
    if (!status.cursor) return { status: "not_configured" };
    return {
      status: "connected",
      detail: "CURSOR_API_KEY is present server-side. Cursor is intended for development/maintenance workflows, not as the sole article writer."
    };
  }
  if (provider === "gemini") {
    if (!status.gemini) return { status: "not_configured" };
    try {
      await generateBlogText({
        purpose: "connection_test",
        systemInstruction: "Reply with the single word: ok",
        userMessage: "ping"
      });
      return { status: "connected" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      if (/api key|credential|401|403/i.test(message)) return { status: "invalid_credentials", detail: message };
      return { status: "service_unavailable", detail: message };
    }
  }
  if (!status[provider as keyof typeof status]) return { status: "not_configured" };
  return { status: "connected", detail: `${provider} key detected; writing adapter pending activation.` };
}
