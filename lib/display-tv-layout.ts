export const TV_DESIGN_WIDTH = 1920;
export const TV_DESIGN_HEIGHT = 1080;

/**
 * Never pin the CSS viewport to 1920×1080. TV browsers (Hi-Browser on Hisense,
 * Android WebView fullscreen) treat a fixed-width viewport as a zoom: the 1920
 * canvas is shown at 1:1 inside a smaller visual area (a corner of the page)
 * and `user-scalable=no` blocks zoom-out.
 */
export const TV_VIEWPORT_CONTENT =
  "width=device-width, initial-scale=1, minimum-scale=0.25, maximum-scale=5, viewport-fit=cover";

export type TvViewportBox = {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
};

type ViewportReader = {
  innerWidth: number;
  innerHeight: number;
  visualViewport?: {
    width: number;
    height: number;
    offsetLeft: number;
    offsetTop: number;
    scale?: number;
  } | null;
  document?: {
    documentElement?: { clientWidth: number; clientHeight: number } | null;
  };
};

export function measureTvViewport(win: ViewportReader): TvViewportBox {
  const innerW = Math.max(win.innerWidth || 0, 1);
  const innerH = Math.max(win.innerHeight || 0, 1);
  const clientW = Math.max(win.document?.documentElement?.clientWidth || 0, innerW);
  const clientH = Math.max(win.document?.documentElement?.clientHeight || 0, innerH);
  const vv = win.visualViewport;
  const visibleW = vv?.width && vv.width > 0 ? vv.width : innerW;
  const visibleH = vv?.height && vv.height > 0 ? vv.height : innerH;

  return {
    width: Math.max(1, Math.min(innerW, clientW, visibleW)),
    height: Math.max(1, Math.min(innerH, clientH, visibleH)),
    offsetLeft: vv?.offsetLeft ?? 0,
    offsetTop: vv?.offsetTop ?? 0
  };
}

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

export function applyTvStageToVisibleViewport(stage: HTMLElement, box: TvViewportBox) {
  stage.style.position = "fixed";
  stage.style.inset = "auto";
  stage.style.left = `${box.offsetLeft}px`;
  stage.style.top = `${box.offsetTop}px`;
  stage.style.width = `${box.width}px`;
  stage.style.height = `${box.height}px`;
  stage.style.right = "auto";
  stage.style.bottom = "auto";
}

export function clearTvStageBox(stage: HTMLElement) {
  stage.style.removeProperty("position");
  stage.style.removeProperty("inset");
  stage.style.removeProperty("left");
  stage.style.removeProperty("top");
  stage.style.removeProperty("width");
  stage.style.removeProperty("height");
  stage.style.removeProperty("right");
  stage.style.removeProperty("bottom");
}
