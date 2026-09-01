import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captionSvg } from "../lib/video-generation/captions";
import { providerSnapshot, resolveVideoGenerationConfig } from "../lib/video-generation/config";
import {
  REAL_FITDOG_CIRCLE_BADGE,
  REAL_FITDOG_LOCKUP_LIGHT,
  LOBBY_AD_HEIGHT,
  LOBBY_AD_WIDTH
} from "../lib/video-generation/constants";
import { estimateGenerationCost } from "../lib/video-generation/cost";
import { endCardUsesRealLogo, renderEndCardVideo } from "../lib/video-generation/end-card";
import { probeJson, runFfmpeg } from "../lib/video-generation/ffmpeg";
import { scenePrompt } from "../lib/video-generation/prompts";
import { describeVeoStartFailure } from "../lib/video-generation/providers/google-veo";
import { resolveVideoGenerationProvider } from "../lib/video-generation/providers/resolve";
import { MIRACULOUS_RECOVERY_SCENES, END_CARD_SCENE, targetTimelineSeconds } from "../lib/video-generation/scenes";
import { stitchLobbyAd } from "../lib/video-generation/stitch";
import { assertLobbyAdOutput } from "../lib/video-generation/validate";
import { completedScenePath, promptHash, rememberCompletedScene } from "../lib/video-generation/cache";

assert.equal(targetTimelineSeconds(), 20, "4+3+3+4+4+2 = 20s lobby length");
assert.equal(MIRACULOUS_RECOVERY_SCENES.length, 5);
assert.ok(MIRACULOUS_RECOVERY_SCENES.every((scene) => scene.fileName.endsWith(".mp4")));

const sick = MIRACULOUS_RECOVERY_SCENES[0]!;
const arrival = MIRACULOUS_RECOVERY_SCENES[4]!;
assert.match(scenePrompt(sick), /Dude\.\.\. you really don't feel good, huh\?/);
assert.match(scenePrompt(MIRACULOUS_RECOVERY_SCENES[1]!), /cancel FitDog today/);
assert.match(scenePrompt(arrival), /1712/);
assert.match(scenePrompt(arrival), /red brick/i);

const caption = captionSvg(sick.caption);
assert.match(caption, /TOO SICK/);
assert.match(caption, /#F15F2A/);
assert.match(caption, /WHEN YOUR DOG IS/);

const endCardSource = readFileSync("lib/video-generation/end-card.ts", "utf8");
assert.equal(endCardUsesRealLogo(), true);
assert.match(endCardSource, /REAL_FITDOG_LOCKUP_LIGHT/);
assert.equal(existsSync(REAL_FITDOG_LOCKUP_LIGHT), true);
assert.equal(existsSync(REAL_FITDOG_CIRCLE_BADGE), true);

const previousGemini = process.env.GEMINI_API_KEY;
const previousGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const previousVideo = process.env.VIDEO_GENERATION_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
delete process.env.VIDEO_GENERATION_API_KEY;

const snapshot = providerSnapshot(resolveVideoGenerationConfig());
assert.equal(snapshot.configured, false);
assert.throws(() => resolveVideoGenerationProvider(resolveVideoGenerationConfig()), /No video-generation credentials/);

const cost = estimateGenerationCost({
  provider: "google-veo",
  model: "veo-3.1-fast-generate-preview",
  resolution: "1080p"
});
assert.equal(cost.sceneCount, 5);
assert.equal(cost.billedSeconds, 40);
assert.equal(cost.estimatedUsd, 4.8);

if (previousGemini === undefined) delete process.env.GEMINI_API_KEY;
else process.env.GEMINI_API_KEY = previousGemini;
if (previousGoogle === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
else process.env.GOOGLE_GENERATIVE_AI_API_KEY = previousGoogle;
if (previousVideo === undefined) delete process.env.VIDEO_GENERATION_API_KEY;
else process.env.VIDEO_GENERATION_API_KEY = previousVideo;

const cacheDir = mkdtempSync(join(tmpdir(), "lobby-ad-cache-"));
rememberCompletedScene(cacheDir, {
  sceneId: "scene-01",
  promptHash: "abc",
  model: "veo-3.1-fast-generate-preview",
  jobId: "operations/test",
  filePath: join(cacheDir, "scene-01.mp4"),
  completedAt: new Date().toISOString()
});
writeFileSync(join(cacheDir, "scene-01.mp4"), "not-a-real-mp4-but-exists");
assert.equal(
  completedScenePath(
    cacheDir,
    MIRACULOUS_RECOVERY_SCENES[0]!,
    "abc",
    "veo-3.1-fast-generate-preview"
  ),
  join(cacheDir, "scene-01.mp4")
);
assert.ok(promptHash({ prompt: "a", durationSeconds: 8, resolution: "1080p" }) !== promptHash({ prompt: "b", durationSeconds: 8, resolution: "1080p" }));

const quotaError = describeVeoStartFailure(429, {
  error: { message: "You exceeded your current quota, please check your plan and billing details." }
});
assert.match(quotaError, /HTTP 429/);
assert.match(quotaError, /free tier/i);
assert.match(quotaError, /typically not billed/);

function makeClip(path: string, color: string, seconds: number) {
  runFfmpeg(
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=${LOBBY_AD_WIDTH}x${LOBBY_AD_HEIGHT}:d=${seconds}:r=24`,
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=" + seconds,
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      path
    ],
    `synthetic ${path}`
  );
}

async function runStitchFixture() {
  const work = mkdtempSync(join(tmpdir(), "lobby-ad-stitch-"));
  const clipsDir = join(work, "clips");
  mkdirSync(clipsDir);
  const colors = ["#1a1a1a", "#2a2a2a", "#333333", "#111111", "#222222"];
  const liveClips = MIRACULOUS_RECOVERY_SCENES.map((scene, index) => {
    const path = join(clipsDir, scene.fileName);
    makeClip(path, colors[index]!, 5);
    return { scene, inputPath: path };
  });

  const endCardPath = join(clipsDir, "end-card.mp4");
  await renderEndCardVideo(endCardPath, join(work, "end-card-work"));
  const stitched = join(work, "the-miraculous-recovery.mp4");
  await stitchLobbyAd([...liveClips, { scene: END_CARD_SCENE, inputPath: endCardPath }], stitched, join(work, "stitch"));
  const probe = probeJson(stitched);
  assertLobbyAdOutput(stitched, probe);
  assert.ok(probe.duration >= 19.5 && probe.duration <= 20.5, `duration ${probe.duration}`);
  assert.equal(probe.width, 1920);
  assert.equal(probe.height, 1080);
  console.log("video-generation pipeline tests passed");
  console.log(`stitch fixture: ${stitched} ${probe.duration.toFixed(2)}s ${probe.width}x${probe.height} ${probe.videoCodec}/${probe.audioCodec}`);
}

runStitchFixture().catch((error) => {
  console.error(error);
  process.exit(1);
});
