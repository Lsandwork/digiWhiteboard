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
 * Digital-signage lock: page zoom must stay at 100% so the 1920×1080 canvas
 * can fill the physical screen instead of a zoomed corner crop.
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
    documentElement?: {
      clientWidth: number;
      clientHeight: number;
      style?: { zoom?: string };
    } | null;
    body?: { style?: { zoom?: string } } | null;
  };
  screen?: {
    width?: number;
    height?: number;
    availWidth?: number;
    availHeight?: number;
  } | null;
  navigator?: { userAgent?: string } | null;
  scrollTo?: (x: number, y: number) => void;
  fully?: {
    setScale?: (scale: number) => void;
    resetScale?: () => void;
    getScale?: () => number;
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

function isHdLandscapeScreen(win: ViewportReader) {
  const width = Math.max(
    win.innerWidth || 0,
    win.screen?.availWidth || 0,
    win.screen?.width || 0
  );
  const height = Math.max(
    win.innerHeight || 0,
    win.screen?.availHeight || 0,
    win.screen?.height || 0
  );
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  return longSide >= 1280 && shortSide >= 720;
}

/** Google TV Streamer (and the built-in Internet app) / Android TV / Chromecast. */
export function isGoogleTvStreamerBrowser(win: ViewportReader) {
  const ua = win.navigator?.userAgent ?? "";
  if (/TV Streamer|Google TV Streamer|GoogleTV|Google TV|Android TV|AndroidTV|; TV;|CrKey/i.test(ua)) {
    return true;
  }
  // Some Streamer Internet builds are a generic Android WebView without "TV" in the UA.
  return /Android\s+\d+/i.test(ua) && /; wv\)/i.test(ua) && /Mobile Safari/i.test(ua) && isHdLandscapeScreen(win);
}

/** Any TV / signage browser that should use the 1920×1080 fit canvas. */
export function isTvDisplayBrowser(win: ViewportReader) {
  if (isFullyKioskBrowser(win) || isHiBrowserTv(win) || isGoogleTvStreamerBrowser(win)) return true;
  const ua = win.navigator?.userAgent ?? "";
  return /SMART-TV|SmartTV|SMART TV|Tizen|Web0S|WebOS|BRAVIA|AFT[A-Z0-9]|Chromecast|HbbTV|NetCast|VIZIO/i.test(ua);
}

/**
 * Page/webview zoom crop: visualViewport is a small corner of the layout.
 * Stamping the 1920 canvas into that corner (or leaving scale=1 under zoom)
 * produces the postage-stamp / zoomed-in TV failure.
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

/**
 * Fully Kiosk / Hi-Browser: pin page zoom so the first paint is not a cropped
 * zoomed frame. Google Streamer Internet app must keep zoom working — locking
 * `user-scalable=no` is why TV remote zoom in/out does nothing there.
 */
export function shouldLockTvKioskViewport(win: ViewportReader) {
  if (isGoogleTvStreamerBrowser(win)) return false;
  if (isFullyKioskBrowser(win)) return true;
  if (!isHiBrowserTv(win)) return false;
  const vv = win.visualViewport;
  if (!vv) return false;
  const innerW = Math.max(win.innerWidth || 0, 1);
  const innerH = Math.max(win.innerHeight || 0, 1);
  if (isCornerCroppedVisualViewport(innerW, innerH, vv)) return true;
  return (vv.scale ?? 1) > 1.02;
}

/**
 * Full-bleed stage (inset:0) without necessarily disabling user zoom.
 * Google Streamer still needs this so a zoomed visualViewport is not stamped
 * into a corner of the 1920 canvas.
 */
export function shouldFillTvStageFullBleed(win: ViewportReader) {
  if (isFullyKioskBrowser(win) || isTvDisplayBrowser(win)) return true;
  return shouldLockTvKioskViewport(win);
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

export function parseCssZoom(raw: string | number | null | undefined) {
  if (raw == null || raw === "") return 1;
  const text = String(raw).trim().toLowerCase();
  if (!text || text === "normal" || text === "none" || text === "auto") return 1;
  if (text.endsWith("%")) {
    const percent = Number.parseFloat(text);
    return Number.isFinite(percent) && percent > 0 ? percent / 100 : 1;
  }
  const value = Number.parseFloat(text);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function readCssZoom(win: ViewportReader) {
  const root = win.document?.documentElement;
  const styleZoom = parseCssZoom(root?.style?.zoom);
  const bodyZoom = parseCssZoom(win.document?.body?.style?.zoom);
  let computedZoom = 1;
  try {
    const gcs = (win as ViewportReader & {
      getComputedStyle?: (elt: object) => { zoom?: string };
    }).getComputedStyle;
    if (root && gcs) computedZoom = parseCssZoom(gcs(root).zoom);
  } catch {
    // getComputedStyle is browser-only.
  }
  return Math.max(styleZoom, bodyZoom, computedZoom, 1);
}

function readPageZoomScale(win: ViewportReader) {
  const vvScale = win.visualViewport?.scale;
  if (typeof vvScale === "number" && Number.isFinite(vvScale) && vvScale > 0) {
    return vvScale;
  }
  try {
    const fullyScale = win.fully?.getScale?.();
    if (typeof fullyScale === "number" && Number.isFinite(fullyScale) && fullyScale > 0) {
      return fullyScale;
    }
  } catch {
    // Fully bridge may reject outside lockdown scripts.
  }
  return 1;
}

/** Largest of visualViewport.scale, Fully scale, and CSS zoom. */
export function readEffectivePageZoom(win: ViewportReader) {
  return Math.max(readPageZoomScale(win), readCssZoom(win), 1);
}

/**
 * CSS pixels actually on screen. This is the box the 1920×1080 canvas must fit,
 * whether the TV is at 100% zoom, pinch-zoomed, or CSS-zoomed.
 */
export function measureVisibleCssBox(win: ViewportReader): TvViewportBox {
  const innerW = Math.max(win.innerWidth || 0, 1);
  const innerH = Math.max(win.innerHeight || 0, 1);
  const clientW = Math.max(win.document?.documentElement?.clientWidth || 0, innerW);
  const clientH = Math.max(win.document?.documentElement?.clientHeight || 0, innerH);
  const pageZoom = readEffectivePageZoom(win);
  const vv = win.visualViewport;
  const fullyKiosk = isFullyKioskBrowser(win);

  const fullyW = Number(win.fully?.getScreenWidth?.() || 0);
  const fullyH = Number(win.fully?.getScreenHeight?.() || 0);
  const screenW = Math.max(fullyW, win.screen?.availWidth || 0, win.screen?.width || 0);
  const screenH = Math.max(fullyH, win.screen?.availHeight || 0, win.screen?.height || 0);

  // Prefer physical screen when Fully under-reports a phone-sized WebView.
  if (fullyKiosk && pageZoom <= 1.02 && innerW < 1280 && screenW >= 1280) {
    return {
      width: Math.max(1, screenW),
      height: Math.max(1, innerH < 720 && screenH >= 720 ? screenH : Math.max(screenH, innerH)),
      offsetLeft: 0,
      offsetTop: 0
    };
  }

  if (vv && vv.width > 0 && vv.height > 0) {
    const vvStillLayoutSized = vv.width >= innerW * 0.95 && vv.height >= innerH * 0.95;
    if (pageZoom > 1.02 && vvStillLayoutSized) {
      return {
        width: Math.max(1, innerW / pageZoom),
        height: Math.max(1, innerH / pageZoom),
        offsetLeft: vv.offsetLeft || 0,
        offsetTop: vv.offsetTop || 0
      };
    }
    return {
      width: Math.max(1, vv.width),
      height: Math.max(1, vv.height),
      offsetLeft: vv.offsetLeft || 0,
      offsetTop: vv.offsetTop || 0
    };
  }

  const layoutW = Math.min(innerW, clientW);
  const layoutH = Math.min(innerH, clientH);
  if (pageZoom > 1.02) {
    return {
      width: Math.max(1, layoutW / pageZoom),
      height: Math.max(1, layoutH / pageZoom),
      offsetLeft: 0,
      offsetTop: 0
    };
  }

  return {
    width: Math.max(1, layoutW),
    height: Math.max(1, layoutH),
    offsetLeft: 0,
    offsetTop: 0
  };
}

/** Best-effort zoom reset for Fully Kiosk / WebView / Hi-Browser page zoom. */
export function resetTvBrowserZoom(win: ViewportReader) {
  if (isGoogleTvStreamerBrowser(win)) {
    try {
      win.scrollTo?.(0, 0);
    } catch {
      // Some TV browsers reject scroll while fullscreen.
    }
    return;
  }
  try {
    win.fully?.setScale?.(1);
  } catch {
    // Fully bridge may reject outside lockdown scripts.
  }
  try {
    win.fully?.resetScale?.();
  } catch {
    // Older Fully builds may not expose resetScale.
  }
  try {
    win.scrollTo?.(0, 0);
  } catch {
    // Some TV browsers reject scroll while fullscreen.
  }
  try {
    const rootStyle = win.document?.documentElement?.style;
    if (rootStyle && "zoom" in rootStyle) {
      rootStyle.zoom = "1";
    }
  } catch {
    // ignore
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

function readLayoutScreenBox(win: ViewportReader): TvViewportBox {
  const innerW = Math.max(win.innerWidth || 0, 1);
  const innerH = Math.max(win.innerHeight || 0, 1);
  const clientW = Math.max(win.document?.documentElement?.clientWidth || 0, innerW);
  const clientH = Math.max(win.document?.documentElement?.clientHeight || 0, innerH);
  const pageZoom = readPageZoomScale(win);
  const fullyKiosk = isFullyKioskBrowser(win);

  let width = Math.min(innerW, clientW);
  let height = Math.min(innerH, clientH);
  const fullyW = Number(win.fully?.getScreenWidth?.() || 0);
  const fullyH = Number(win.fully?.getScreenHeight?.() || 0);
  const screenW = Math.max(fullyW, win.screen?.availWidth || 0, win.screen?.width || 0);
  const screenH = Math.max(fullyH, win.screen?.availHeight || 0, win.screen?.height || 0);

  // Prefer physical screen when Fully under-reports a phone-sized WebView.
  // Do not bump Google Streamer / Android TV Internet — those browsers often
  // report ~960–1280 CSS px and then zoom; filling 1920 at scale 1 crops.
  if (fullyKiosk && pageZoom <= 1.02 && width < 1280 && screenW >= 1280) {
    width = screenW;
  }
  if (fullyKiosk && pageZoom <= 1.02 && height < 720 && screenH >= 720) {
    height = screenH;
  }

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
    offsetLeft: 0,
    offsetTop: 0
  };
}

/**
 * Stage geometry for the outer `.fitdog-tv-stage` shell.
 *
 * Kiosk-locked Fully / Hi-Browser: full-bleed layout box (zoom is reset).
 * Google Streamer and other zoomable TVs: pin the stage to the *visible*
 * CSS box (visualViewport / CSS zoom) so a zoomed screen still shows the
 * whole 1920×1080 board instead of a cropped corner.
 */
export function measureTvViewport(win: ViewportReader): TvViewportBox {
  if (shouldLockTvKioskViewport(win)) {
    return readLayoutScreenBox(win);
  }
  return measureVisibleCssBox(win);
}

/**
 * Dimensions used to compute the 16:9 canvas `transform: scale(...)`.
 *
 * Always the pixels currently on screen, independent of page zoom. Offsets
 * stay 0 because scale is applied inside the already-positioned stage.
 */
export function measureTvFitViewport(win: ViewportReader): TvViewportBox {
  const visible = measureVisibleCssBox(win);
  return {
    width: visible.width,
    height: visible.height,
    offsetLeft: 0,
    offsetTop: 0
  };
}

/** Largest scale that fits the 1920×1080 design inside the given viewport. */
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

export type TvLayoutDiagnostics = {
  innerWidth: number;
  innerHeight: number;
  visualViewport: {
    width: number;
    height: number;
    offsetLeft: number;
    offsetTop: number;
    scale: number;
  } | null;
  devicePixelRatio: number;
  pageZoom: number;
  stageWidth: number;
  stageHeight: number;
  fitWidth: number;
  fitHeight: number;
  scale: number;
  fullyKiosk: boolean;
  kioskLocked: boolean;
};

/** Dev-only snapshot for diagnosing Fully / TV viewport mismatches (`?tvDebug=1`). */
export function collectTvLayoutDiagnostics(
  win: ViewportReader & { devicePixelRatio?: number },
  stageWidth: number,
  stageHeight: number,
  fit: TvViewportBox,
  scale: number
): TvLayoutDiagnostics {
  const vv = win.visualViewport;
  return {
    innerWidth: win.innerWidth || 0,
    innerHeight: win.innerHeight || 0,
    visualViewport: vv
      ? {
          width: vv.width,
          height: vv.height,
          offsetLeft: vv.offsetLeft,
          offsetTop: vv.offsetTop,
          scale: vv.scale ?? 1
        }
      : null,
    devicePixelRatio: win.devicePixelRatio ?? 1,
    pageZoom: readEffectivePageZoom(win),
    stageWidth,
    stageHeight,
    fitWidth: fit.width,
    fitHeight: fit.height,
    scale,
    fullyKiosk: isFullyKioskBrowser(win),
    kioskLocked: shouldLockTvKioskViewport(win)
  };
}

export function logTvLayoutDiagnostics(diagnostics: TvLayoutDiagnostics) {
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  console.info("[fitdog-tv-layout]", diagnostics);
}
