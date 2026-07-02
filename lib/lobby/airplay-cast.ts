type AirPlayVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
  webkitPlaybackTargetAvailabilityChangedEvent?: Event;
  webkitplaybacktargetavailabilitychanged?: Event;
};

type DisplayMediaConstraints = MediaStreamConstraints & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: "include" | "exclude";
  monitorTypeSurfaces?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
};

let activeAirPlayStream: MediaStream | null = null;
let activeAirPlayVideo: AirPlayVideo | null = null;

function hasWebkitAirPlayPicker(video: AirPlayVideo) {
  return typeof video.webkitShowPlaybackTargetPicker === "function";
}

export function isAirPlayPickerSupported() {
  if (typeof document === "undefined") return false;
  const video = document.createElement("video") as AirPlayVideo;
  return hasWebkitAirPlayPicker(video);
}

export function isAppleDevice() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) || /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isChromeOnMac() {
  if (typeof navigator === "undefined") return false;
  return /Chrome|Chromium|Edg/i.test(navigator.userAgent) && !/OPR|Opera/i.test(navigator.userAgent) && /Mac/i.test(navigator.userAgent);
}

export function isDisplayMediaSupported() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

/** True when this browser can start the tab-capture + AirPlay picker flow. */
export function isAirPlayCastAvailable() {
  if (isAirPlayPickerSupported()) return true;
  if (isAppleDevice() && isDisplayMediaSupported()) return true;
  if (isChromeOnMac() && isDisplayMediaSupported()) return true;
  return false;
}

function cleanupAirPlayPreview() {
  activeAirPlayStream?.getTracks().forEach((track) => track.stop());
  activeAirPlayStream = null;
  activeAirPlayVideo?.remove();
  activeAirPlayVideo = null;
}

function createAirPlayVideo(stream: MediaStream) {
  const video = document.createElement("video") as AirPlayVideo;
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.setAttribute("webkit-playsinline", "true");
  video.setAttribute("x-webkit-airplay", "allow");
  video.setAttribute("airplay", "allow");
  video.setAttribute("disableRemotePlayback", "false");
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  video.style.inset = "0";
  document.body.appendChild(video);
  video.srcObject = stream;
  return video;
}

async function requestTabCaptureStream() {
  const advanced: DisplayMediaConstraints = {
    video: {
      displaySurface: "browser"
    },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    monitorTypeSurfaces: "exclude",
    surfaceSwitching: "include"
  };

  try {
    return await navigator.mediaDevices.getDisplayMedia(advanced);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/cancel|abort|denied|dismiss/i.test(message)) {
      throw error;
    }

    return navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });
  }
}

function showAirPlayPicker(video: AirPlayVideo) {
  if (hasWebkitAirPlayPicker(video)) {
    video.webkitShowPlaybackTargetPicker!();
    return true;
  }
  return false;
}

export async function startAirPlayCast() {
  if (!isAirPlayCastAvailable()) {
    throw new Error("AirPlay is not supported in this browser.");
  }

  if (!isDisplayMediaSupported()) {
    throw new Error("Screen sharing is not supported in this browser.");
  }

  cleanupAirPlayPreview();

  const stream = await requestTabCaptureStream();
  const video = createAirPlayVideo(stream);

  try {
    await video.play();
  } catch {
    // Some browsers resolve play() after the capture stream is already running.
  }

  activeAirPlayStream = stream;
  activeAirPlayVideo = video;

  stream.getVideoTracks()[0]?.addEventListener("ended", () => {
    cleanupAirPlayPreview();
  });

  if (showAirPlayPicker(video)) {
    return;
  }

  // Chrome on Mac may only expose the picker after the video element is attached and playing.
  await new Promise((resolve) => window.setTimeout(resolve, 150));
  if (showAirPlayPicker(video)) {
    return;
  }

  cleanupAirPlayPreview();
  throw new Error(
    "AirPlay picker did not open. In Chrome, choose “This tab”, then use the AirPlay icon in the address bar or Control Center."
  );
}

export function stopAirPlayCast() {
  cleanupAirPlayPreview();
}

export function isAirPlayCastActive() {
  return Boolean(activeAirPlayStream);
}
