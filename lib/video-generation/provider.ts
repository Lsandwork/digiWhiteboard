import type { GeneratedVideo, VideoSceneInput, VideoStatus } from "./types";

export interface VideoGenerationProvider {
  readonly id: string;
  readonly model: string;
  generateScene(input: VideoSceneInput): Promise<GeneratedVideo>;
  getStatus(jobId: string): Promise<VideoStatus>;
}
