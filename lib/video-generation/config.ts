import { DEFAULT_CACHE_DIR, DEFAULT_VEO_MODEL, DEFAULT_VEO_RESOLUTION } from "./constants";
import type { ProviderSnapshot, VideoResolutionName } from "./types";

export type VideoGenerationConfig = {
  providerId: "google-veo";
  model: string;
  resolution: VideoResolutionName;
  cacheDir: string;
  geminiApiKey: string | null;
  gatewayApiKey: string | null;
};

function trimEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function geminiApiKey(): string | null {
  return trimEnv("VIDEO_GENERATION_API_KEY") || trimEnv("GEMINI_API_KEY") || trimEnv("GOOGLE_GENERATIVE_AI_API_KEY");
}

export function resolveVideoGenerationConfig(): VideoGenerationConfig {
  const requested = (trimEnv("VIDEO_GENERATION_PROVIDER") || "google-veo").toLowerCase();
  if (requested !== "google-veo" && requested !== "auto") {
    throw new Error(
      `Unsupported VIDEO_GENERATION_PROVIDER="${requested}". This isolated pipeline ships google-veo (Gemini Veo via GEMINI_API_KEY). Swap providers by implementing VideoGenerationProvider.`
    );
  }

  const resolutionRaw = (trimEnv("VIDEO_GENERATION_RESOLUTION") || DEFAULT_VEO_RESOLUTION).toLowerCase();
  const resolution: VideoResolutionName = resolutionRaw === "720p" ? "720p" : "1080p";

  return {
    providerId: "google-veo",
    model: trimEnv("VIDEO_GENERATION_MODEL") || DEFAULT_VEO_MODEL,
    resolution,
    cacheDir: trimEnv("VIDEO_GENERATION_CACHE_DIR") || DEFAULT_CACHE_DIR,
    geminiApiKey: geminiApiKey(),
    gatewayApiKey: trimEnv("AI_GATEWAY_API_KEY")
  };
}

export function providerSnapshot(config: VideoGenerationConfig = resolveVideoGenerationConfig()): ProviderSnapshot {
  const credentialEnvVars = ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "VIDEO_GENERATION_API_KEY"];
  const hasKey = Boolean(config.geminiApiKey);
  return {
    id: config.providerId,
    configured: hasKey,
    model: config.model,
    credentialEnvVars,
    missingCredentialEnvVars: hasKey ? [] : credentialEnvVars
  };
}

export function assertProviderReady(config: VideoGenerationConfig = resolveVideoGenerationConfig()): string {
  const snapshot = providerSnapshot(config);
  if (!snapshot.configured) {
    throw new Error(
      `No video-generation credentials. Provider=${snapshot.id} model=${snapshot.model}. Set GEMINI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY / VIDEO_GENERATION_API_KEY). No paid API call was made.`
    );
  }
  return config.geminiApiKey!;
}
