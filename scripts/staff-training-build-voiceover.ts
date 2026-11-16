/**
 * Builds spoken narration from lesson scripts as separate .narration.m4a files.
 * Default voice: American English trainer (edge-tts). Replace per-lesson .narration.m4a under public/training
 * with studio human audio and re-run to swap tracks without re-cutting screen capture.
 * Screen capture stays in <lesson>.mp4 (from <lesson>.screen-only.mp4); the admin player syncs video + narration.
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

function speakToFile(text: string, outPath: string) {
  const spoken = text.replace(/\s+dot\s+/gi, ".").replace(/—/g, ", ");
  const txtPath = path.join(os.tmpdir(), `staff-training-narration-${process.pid}.txt`);
  fs.writeFileSync(txtPath, spoken, "utf8");
  execFileSync(EDGE_TTS, ["--voice", VOICE, "--rate", RATE, "--file", txtPath, "--write-media", outPath], {
    stdio: "inherit"
  });
  fs.unlinkSync(txtPath);
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

    if (!fs.existsSync(videoPath) && !fs.existsSync(backupPath)) {
      throw new Error(`Missing video: ${videoPath}`);
    }

    if (!fs.existsSync(backupPath) && fs.existsSync(videoPath)) {
      fs.copyFileSync(videoPath, backupPath);
    }

    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, videoPath);
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

    console.log(`Published screen capture + narration ${course.slug}/${lesson.slug}`);
  }
}

console.log("staff-training-build-voiceover: ok");