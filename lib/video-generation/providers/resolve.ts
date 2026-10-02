import { assertProviderReady, resolveVideoGenerationConfig, type VideoGenerationConfig } from "../config";
import type { VideoGenerationProvider } from "../provider";
import { GoogleVeoProvider } from "./google-veo";

export function resolveVideoGenerationProvider(
  config: VideoGenerationConfig = resolveVideoGenerationConfig()
): VideoGenerationProvider {
  const apiKey = assertProviderReady(config);
  return new GoogleVeoProvider(apiKey, config.model);
}
