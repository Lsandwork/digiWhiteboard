const ALARM_REPEAT_MS = 30000;
const BURST_ROUNDS = 3;
const BURST_ROUND_GAP_MS = 900;

let audioContext: AudioContext | null = null;
let repeatTimer: number | null = null;
let burstTimer: number | null = null;
let unlocked = false;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
}

function playBeep(ctx: AudioContext, startTime: number, frequency: number, durationSec: number, volume = 0.42) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationSec + 0.02);
}

function playAlarmRound(ctx: AudioContext, startTime: number) {
  playBeep(ctx, startTime, 920, 0.16, 0.44);
  playBeep(ctx, startTime + 0.17, 920, 0.16, 0.44);
  playBeep(ctx, startTime + 0.34, 780, 0.2, 0.4);
  playBeep(ctx, startTime + 0.56, 780, 0.2, 0.38);
  playBeep(ctx, startTime + 0.78, 1040, 0.24, 0.42);
  playBeep(ctx, startTime + 1.04, 1040, 0.24, 0.4);
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
    playAlarmRound(ctx, ctx.currentTime);
  });
}

export function playStaffPushNoticeAlarmBurst() {
  if (typeof window === "undefined") return;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (burstTimer != null) {
    window.clearTimeout(burstTimer);
    burstTimer = null;
  }

  void ctx.resume().then(() => {
    for (let round = 0; round < BURST_ROUNDS; round += 1) {
      window.setTimeout(() => {
        playAlarmRound(ctx, ctx.currentTime);
      }, round * BURST_ROUND_GAP_MS);
    }
  });
}

export function startStaffPushNoticeAlarmLoop(noticeId: string | null) {
  stopStaffPushNoticeAlarmLoop();
  if (!noticeId) return;

  repeatTimer = window.setInterval(() => {
    playStaffPushNoticeAlarmBurst();
  }, ALARM_REPEAT_MS);
}

export function stopStaffPushNoticeAlarmLoop() {
  if (repeatTimer != null) {
    window.clearInterval(repeatTimer);
    repeatTimer = null;
  }
  if (burstTimer != null) {
    window.clearTimeout(burstTimer);
    burstTimer = null;
  }
}
