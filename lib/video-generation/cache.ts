import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LobbyAdScene, VideoSceneInput } from "./types";

export type CachedSceneRecord = {
  sceneId: string;
  promptHash: string;
  model: string;
  jobId: string;
  filePath: string;
  completedAt: string;
};

export type JobStore = {
  scenes: Record<string, CachedSceneRecord>;
};

export function promptHash(input: Pick<VideoSceneInput, "prompt" | "durationSeconds" | "resolution" | "firstFramePath">): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        prompt: input.prompt,
        durationSeconds: input.durationSeconds,
        resolution: input.resolution,
        firstFramePath: input.firstFramePath ?? ""
      })
    )
    .digest("hex")
    .slice(0, 16);
}

export function cachePaths(cacheDir: string) {
  return {
    dir: cacheDir,
    store: join(cacheDir, "jobs.json"),
    sceneFile: (scene: LobbyAdScene | { fileName: string }) => join(cacheDir, scene.fileName)
  };
}

export function loadJobStore(cacheDir: string): JobStore {
  const file = cachePaths(cacheDir).store;
  if (!existsSync(file)) return { scenes: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as JobStore;
    return parsed.scenes ? parsed : { scenes: {} };
  } catch {
    return { scenes: {} };
  }
}

export function saveJobStore(cacheDir: string, store: JobStore) {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePaths(cacheDir).store, `${JSON.stringify(store, null, 2)}\n`);
}

export function completedScenePath(cacheDir: string, scene: LobbyAdScene, hash: string, model: string): string | null {
  const store = loadJobStore(cacheDir);
  const record = store.scenes[scene.id];
  const filePath = cachePaths(cacheDir).sceneFile(scene);
  if (record && record.promptHash === hash && record.model === model && existsSync(record.filePath)) {
    return record.filePath;
  }
  if (existsSync(filePath)) return filePath;
  return null;
}

export function rememberCompletedScene(cacheDir: string, record: CachedSceneRecord) {
  const store = loadJobStore(cacheDir);
  store.scenes[record.sceneId] = record;
  saveJobStore(cacheDir, store);
}
