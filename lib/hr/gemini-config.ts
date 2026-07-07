/** Shared Gemini model configuration — single source of truth for HR Consult. */

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
export const GEMINI_MODEL_FALLBACK = "gemini-2.5-flash";
export const GEMINI_MODEL_LITE = "gemini-2.5-flash-lite";

export const GEMINI_MODEL_OPTIONS = [
  { value: DEFAULT_GEMINI_MODEL, label: "Gemini 3.5 Flash (recommended)" },
  { value: GEMINI_MODEL_FALLBACK, label: "Gemini 2.5 Flash" },
  { value: GEMINI_MODEL_LITE, label: "Gemini 2.5 Flash Lite" }
] as const;

const RETIRED_GEMINI_MODELS = new Set([
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "models/gemini-2.0-flash",
  "models/gemini-1.5-flash",
  "models/gemini-1.5-pro"
]);

/** Strip optional `models/` prefix and map retired IDs to the current default. */
export function normalizeGeminiModelId(model?: string | null): string {
  const raw = String(model ?? "").trim();
  if (!raw) return DEFAULT_GEMINI_MODEL;

  const id = raw.replace(/^models\//, "");
  if (RETIRED_GEMINI_MODELS.has(raw) || RETIRED_GEMINI_MODELS.has(id)) {
    return DEFAULT_GEMINI_MODEL;
  }
  return id;
}

/** Env `GEMINI_MODEL` wins; otherwise optional admin-settings override; then default. */
export function resolveGeminiModel(settingsOverride?: string | null): string {
  const envModel = process.env.GEMINI_MODEL?.trim();
  if (envModel) return normalizeGeminiModelId(envModel);
  if (settingsOverride) return normalizeGeminiModelId(settingsOverride);
  return DEFAULT_GEMINI_MODEL;
}

export function geminiModelRetryChain(primary: string): string[] {
  const normalized = normalizeGeminiModelId(primary);
  const chain: string[] = [];
  for (const candidate of [normalized, GEMINI_MODEL_FALLBACK, GEMINI_MODEL_LITE]) {
    if (!chain.includes(candidate)) chain.push(candidate);
  }
  return chain;
}

export function isGeminiRetryableError(error: unknown): boolean {
  if (isGeminiModelNotFoundError(error)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /429|503|500|502|504|quota|rate limit|overloaded|unavailable|resource exhausted/i.test(message);
}

export function isGeminiModelNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /404|not found|no longer available/i.test(message);
}

export function geminiUserFacingError(error: unknown): string {
  if (error instanceof Error && error.message.includes("GEMINI_API_KEY")) {
    return "HR Consult is not configured yet. Ask an admin to add GEMINI_API_KEY in Vercel.";
  }
  if (isGeminiModelNotFoundError(error)) {
    return "HR Consult could not reach Gemini right now. Please try again in a moment.";
  }
  if (error instanceof Error && error.message.includes("disabled")) {
    return error.message;
  }
  return "Sam could not respond just now. Please try again — if it keeps happening, check GEMINI_API_KEY and GEMINI_MODEL in Vercel.";
}
