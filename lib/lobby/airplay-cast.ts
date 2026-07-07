import {
  getPresentationRequestConstructor,
  isPresentationCastSupported,
  setActivePresentationConnection
} from "@/lib/lobby/tv-cast";

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

function isCastCancelled(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /cancel|abort|denied|dismiss/i.test(message);
}

export function isIosMobile() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
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

/** Desktop/Mac flow that mirrors the current tab through getDisplayMedia. */
export function supportsTabCaptureAirPlay() {
  if (!isDisplayMediaSupported()) return false;
  if (isAirPlayPickerSupported()) return true;
  if (isAppleDevice()) return true;
  if (isChromeOnMac()) return true;
  return false;
}

/** True when this browser can start any AirPlay flow (tab capture or mobile URL handoff). */
export function isAirPlayCastAvailable() {
  if (supportsTabCaptureAirPlay()) return true;
  if (isIosMobile() && isAirPlayPickerSupported()) return true;
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

async function startTabCaptureAirPlayCast() {
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

function isAlreadyOnTvLayout(castUrl: string) {
  try {
    const target = new URL(castUrl, window.location.href);
    if (target.pathname.startsWith("/display/")) return true;
    return target.searchParams.get("display") === "tv";
  } catch {
    return window.location.pathname.startsWith("/display/") || new URL(window.location.href).searchParams.get("display") === "tv";
  }
}

async function startPresentationUrlCast(castUrl: string) {
  const PresentationRequestCtor = getPresentationRequestConstructor();
  if (!PresentationRequestCtor) {
    throw new Error("Wireless display is not supported in this browser.");
  }

  const request = new PresentationRequestCtor([castUrl]);
  const connection = await request.start();
  setActivePresentationConnection(connection);
}

/** iOS/mobile flow that casts the dedicated TV URL instead of mirroring the tab. */
export async function startMobileUrlAirPlayCast(castUrl: string) {
  if (isPresentationCastSupported()) {
    await startPresentationUrlCast(castUrl);
    return;
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: "Fitdog TV Board",
        text: "Open this link on your TV browser or cast from your phone.",
        url: castUrl
      });
      return;
    } catch (error) {
      if (isCastCancelled(error)) throw error;
    }
  }

  if (!isAlreadyOnTvLayout(castUrl)) {
    window.location.assign(castUrl);
    return;
  }

  const { requestDocumentFullscreen } = await import("@/lib/lobby/tv-cast");
  await requestDocumentFullscreen();

  throw new Error(
    "Use Control Center → Screen Mirroring and choose your Apple TV. This board is already in TV mode."
  );
}

export async function startAirPlayCast(castUrl?: string) {
  if (!isAirPlayCastAvailable()) {
    throw new Error("AirPlay is not supported in this browser.");
  }

  if (supportsTabCaptureAirPlay()) {
    await startTabCaptureAirPlayCast();
    return;
  }

  if (!castUrl) {
    throw new Error("Screen sharing is not supported in this browser. Copy the TV link instead.");
  }

  await startMobileUrlAirPlayCast(castUrl);
}

export function stopAirPlayCast() {
  cleanupAirPlayPreview();
}

export function isAirPlayCastActive() {
  return Boolean(activeAirPlayStream);
}
