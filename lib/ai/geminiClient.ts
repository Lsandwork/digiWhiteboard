import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import {
  geminiModelRetryChain,
  isGeminiConfigured,
  isGeminiModelNotFoundError,
  isGeminiRetryableError,
  resolveGeminiModel
} from "@/lib/hr/gemini-config";

export { isGeminiConfigured, resolveGeminiModel };

function getApiKey() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return apiKey;
}

export function fitdogAiUserFacingError(error: unknown): string {
  if (error instanceof Error && error.message.includes("GEMINI_API_KEY")) {
    return "Fitdog AI is not configured yet. Ask an admin to add GEMINI_API_KEY in Vercel.";
  }
  if (isGeminiModelNotFoundError(error)) {
    return "Fitdog AI could not reach Gemini right now. Try again in a moment.";
  }
  return "Fitdog AI is having trouble right now. Try again — if it keeps happening, document the issue through the normal workflow.";
}

export async function generateFitdogText(params: {
  systemInstruction: string;
  userMessage: string;
  jsonMode?: boolean;
  modelOverride?: string | null;
}): Promise<{ text: string; model: string }> {
  const apiKey = getApiKey();
  const primaryModel = resolveGeminiModel(params.modelOverride);
  const models = geminiModelRetryChain(primaryModel);
  let lastError: unknown;

  for (let index = 0; index < models.length; index += 1) {
    const modelName = models[index]!;
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: params.systemInstruction,
        generationConfig: params.jsonMode ? { responseMimeType: "application/json" } : undefined
      });
      const result = await model.generateContent(params.userMessage);
      const text = result.response.text()?.trim();
      if (!text) throw new Error("Gemini returned an empty response.");
      return { text, model: modelName };
    } catch (error) {
      lastError = error;
      console.error(`[fitdog-ai] Gemini model failed: ${modelName}`, error);
      const hasFallback = index < models.length - 1;
      if (hasFallback && (isGeminiModelNotFoundError(error) || isGeminiRetryableError(error))) {
        console.warn(`[fitdog-ai] Retrying with fallback model: ${models[index + 1]}`);
        continue;
      }
      break;
    }
  }

  throw lastError;
}

async function waitForFileActive(fileManager: GoogleAIFileManager, fileName: string, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const file = await fileManager.getFile(fileName);
    if (file.state === FileState.ACTIVE) return file;
    if (file.state === FileState.FAILED) {
      throw new Error(file.error?.message ?? "Video processing failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("Video processing timed out. Try a shorter clip.");
}

export async function analyzeFitdogVideo(params: {
  buffer: Buffer;
  mimeType: string;
  displayName: string;
  systemInstruction: string;
  userPrompt: string;
  modelOverride?: string | null;
}): Promise<{ text: string; model: string }> {
  const apiKey = getApiKey();
  const fileManager = new GoogleAIFileManager(apiKey);
  let uploadedName: string | null = null;

  try {
    const upload = await fileManager.uploadFile(params.buffer, {
      mimeType: params.mimeType,
      displayName: params.displayName
    });
    uploadedName = upload.file.name;
    const activeFile = await waitForFileActive(fileManager, uploadedName);

    const primaryModel = resolveGeminiModel(params.modelOverride);
    const models = geminiModelRetryChain(primaryModel);
    let lastError: unknown;

    for (let index = 0; index < models.length; index += 1) {
      const modelName = models[index]!;
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: params.systemInstruction,
          generationConfig: { responseMimeType: "application/json" }
        });
        const result = await model.generateContent([
          {
            fileData: {
              fileUri: activeFile.uri,
              mimeType: params.mimeType
            }
          },
          { text: params.userPrompt }
        ]);
        const text = result.response.text()?.trim();
        if (!text) throw new Error("Gemini returned an empty video analysis.");
        return { text, model: modelName };
      } catch (error) {
        lastError = error;
        console.error(`[fitdog-ai] Video model failed: ${modelName}`, error);
        const hasFallback = index < models.length - 1;
        if (hasFallback && isGeminiModelNotFoundError(error)) continue;
        break;
      }
    }

    throw lastError;
  } finally {
    if (uploadedName) {
      try {
        await fileManager.deleteFile(uploadedName);
      } catch (error) {
        console.error("[fitdog-ai] Failed to delete uploaded video file:", error);
      }
    }
  }
}
