import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { VideoGenerationProvider } from "../provider";
import type { GeneratedVideo, VideoSceneInput, VideoStatus } from "../types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const POLL_MS = 10_000;
const MAX_WAIT_MS = 12 * 60 * 1000;

type VeoStartResponse = {
  name?: string;
  error?: { message?: string };
};

type VeoPollResponse = {
  name?: string;
  done?: boolean;
  error?: { message?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: { uri?: string; encodedVideo?: string };
      }>;
      raiMediaFilteredReasons?: string[];
    };
  };
};

function mimeFor(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function inlineImage(path: string) {
  return {
    inlineData: {
      mimeType: mimeFor(path),
      data: readFileSync(path).toString("base64")
    }
  };
}

export class GoogleVeoProvider implements VideoGenerationProvider {
  readonly id = "google-veo";

  constructor(
    private readonly apiKey: string,
    readonly model: string
  ) {}

  async generateScene(input: VideoSceneInput): Promise<GeneratedVideo> {
    const started = await this.start(input);
    let status = await this.getStatus(started.jobId);
    const deadline = Date.now() + MAX_WAIT_MS;
    while (status.status === "pending" || status.status === "running") {
      if (Date.now() > deadline) {
        throw new Error(`Veo timed out waiting for ${input.sceneId} (${started.jobId}). The job was not restarted.`);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      status = await this.getStatus(started.jobId);
    }
    if (status.status === "error") {
      throw new Error(status.error);
    }
    const dest = input.outputPath;
    await this.download(started.jobId, dest);
    return {
      sceneId: input.sceneId,
      jobId: started.jobId,
      filePath: dest,
      durationSeconds: input.durationSeconds,
      cached: false,
      provider: this.id,
      model: this.model
    };
  }

  async getStatus(jobId: string): Promise<VideoStatus> {
    const url = `${GEMINI_BASE}/${jobId}`;
    const response = await fetch(url, { headers: { "x-goog-api-key": this.apiKey } });
    const body = (await response.json()) as VeoPollResponse;
    if (!response.ok) {
      return { status: "error", jobId, error: body.error?.message || `HTTP ${response.status}` };
    }
    if (body.error?.message) return { status: "error", jobId, error: body.error.message };
    if (!body.done) return { status: "running", jobId };
    const filtered = body.response?.generateVideoResponse?.raiMediaFilteredReasons;
    if (filtered?.length) return { status: "error", jobId, error: `Veo filtered the clip: ${filtered.join("; ")}` };
    const sample = body.response?.generateVideoResponse?.generatedSamples?.[0];
    if (!sample?.video?.uri && !sample?.video?.encodedVideo) {
      return { status: "error", jobId, error: "Veo finished without a video sample." };
    }
    return { status: "completed", jobId };
  }

  private async start(input: VideoSceneInput): Promise<{ jobId: string }> {
    const instance: Record<string, unknown> = { prompt: input.prompt };
    if (input.firstFramePath && existsSync(input.firstFramePath)) {
      // First-frame image-to-video. Do not also send referenceImages — Veo ignores them when a start frame is present.
      instance.image = inlineImage(input.firstFramePath);
    } else if (input.referenceImagePaths?.length) {
      instance.referenceImages = input.referenceImagePaths.filter((path) => existsSync(path)).map((path) => ({
        image: inlineImage(path),
        referenceType: "asset"
      }));
    }

    const payload = {
      instances: [instance],
      parameters: {
        aspectRatio: input.aspectRatio,
        durationSeconds: input.durationSeconds,
        resolution: input.resolution,
        personGeneration: input.personGeneration || (input.firstFramePath ? "allow_adult" : "allow_all"),
        negativePrompt: input.negativePrompt,
        seed: input.seed
      }
    };

    const response = await fetch(`${GEMINI_BASE}/models/${this.model}:predictLongRunning`, {
      method: "POST",
      headers: {
        "x-goog-api-key": this.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const body = (await response.json()) as VeoStartResponse;
    if (!response.ok || !body.name) {
      throw new Error(body.error?.message || `Veo start failed HTTP ${response.status}`);
    }
    return { jobId: body.name };
  }

  private async download(jobId: string, dest: string) {
    const response = await fetch(`${GEMINI_BASE}/${jobId}`, { headers: { "x-goog-api-key": this.apiKey } });
    const body = (await response.json()) as VeoPollResponse;
    const sample = body.response?.generateVideoResponse?.generatedSamples?.[0]?.video;
    mkdirSync(join(dest, ".."), { recursive: true });
    if (sample?.encodedVideo) {
      writeFileSync(dest, Buffer.from(sample.encodedVideo, "base64"));
      return;
    }
    if (!sample?.uri) throw new Error(`No download URI for ${jobId}`);
    const video = await fetch(sample.uri, { headers: { "x-goog-api-key": this.apiKey } });
    if (!video.ok) throw new Error(`Video download failed HTTP ${video.status}`);
    writeFileSync(dest, Buffer.from(await video.arrayBuffer()));
  }
}
