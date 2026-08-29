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

/**
 * Fully Kiosk often applies page zoom. Lock scale once we detect it so the
 * 1920×1080 canvas can fill the physical screen instead of a zoomed corner.
 */
export const TV_VIEWPORT_CONTENT_KIOSK_LOCKED =
  "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

export type TvViewportBox = {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
};

type VisualViewportReader = {
  width: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
  scale?: number;
};

export type ViewportReader = {
  innerWidth: number;
  innerHeight: number;
  visualViewport?: VisualViewportReader | null;
  document?: {
    documentElement?: { clientWidth: number; clientHeight: number } | null;
    body?: { style?: { zoom?: string } } | null;
  };
  screen?: {
    width?: number;
    height?: number;
    availWidth?: number;
    availHeight?: number;
  } | null;
  navigator?: { userAgent?: string } | null;
  fully?: {
    setScale?: (scale: number) => void;
    getScreenWidth?: () => number;
    getScreenHeight?: () => number;
  } | null;
};

export function isFullyKioskBrowser(win: ViewportReader) {
  if (win.fully && typeof win.fully === "object") return true;
  const ua = win.navigator?.userAgent ?? "";
  return /FullyKiosk|Fully\b/i.test(ua);
}

export function isHiBrowserTv(win: ViewportReader) {
  const ua = win.navigator?.userAgent ?? "";
  return /HiBrowser|Hisense|VIDAA/i.test(ua);
}

/**
 * Hi-Browser fullscreen zoom: visualViewport is a tile of the layout viewport
 * (offset + size ≈ inner). Fully Kiosk page zoom: visualViewport is a cropped
 * corner we must NOT stamp into — fill the layout/screen instead.
 */
export function isCornerCroppedVisualViewport(
  innerW: number,
  innerH: number,
  vv: VisualViewportReader
) {
  if (!(vv.width > 0 && vv.height > 0)) return false;
  const cropped =
    vv.offsetLeft > 48 ||
    vv.offsetTop > 48 ||
    vv.width < innerW * 0.85 ||
    vv.height < innerH * 0.85;
  const scale = vv.scale ?? 1;
  return cropped && scale >= 1;
}

/** @deprecated kept for tests — prefer isCornerCroppedVisualViewport */
export function isLayoutTiledVisualViewport(
  innerW: number,
  innerH: number,
  vv: VisualViewportReader
) {
  if (!(vv.width > 0 && vv.height > 0)) return false;
  const coversX = vv.offsetLeft + vv.width >= innerW * 0.92;
  const coversY = vv.offsetTop + vv.height >= innerH * 0.92;
  const isPartial =
    vv.width <= innerW * 0.98 ||
    vv.height <= innerH * 0.98 ||
    vv.offsetLeft > 1 ||
    vv.offsetTop > 1;
  return isPartial && coversX && coversY;
}

/** Best-effort zoom reset for Fully Kiosk / WebView page zoom. */
export function resetTvBrowserZoom(win: ViewportReader) {
  try {
    win.fully?.setScale?.(1);
  } catch {
    // Fully bridge may reject outside lockdown scripts.
  }
  try {
    const bodyStyle = win.document?.body?.style;
    if (bodyStyle && "zoom" in bodyStyle) {
      bodyStyle.zoom = "1";
    }
  } catch {
    // ignore
  }
}

export function measureTvViewport(win: ViewportReader): TvViewportBox {
  const innerW = Math.max(win.innerWidth || 0, 1);
  const innerH = Math.max(win.innerHeight || 0, 1);
  const clientW = Math.max(win.document?.documentElement?.clientWidth || 0, innerW);
  const clientH = Math.max(win.document?.documentElement?.clientHeight || 0, innerH);
  const vv = win.visualViewport;
  const fullyKiosk = isFullyKioskBrowser(win);
  const hiBrowser = isHiBrowserTv(win);

  const layoutBox = (): TvViewportBox => {
    let width = Math.min(innerW, clientW);
    let height = Math.min(innerH, clientH);
    if (fullyKiosk) {
      const fullyW = Number(win.fully?.getScreenWidth?.() || 0);
      const fullyH = Number(win.fully?.getScreenHeight?.() || 0);
      const screenW = Math.max(fullyW, win.screen?.availWidth || 0, win.screen?.width || 0);
      const screenH = Math.max(fullyH, win.screen?.availHeight || 0, win.screen?.height || 0);
      if (width < 1280 && screenW >= 1280) width = screenW;
      if (height < 720 && screenH >= 720) height = screenH;
    }
    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
      offsetLeft: 0,
      offsetTop: 0
    };
  };

  // Fully Kiosk / generic page-zoom crop: fill the physical screen.
  if (fullyKiosk) return layoutBox();
  if (
    vv &&
    !hiBrowser &&
    isCornerCroppedVisualViewport(innerW, innerH, vv)
  ) {
    return layoutBox();
  }

  // Hi-Browser / generic WebView: visualViewport is the true visible surface.
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
