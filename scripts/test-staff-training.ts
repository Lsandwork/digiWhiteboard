import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { STAFF_TRAINING_COURSES, courseForRole, estimatedCourseMinutes } from "../lib/staff-training/catalog";
import { canAccessAdminTab, accessFromLegacyRole } from "../lib/admin/permissions";

function tab(role: string, tab: string) {
  const access = accessFromLegacyRole(null, `${role}@example.com`, role);
  return canAccessAdminTab(access, tab, role, "staff");
}

assert.equal(tab("front_desk_coordinator", "staff_training"), true);
assert.equal(tab("overnight", "staff_training"), true);
assert.equal(tab("assistant_manager", "staff_training"), true);
assert.equal(tab("daycare", "staff_training"), false);
assert.equal(tab("manager_admin", "staff_training"), true);
assert.equal(tab("owner_admin", "staff_training"), true);

const fd = courseForRole("front_desk_coordinator");
const on = courseForRole("overnight");
assert.ok(fd && fd.lessons.length >= 8);
assert.ok(on && on.lessons.length >= 6);
assert.ok(fd.lessons.every((l) => l.narrationScript.length > 40));
assert.ok(on.lessons.every((l) => l.narrationStatus === "recorded"));
assert.ok(fd.lessons.every((l) => l.narrationStatus === "recorded"));
for (const course of STAFF_TRAINING_COURSES) {
  for (const lesson of course.lessons) {
    assert.equal(lesson.videoStatus, "ready", `${course.slug}/${lesson.slug} video`);
    assert.ok(lesson.videoSrc?.endsWith(`/${lesson.slug}.mp4`));
    assert.ok(lesson.narrationAudioSrc?.endsWith(`/${lesson.slug}.narration.m4a`));
    assert.ok(lesson.captionsVtt?.endsWith(`/${lesson.slug}.vtt`));
    assert.ok(fs.existsSync(`public${lesson.videoSrc}`), lesson.videoSrc);
    assert.ok(fs.existsSync(`public${lesson.narrationAudioSrc}`), lesson.narrationAudioSrc);
    assert.ok(fs.existsSync(`public${lesson.captionsVtt}`), lesson.captionsVtt);
    const screenBackup = `public/training/${course.slug}/${lesson.slug}.screen-only.mp4`;
    assert.ok(fs.existsSync(screenBackup), screenBackup);
    const videoProbe = execFileSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v", "-show_entries", "stream=codec_type", "-of", "csv=p=0", `public${lesson.videoSrc}`],
      { encoding: "utf8" }
    ).trim();
    assert.equal(videoProbe, "video", `expected video in ${lesson.videoSrc}`);
    const muxedAudio = execFileSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", `public${lesson.videoSrc}`],
      { encoding: "utf8" }
    ).trim();
    assert.equal(muxedAudio, "", `lesson mp4 must be screen-only (no muxed audio): ${lesson.videoSrc}`);
    const narrationAudio = execFileSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", `public${lesson.narrationAudioSrc}`],
      { encoding: "utf8" }
    ).trim();
    assert.equal(narrationAudio, "audio", `expected narration audio in ${lesson.narrationAudioSrc}`);
  }
}
assert.equal(fd.lessons.some((l) => l.verificationNotes?.length), true);
assert.ok(estimatedCourseMinutes(fd) > 30);

console.log("test-staff-training: ok");