export const TV_DESIGN_WIDTH = 1920;
export const TV_DESIGN_HEIGHT = 1080;

export const TV_VIEWPORT_CONTENT = `width=${TV_DESIGN_WIDTH}, height=${TV_DESIGN_HEIGHT}, initial-scale=1, maximum-scale=1, user-scalable=no`;

export function computeTvDisplayScale(viewportWidth: number, viewportHeight: number) {
  const width = Math.max(viewportWidth, 1);
  const height = Math.max(viewportHeight, 1);
  return Math.min(width / TV_DESIGN_WIDTH, height / TV_DESIGN_HEIGHT);
}

export function applyTvDisplayScale(scale: number) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--fitdog-tv-scale", String(scale));
}

export function clearTvDisplayScale() {
  if (typeof document === "undefined") return;
  document.documentElement.style.removeProperty("--fitdog-tv-scale");
}
