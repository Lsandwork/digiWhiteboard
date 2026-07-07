const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function isValidYouTubeVideoId(videoId: string) {
  return YOUTUBE_VIDEO_ID_PATTERN.test(videoId);
}

export function buildYouTubeEmbedUrl(videoId: string) {
  if (!isValidYouTubeVideoId(videoId)) {
    throw new Error("Invalid YouTube video ID.");
  }
  const params = new URLSearchParams({
    autoplay: "0",
    mute: "1",
    playsinline: "1",
    rel: "0"
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

/** Full-screen yard cast overlay — autoplay muted until staff enables sound. */
export function buildYouTubeCastEmbedUrl(videoId: string, options?: { muted?: boolean }) {
  if (!isValidYouTubeVideoId(videoId)) {
    throw new Error("Invalid YouTube video ID.");
  }
  const params = new URLSearchParams({
    autoplay: "1",
    mute: options?.muted === false ? "0" : "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    enablejsapi: "1",
    iv_load_policy: "3"
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function youtubeThumbnailUrl(videoId: string) {
  if (!isValidYouTubeVideoId(videoId)) return null;
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function buildYouTubeWatchUrl(videoId: string) {
  if (!isValidYouTubeVideoId(videoId)) {
    throw new Error("Invalid YouTube video ID.");
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}
