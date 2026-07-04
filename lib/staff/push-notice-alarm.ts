const ALARM_REPEAT_MS = 45000;

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

function playBeep(ctx: AudioContext, startTime: number, frequency: number, durationSec: number, volume = 0.32) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationSec + 0.02);
}

export async function unlockStaffPushNoticeAudio() {
  const ctx = getAudioContext();
  if (!ctx || unlocked) return;
  try {
    await ctx.resume();
    unlocked = true;
  } catch {
    // Ignore unlock failures; alarm may still work on some displays.
  }
}

export function playStaffPushNoticeAlarm() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  void ctx.resume().then(() => {
    const now = ctx.currentTime;
    playBeep(ctx, now, 880, 0.14, 0.34);
    playBeep(ctx, now + 0.18, 880, 0.14, 0.34);
    playBeep(ctx, now + 0.36, 740, 0.22, 0.3);
    playBeep(ctx, now + 0.62, 740, 0.22, 0.28);
  });
}

export function startStaffPushNoticeAlarmLoop(noticeId: string | null, onRepeat?: () => void) {
  stopStaffPushNoticeAlarmLoop();
  if (!noticeId) return;

  repeatTimer = window.setInterval(() => {
    playStaffPushNoticeAlarm();
    onRepeat?.();
  }, ALARM_REPEAT_MS);
}

export function stopStaffPushNoticeAlarmLoop() {
  if (repeatTimer != null) {
    window.clearInterval(repeatTimer);
    repeatTimer = null;
  }
}
