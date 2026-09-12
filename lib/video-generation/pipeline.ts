import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadSharp } from "../sharp-runtime";
import { cachePaths, completedScenePath, promptHash, rememberCompletedScene } from "./cache";
import {
  CONSISTENCY_SEED,
  FINAL_AD_FILE,
  LOBBY_AD_HEIGHT,
  LOBBY_AD_REFERENCES_DIR,
  LOBBY_AD_WIDTH,
  LOCATION_REFERENCE_FILE
} from "./constants";
import { estimateGenerationCost, formatCostUsd } from "./cost";
import { providerSnapshot, resolveVideoGenerationConfig, type VideoGenerationConfig } from "./config";
import { renderEndCardVideo } from "./end-card";
import { probeJson } from "./ffmpeg";
import { NEGATIVE_PROMPT, scenePrompt } from "./prompts";
import { resolveVideoGenerationProvider } from "./providers/resolve";
import { END_CARD_SCENE, liveActionScenes, targetTimelineSeconds } from "./scenes";
import { stitchLobbyAd } from "./stitch";
import type { CostEstimate, GeneratedVideo, LobbyAdScene, ProviderSnapshot, VideoSceneInput } from "./types";
import { assertLobbyAdOutput } from "./validate";

export type GenerateLobbyAdOptions = {
  generate: boolean;
  cacheDir?: string;
  outputPath?: string;
};

export type GenerateLobbyAdResult = {
  provider: ProviderSnapshot;
  cost: CostEstimate;
  generated: GeneratedVideo[];
  skippedCached: string[];
  endCardPath: string;
  outputPath: string | null;
  dryRun: boolean;
};

function firstFramePath(scene: LobbyAdScene): string | undefined {
  if (!scene.firstFrameFileName) return undefined;
  const path = join(LOBBY_AD_REFERENCES_DIR, scene.firstFrameFileName);
  return existsSync(path) ? path : undefined;
}

function locationReferencePath(): string | undefined {
  return existsSync(LOCATION_REFERENCE_FILE) ? LOCATION_REFERENCE_FILE : undefined;
}

export function sceneInputFor(
  scene: LobbyAdScene,
  config: VideoGenerationConfig,
  outputPath: string
): VideoSceneInput {
  const firstFrame = firstFramePath(scene);
  const location = scene.usesLocationReference ? locationReferencePath() : undefined;
  return {
    sceneId: scene.id,
    prompt: scenePrompt(scene),
    durationSeconds: billedDuration(config, scene),
    aspectRatio: "16:9",
    resolution: config.resolution,
    generateAudio: true,
    firstFramePath: firstFrame || location,
    negativePrompt: NEGATIVE_PROMPT,
    seed: CONSISTENCY_SEED,
    personGeneration: firstFrame || location ? "allow_adult" : "allow_all",
    outputPath
  };
}

function billedDuration(config: VideoGenerationConfig, scene: LobbyAdScene): number {
  if (config.resolution === "1080p") return 8;
  return scene.providerDurationSeconds;
}

export async function upscaleLocationReference(): Promise<string | null> {
  if (!existsSync(LOCATION_REFERENCE_FILE)) return null;
  const sharp = await loadSharp();
  const dest = join(LOBBY_AD_REFERENCES_DIR, "fitdog-entrance-1712-1920.jpg");
  await sharp(LOCATION_REFERENCE_FILE)
    .resize(LOBBY_AD_WIDTH, LOBBY_AD_HEIGHT, { fit: "contain", background: { r: 28, g: 22, b: 20, alpha: 1 } })
    .jpeg({ quality: 95 })
    .toFile(dest);
  return dest;
}

export async function generateLobbyAd(options: GenerateLobbyAdOptions): Promise<GenerateLobbyAdResult> {
  const config = resolveVideoGenerationConfig();
  if (options.cacheDir) config.cacheDir = options.cacheDir;
  mkdirSync(config.cacheDir, { recursive: true });
  mkdirSync(LOBBY_AD_REFERENCES_DIR, { recursive: true });
  await upscaleLocationReference();

  const snapshot = providerSnapshot(config);
  const scenes = liveActionScenes();
  const skippedCached: string[] = [];
  const pending: LobbyAdScene[] = [];

  for (const scene of scenes) {
    const input = sceneInputFor(scene, config, cachePaths(config.cacheDir).sceneFile(scene));
    const hash = promptHash(input);
    const cached = completedScenePath(config.cacheDir, scene, hash, config.model);
    if (cached) skippedCached.push(scene.id);
    else pending.push(scene);
  }

  const cost = estimateGenerationCost({
    provider: snapshot.id,
    model: snapshot.model,
    resolution: config.resolution,
    skipCachedSceneIds: skippedCached
  });

  const endCardPath = join(config.cacheDir, END_CARD_SCENE.fileName);
  await renderEndCardVideo(endCardPath, join(config.cacheDir, "end-card-work"));

  if (!options.generate) {
    return {
      provider: snapshot,
      cost,
      generated: [],
      skippedCached,
      endCardPath,
      outputPath: null,
      dryRun: true
    };
  }

  if (pending.length && !snapshot.configured) {
    throw new Error(
      `Cannot generate ${pending.map((scene) => scene.id).join(", ")}: ${snapshot.missingCredentialEnvVars.join(" or ")} is not set. Estimated cost if configured: ${formatCostUsd(cost.estimatedUsd)}. End card is ready at ${endCardPath}.`
    );
  }

  const generated: GeneratedVideo[] = [];
  const provider = pending.length ? resolveVideoGenerationProvider(config) : null;

  for (const scene of scenes) {
    const outputPath = cachePaths(config.cacheDir).sceneFile(scene);
    const input = sceneInputFor(scene, config, outputPath);
    const hash = promptHash(input);
    const cached = completedScenePath(config.cacheDir, scene, hash, config.model);
    if (cached) {
      generated.push({
        sceneId: scene.id,
        jobId: `cache:${scene.id}`,
        filePath: cached,
        durationSeconds: scene.targetDurationSeconds,
        cached: true,
        provider: snapshot.id,
        model: config.model
      });
      continue;
    }
    if (!provider) throw new Error("Provider missing for uncached scene.");
    console.info(`[lobby-ad] generating ${scene.id} via ${provider.id}/${provider.model} (one take, cached afterwards)`);
    const clip = await provider.generateScene(input);
    rememberCompletedScene(config.cacheDir, {
      sceneId: scene.id,
      promptHash: hash,
      model: config.model,
      jobId: clip.jobId,
      filePath: clip.filePath,
      completedAt: new Date().toISOString()
    });
    generated.push(clip);
  }

  const outputPath = options.outputPath || FINAL_AD_FILE;
  const clips = [
    ...scenes.map((scene) => ({
      scene,
      inputPath: generated.find((item) => item.sceneId === scene.id)!.filePath
    })),
    { scene: END_CARD_SCENE, inputPath: endCardPath }
  ];
  await stitchLobbyAd(clips, outputPath, join(config.cacheDir, "stitch"));
  assertLobbyAdOutput(outputPath, probeJson(outputPath));

  return {
    provider: snapshot,
    cost,
    generated,
    skippedCached,
    endCardPath,
    outputPath,
    dryRun: false
  };
}

export function plannedDurationSeconds(): number {
  return targetTimelineSeconds();
}
