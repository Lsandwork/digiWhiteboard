type AirPlayVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
};

let activeAirPlayStream: MediaStream | null = null;
let activeAirPlayVideo: AirPlayVideo | null = null;

export function isAirPlayPickerSupported() {
  if (typeof document === "undefined") return false;
  const video = document.createElement("video") as AirPlayVideo;
  return typeof video.webkitShowPlaybackTargetPicker === "function";
}

export function isAppleDevice() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) || /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isDisplayMediaSupported() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

function cleanupAirPlayPreview() {
  activeAirPlayStream?.getTracks().forEach((track) => track.stop());
  activeAirPlayStream = null;
  activeAirPlayVideo?.remove();
  activeAirPlayVideo = null;
}

export async function startAirPlayCast() {
  if (!isDisplayMediaSupported()) {
    throw new Error("Screen sharing is not supported in this browser.");
  }

  cleanupAirPlayPreview();

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: "browser"
    },
    audio: false,
    preferCurrentTab: true
  } as MediaStreamConstraints & { preferCurrentTab?: boolean });

  const video = document.createElement("video") as AirPlayVideo;
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.setAttribute("webkit-playsinline", "true");
  video.setAttribute("x-webkit-airplay", "allow");
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  video.style.inset = "0";
  document.body.appendChild(video);

  video.srcObject = stream;
  await video.play();

  activeAirPlayStream = stream;
  activeAirPlayVideo = video;

  stream.getVideoTracks()[0]?.addEventListener("ended", () => {
    cleanupAirPlayPreview();
  });

  if (typeof video.webkitShowPlaybackTargetPicker === "function") {
    video.webkitShowPlaybackTargetPicker();
    return;
  }

  throw new Error("AirPlay picker is not available. Use Control Center → Screen Mirroring on this device.");
}

export function stopAirPlayCast() {
  cleanupAirPlayPreview();
}

export function isAirPlayCastActive() {
  return Boolean(activeAirPlayStream);
}
