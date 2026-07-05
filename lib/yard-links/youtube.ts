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

export function buildYouTubeWatchUrl(videoId: string) {
  if (!isValidYouTubeVideoId(videoId)) {
    throw new Error("Invalid YouTube video ID.");
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}
