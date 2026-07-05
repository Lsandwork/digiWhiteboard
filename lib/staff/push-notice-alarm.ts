export const FITDOG_ALERT_SOUND_URL = "/assets/fitdog/audio/fitdog-alert.wav";

let audio: HTMLAudioElement | null = null;
let unlocked = false;

function getAlertAudio() {
  if (typeof window === "undefined") return null;
  if (!audio) {
    audio = new Audio(FITDOG_ALERT_SOUND_URL);
    audio.preload = "auto";
    audio.loop = false;
  }
  return audio;
}

export async function unlockStaffPushNoticeAudio() {
  const el = getAlertAudio();
  if (!el || unlocked) return;

  try {
    const previousVolume = el.volume;
    el.volume = 0.001;
    el.currentTime = 0;
    await el.play();
    el.pause();
    el.currentTime = 0;
    el.volume = previousVolume;
    unlocked = true;
  } catch {
    // Ignore unlock failures; alarm may still work after user interaction.
  }
}

export function playStaffPushNoticeAlarm() {
  if (typeof window === "undefined") return;

  const el = getAlertAudio();
  if (!el) return;

  el.loop = false;
  el.currentTime = 0;
  void unlockStaffPushNoticeAudio().finally(() => {
    void el.play().catch(() => {
      // Autoplay may be blocked until the display receives a gesture.
    });
  });
}

/** @deprecated Same as playStaffPushNoticeAlarm — plays the Fitdog alert once. */
export function playStaffPushNoticeAlarmBurst() {
  playStaffPushNoticeAlarm();
}

/** @deprecated Alerts play once; looping is disabled. */
export function startStaffPushNoticeAlarmLoop(_noticeId: string | null) {}

/** @deprecated Alerts play once; looping is disabled. */
export function stopStaffPushNoticeAlarmLoop() {}
