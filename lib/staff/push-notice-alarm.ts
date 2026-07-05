const REPEAT_MS = 120000;

const DOT_MS = 90;
const DOT_GAP_MS = 140;
const GROUP_GAP_MS = 520;

let audioContext: AudioContext | null = null;
let repeatTimer: number | null = null;
let unlocked = false;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
}

/** Short soft tone — one "dot" in the alert pattern. */
function playDot(ctx: AudioContext, startTime: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, startTime);

  const durationSec = DOT_MS / 1000;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.14, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationSec + 0.02);
}

/** Three dots, pause, three dots — minimal attention cue. */
function playDotDotDotTwice(ctx: AudioContext, startTime: number) {
  const dotStep = (DOT_MS + DOT_GAP_MS) / 1000;
  const groupOffset = (3 * dotStep + GROUP_GAP_MS / 1000);

  for (let group = 0; group < 2; group += 1) {
    const groupStart = startTime + group * groupOffset;
    for (let dot = 0; dot < 3; dot += 1) {
      playDot(ctx, groupStart + dot * dotStep);
    }
  }
}

export async function unlockStaffPushNoticeAudio() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    await ctx.resume();
    if (!unlocked) {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      unlocked = true;
    }
  } catch {
    // Ignore unlock failures; alarm may still work on some displays.
  }
}

export function playStaffPushNoticeAlarm() {
  if (typeof window === "undefined") return;

  const ctx = getAudioContext();
  if (!ctx) return;

  void ctx.resume().then(() => {
    playDotDotDotTwice(ctx, ctx.currentTime);
  });
}

/** @deprecated Use playStaffPushNoticeAlarm — same minimal dot-dot-dot pattern. */
export function playStaffPushNoticeAlarmBurst() {
  playStaffPushNoticeAlarm();
}

export function startStaffPushNoticeAlarmLoop(noticeId: string | null) {
  stopStaffPushNoticeAlarmLoop();
  if (!noticeId) return;

  repeatTimer = window.setInterval(() => {
    playStaffPushNoticeAlarm();
  }, REPEAT_MS);
}

export function stopStaffPushNoticeAlarmLoop() {
  if (repeatTimer != null) {
    window.clearInterval(repeatTimer);
    repeatTimer = null;
  }
}
