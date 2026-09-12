export type VideoAspectRatio = "16:9";
export type VideoResolutionName = "720p" | "1080p";

export type VideoSceneInput = {
  sceneId: string;
  prompt: string;
  durationSeconds: number;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolutionName;
  generateAudio: boolean;
  firstFramePath?: string;
  referenceImagePaths?: string[];
  negativePrompt?: string;
  seed?: number;
  personGeneration?: "allow_all" | "allow_adult";
  outputPath: string;
};

export type GeneratedVideo = {
  sceneId: string;
  jobId: string;
  filePath: string;
  durationSeconds: number;
  cached: boolean;
  provider: string;
  model: string;
};

export type VideoStatus =
  | { status: "pending"; jobId: string }
  | { status: "running"; jobId: string }
  | { status: "completed"; jobId: string; filePath?: string }
  | { status: "error"; jobId: string; error: string };

export type CaptionBlock = {
  lines: string[];
  emphasize: string[];
  /** Place captions away from faces / primary action. */
  region: "lower" | "upper";
};

export type LobbyAdScene = {
  id: string;
  fileName: string;
  title: string;
  /** Duration in the finished commercial. */
  targetDurationSeconds: number;
  /** Duration requested from the provider (1080p Veo requires 8s). */
  providerDurationSeconds: number;
  caption: CaptionBlock;
  dialogue?: string;
  firstFrameFileName?: string;
  referenceFileNames?: string[];
  usesLocationReference?: boolean;
};

export type CostEstimate = {
  provider: string;
  model: string;
  billedSeconds: number;
  usdPerSecond: number;
  estimatedUsd: number;
  sceneCount: number;
  notes: string[];
};

export type ProviderSnapshot = {
  id: string;
  configured: boolean;
  model: string;
  credentialEnvVars: string[];
  missingCredentialEnvVars: string[];
};
