/**
 * Builds spoken narration from lesson scripts and muxes into training MP4s.
 * Default voice: American English trainer (edge-tts). Replace per-lesson .narration.m4a under public/training
 * with studio human audio and re-run to swap tracks without re-cutting screen capture.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STAFF_TRAINING_COURSES } from "../lib/staff-training/catalog";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EDGE_TTS = "/home/ubuntu/.local/bin/edge-tts";
const VOICE = process.env.STAFF_TRAINING_VOICE ?? "en-US-JennyNeural";
const RATE = process.env.STAFF_TRAINING_SPEECH_RATE ?? "+0%";

function durationSeconds(file: string) {
  const raw = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nokey=1:noprint_wrappers=1", file],
    { encoding: "utf8" }
  ).trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Could not probe duration for ${file}`);
  return n;
}

function speakToFile(text: string, outPath: string) {
  const spoken = text.replace(/\s+dot\s+/gi, ".").replace(/—/g, ", ");
  const txtPath = path.join(os.tmpdir(), `staff-training-narration-${process.pid}.txt`);
  fs.writeFileSync(txtPath, spoken, "utf8");
  execFileSync(EDGE_TTS, ["--voice", VOICE, "--rate", RATE, "--file", txtPath, "--write-media", outPath], {
    stdio: "inherit"
  });
  fs.unlinkSync(txtPath);
}

function muxVideoAudio(videoPath: string, audioPath: string, outPath: string) {
  const vDur = durationSeconds(videoPath);
  const aDur = durationSeconds(audioPath);
  const padVideo = Math.max(0, aDur - vDur + 0.35);
  const padAudio = Math.max(0, vDur - aDur + 0.15);

  const filter =
    padVideo > 0.05
      ? `[0:v]tpad=stop_mode=clone:stop_duration=${padVideo.toFixed(3)}[v]`
      : "[0:v]copy[v]";
  const audioFilter = padAudio > 0.05 ? `[1:a]apad=pad_dur=${padAudio.toFixed(3)}[a]` : "[1:a]anull[a]";

  if (padVideo > 0.05) {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        videoPath,
        "-i",
        audioPath,
        "-filter_complex",
        `${filter};${audioFilter}`,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        outPath
      ],
      { stdio: "inherit" }
    );
  } else {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        videoPath,
        "-i",
        audioPath,
        "-filter_complex",
        audioFilter,
        "-map",
        "0:v:0",
        "-map",
        "[a]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        outPath
      ],
      { stdio: "inherit" }
    );
  }
}

function lessonDir(course: string, lesson: string) {
  return path.join(ROOT, "public", "training", course, lesson);
}

for (const course of STAFF_TRAINING_COURSES) {
  for (const lesson of course.lessons) {
    const base = lessonDir(course.slug, lesson.slug);
    const videoPath = `${base}.mp4`;
    const narrationPath = `${base}.narration.m4a`;
    const backupPath = `${base}.screen-only.mp4`;
    const outPath = `${base}.mp4`;

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Missing video: ${videoPath}`);
    }

    if (!fs.existsSync(narrationPath)) {
      const tmp = path.join(os.tmpdir(), `${course.slug}-${lesson.slug}.m4a`);
      console.log(`Synthesize ${course.slug}/${lesson.slug} (${VOICE})`);
      speakToFile(lesson.narrationScript, tmp);
      execFileSync(
        "ffmpeg",
        ["-y", "-i", tmp, "-c:a", "aac", "-b:a", "128k", narrationPath],
        { stdio: "ignore" }
      );
      fs.unlinkSync(tmp);
    } else {
      console.log(`Reuse narration ${course.slug}/${lesson.slug}`);
    }

    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(videoPath, backupPath);
    }

    const staged = `${base}.muxed.mp4`;
    muxVideoAudio(backupPath, narrationPath, staged);
    fs.renameSync(staged, outPath);
    console.log(`Muxed ${course.slug}/${lesson.slug}`);
  }
}

console.log("staff-training-build-voiceover: ok");