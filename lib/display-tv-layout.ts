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
 * True when the TV browser is zoomed or Fully Kiosk is present — lock scale
 * and force the stage to fill the physical screen (casttv-style inset:0).
 */
export function shouldLockTvKioskViewport(win: ViewportReader) {
  if (isFullyKioskBrowser(win)) return true;
  const vv = win.visualViewport;
  if (!vv) return false;
  const innerW = Math.max(win.innerWidth || 0, 1);
  const innerH = Math.max(win.innerHeight || 0, 1);
  if (isCornerCroppedVisualViewport(innerW, innerH, vv)) return true;
  return (vv.scale ?? 1) > 1.02;
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

/** Best-effort zoom reset for Fully Kiosk / WebView / Hi-Browser page zoom. */
export function resetTvBrowserZoom(win: ViewportReader) {
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
  const lockKiosk = shouldLockTvKioskViewport(win);

  let width = Math.min(innerW, clientW);
  let height = Math.min(innerH, clientH);
  const fullyW = Number(win.fully?.getScreenWidth?.() || 0);
  const fullyH = Number(win.fully?.getScreenHeight?.() || 0);
  const screenW = Math.max(fullyW, win.screen?.availWidth || 0, win.screen?.width || 0);
  const screenH = Math.max(fullyH, win.screen?.availHeight || 0, win.screen?.height || 0);

  // Prefer physical screen when the WebView under-reports (common on kiosk TVs).
  // Only bump when page zoom is ~1 — if Fully is zoomed, screen px ≠ CSS layout px.
  if ((fullyKiosk || lockKiosk) && pageZoom <= 1.02 && width < 1280 && screenW >= 1280) {
    width = screenW;
  }
  if ((fullyKiosk || lockKiosk) && pageZoom <= 1.02 && height < 720 && screenH >= 720) {
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
 * Always returns offset 0 for kiosk locks so the stage stays casttv-style
 * full-bleed (`inset: 0`). Never stamp the stage into a zoomed VV corner.
 */
export function measureTvViewport(win: ViewportReader): TvViewportBox {
  const vv = win.visualViewport;

  if (shouldLockTvKioskViewport(win)) {
    return readLayoutScreenBox(win);
  }

  const innerW = Math.max(win.innerWidth || 0, 1);
  const innerH = Math.max(win.innerHeight || 0, 1);
  const clientW = Math.max(win.document?.documentElement?.clientWidth || 0, innerW);
  const clientH = Math.max(win.document?.documentElement?.clientHeight || 0, innerH);
  const visibleW = vv?.width && vv.width > 0 ? vv.width : innerW;
  const visibleH = vv?.height && vv.height > 0 ? vv.height : innerH;

  return {
    width: Math.max(1, Math.min(innerW, clientW, visibleW)),
    height: Math.max(1, Math.min(innerH, clientH, visibleH)),
    offsetLeft: vv?.offsetLeft ?? 0,
    offsetTop: vv?.offsetTop ?? 0
  };
}

/**
 * Dimensions used to compute the 16:9 canvas `transform: scale(...)`.
 *
 * Cast-TV works on Fully because it paints `position:fixed; inset:0` into the
 * *visible* surface. Lobby previously scaled a 1920×1080 canvas against the
 * *layout* viewport (often still 1920×1080 while Fully page-zoom made the
 * visualViewport much smaller) — so scale stayed 1 and the board looked zoomed.
 *
 * When page zoom remains after reset, fit to the visible CSS area (or
 * layout/pageZoom). Offsets stay 0; the stage remains full-bleed and centered.
 */
export function measureTvFitViewport(win: ViewportReader): TvViewportBox {
  const stageBox = measureTvViewport(win);
  const vv = win.visualViewport;
  const pageZoom = readPageZoomScale(win);
  const innerW = Math.max(win.innerWidth || 0, 1);
  const innerH = Math.max(win.innerHeight || 0, 1);

  if (pageZoom > 1.02 && vv && vv.width > 0 && vv.height > 0) {
    const zoomCompensatedW = stageBox.width / pageZoom;
    const zoomCompensatedH = stageBox.height / pageZoom;
    return {
      width: Math.max(1, Math.min(vv.width, zoomCompensatedW)),
      height: Math.max(1, Math.min(vv.height, zoomCompensatedH)),
      offsetLeft: 0,
      offsetTop: 0
    };
  }

  // Residual corner crop after zoom reset (scale ≈ 1 but VV still smaller than
  // the *layout* inner size). Compare against innerWidth/Height — not the
  // screen-bumped stage — so Fully under-reporting (inner 980, screen 1920)
  // still gets scale 1 against the physical screen like casttv full-bleed.
  if (
    shouldLockTvKioskViewport(win) &&
    vv &&
    vv.width > 0 &&
    vv.height > 0 &&
    isCornerCroppedVisualViewport(innerW, innerH, vv)
  ) {
    return {
      width: Math.max(1, Math.min(stageBox.width, vv.width)),
      height: Math.max(1, Math.min(stageBox.height, vv.height)),
      offsetLeft: 0,
      offsetTop: 0
    };
  }

  return stageBox;
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
    pageZoom: readPageZoomScale(win),
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
