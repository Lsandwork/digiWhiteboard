import { liveActionScenes } from "./scenes";
import type { CostEstimate, VideoResolutionName } from "./types";

/** Veo 3.1 Fast 1080p with native audio, USD per billed second. */
const VEO_3_1_FAST_AUDIO_USD: Record<VideoResolutionName, number> = {
  "720p": 0.1,
  "1080p": 0.12
};

/** Veo 3.1 Standard 1080p with native audio, USD per billed second. */
const VEO_3_1_STANDARD_AUDIO_USD: Record<VideoResolutionName, number> = {
  "720p": 0.4,
  "1080p": 0.4
};

export function usdPerSecond(model: string, resolution: VideoResolutionName): number {
  const id = model.toLowerCase();
  if (id.includes("lite")) return resolution === "1080p" ? 0.08 : 0.05;
  if (id.includes("fast")) return VEO_3_1_FAST_AUDIO_USD[resolution];
  return VEO_3_1_STANDARD_AUDIO_USD[resolution];
}

export function billedSecondsForResolution(resolution: VideoResolutionName, requestedSeconds: number): number {
  if (resolution === "1080p") return 8;
  if (requestedSeconds <= 4) return 4;
  if (requestedSeconds <= 6) return 6;
  return 8;
}

export function estimateGenerationCost(input: {
  provider: string;
  model: string;
  resolution: VideoResolutionName;
  skipCachedSceneIds?: string[];
}): CostEstimate {
  const skip = new Set(input.skipCachedSceneIds ?? []);
  const scenes = liveActionScenes().filter((scene) => !skip.has(scene.id));
  const billedSeconds = scenes.reduce(
    (sum, scene) => sum + billedSecondsForResolution(input.resolution, scene.providerDurationSeconds),
    0
  );
  const rate = usdPerSecond(input.model, input.resolution);
  const notes = [
    "End card is rendered locally from the real Fitdog lockup (no API cost).",
    "1080p Veo clips are billed at 8 seconds even if the commercial trims them shorter.",
    "One clip per scene. Cached scenes are not re-billed."
  ];
  if (skip.size) notes.push(`Skipping ${skip.size} cached scene(s): ${[...skip].join(", ")}.`);

  return {
    provider: input.provider,
    model: input.model,
    billedSeconds,
    usdPerSecond: rate,
    estimatedUsd: Number((billedSeconds * rate).toFixed(2)),
    sceneCount: scenes.length,
    notes
  };
}

export function formatCostUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
