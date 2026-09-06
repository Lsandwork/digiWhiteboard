"use client";

import { useEffect, useState } from "react";

/** Fixed lobby/staff design canvas — kept here so the overlay shows the math. */
const DESIGN_W = 1920;
const DESIGN_H = 1080;

type KioskDebugSnapshot = {
  href: string;
  host: string;
  surface: string;
  innerWidth: number;
  innerHeight: number;
  clientWidth: number;
  clientHeight: number;
  outerWidth: number;
  outerHeight: number;
  devicePixelRatio: number;
  screenWidth: number;
  screenHeight: number;
  vvWidth: number | null;
  vvHeight: number | null;
  vvScale: number | null;
  vvOffsetLeft: number | null;
  vvOffsetTop: number | null;
  viewportRatio: string;
  canvasSelector: string;
  canvasOffsetW: number | null;
  canvasOffsetH: number | null;
  canvasRectW: number | null;
  canvasRectH: number | null;
  canvasRectL: number | null;
  canvasRectT: number | null;
  stageSelector: string;
  stageOffsetW: number | null;
  stageOffsetH: number | null;
  stageRectW: number | null;
  stageRectH: number | null;
  stageTransform: string;
  stageTransformOrigin: string;
  computedTransform: string;
  computedTransformOrigin: string;
  computedZoom: string;
  cssVarFitdogTvScale: string;
  scaleFromInner: string;
  scaleFromClient: string;
  scaleFromVv: string;
  scaleFromScreen: string;
  canvasVsDesign: string;
  fullyPresent: string;
  fullyScale: string;
  fullyScreen: string;
  htmlClasses: string;
  bodyClasses: string;
};

function readElBox(el: Element | null) {
  if (!(el instanceof HTMLElement)) {
    return {
      offsetW: null as number | null,
      offsetH: null as number | null,
      rectW: null as number | null,
      rectH: null as number | null,
      rectL: null as number | null,
      rectT: null as number | null,
      transform: "n/a",
      transformOrigin: "n/a",
      zoom: "n/a"
    };
  }
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return {
    offsetW: el.offsetWidth,
    offsetH: el.offsetHeight,
    rectW: Math.round(rect.width * 100) / 100,
    rectH: Math.round(rect.height * 100) / 100,
    rectL: Math.round(rect.left * 100) / 100,
    rectT: Math.round(rect.top * 100) / 100,
    transform: style.transform || "none",
    transformOrigin: style.transformOrigin || "n/a",
    zoom: (style as CSSStyleDeclaration & { zoom?: string }).zoom || "n/a"
  };
}

function scaleLabel(w: number, h: number) {
  const s = Math.min(w / DESIGN_W, h / DESIGN_H);
  return Number.isFinite(s) ? s.toFixed(4) : "n/a";
}

function captureSnapshot(
  surface: string,
  canvasSelector: string,
  stageSelector: string
): KioskDebugSnapshot {
  const vv = window.visualViewport;
  const canvas = document.querySelector(canvasSelector);
  const stage = document.querySelector(stageSelector);
  const canvasBox = readElBox(canvas);
  const stageBox = readElBox(stage);
  const ratio =
    window.innerHeight > 0 ? (window.innerWidth / window.innerHeight).toFixed(4) : "n/a";

  const fully = (window as Window & { fully?: Record<string, unknown> }).fully;
  let fullyScale = "n/a";
  let fullyScreen = "n/a";
  try {
    if (fully && typeof fully.getScale === "function") {
      fullyScale = String((fully.getScale as () => number)());
    }
  } catch {
    fullyScale = "error";
  }
  try {
    if (fully && typeof fully.getScreenWidth === "function") {
      const fw = (fully.getScreenWidth as () => number)();
      const fh =
        typeof fully.getScreenHeight === "function"
          ? (fully.getScreenHeight as () => number)()
          : NaN;
      fullyScreen = `${fw} × ${fh}`;
    }
  } catch {
    fullyScreen = "error";
  }

  const canvasVsDesign =
    canvasBox.offsetW == null
      ? "n/a"
      : `${canvasBox.offsetW}×${canvasBox.offsetH} vs design ${DESIGN_W}×${DESIGN_H}` +
        (canvasBox.offsetW === DESIGN_W && canvasBox.offsetH === DESIGN_H
          ? " (FIXED CANVAS)"
          : " (FLUID)");

  return {
    href: window.location.href,
    host: window.location.host,
    surface,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    devicePixelRatio: window.devicePixelRatio,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    vvWidth: vv?.width ?? null,
    vvHeight: vv?.height ?? null,
    vvScale: vv?.scale ?? null,
    vvOffsetLeft: vv?.offsetLeft ?? null,
    vvOffsetTop: vv?.offsetTop ?? null,
    viewportRatio: ratio,
    canvasSelector,
    canvasOffsetW: canvasBox.offsetW,
    canvasOffsetH: canvasBox.offsetH,
    canvasRectW: canvasBox.rectW,
    canvasRectH: canvasBox.rectH,
    canvasRectL: canvasBox.rectL,
    canvasRectT: canvasBox.rectT,
    stageSelector,
    stageOffsetW: stageBox.offsetW,
    stageOffsetH: stageBox.offsetH,
    stageRectW: stageBox.rectW,
    stageRectH: stageBox.rectH,
    stageTransform: stageBox.transform,
    stageTransformOrigin: stageBox.transformOrigin,
    computedTransform: canvasBox.transform,
    computedTransformOrigin: canvasBox.transformOrigin,
    computedZoom: canvasBox.zoom,
    cssVarFitdogTvScale:
      getComputedStyle(document.documentElement).getPropertyValue("--fitdog-tv-scale").trim() ||
      getComputedStyle(document.documentElement).getPropertyValue("--fitdog-tv-scale").trim() ||
      "(unset)",
    scaleFromInner: scaleLabel(window.innerWidth, window.innerHeight),
    scaleFromClient: scaleLabel(
      document.documentElement.clientWidth,
      document.documentElement.clientHeight
    ),
    scaleFromVv:
      vv?.width && vv?.height ? scaleLabel(vv.width, vv.height) : "n/a",
    scaleFromScreen: scaleLabel(window.screen.width, window.screen.height),
    canvasVsDesign,
    fullyPresent: fully ? "yes" : "no",
    fullyScale,
    fullyScreen,
    htmlClasses: document.documentElement.className || "(none)",
    bodyClasses: document.body.className || "(none)"
  };
}

function fmt(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return digits > 0 ? value.toFixed(digits) : String(Math.round(value));
}

export function isKioskDebugEnabled(search = ""): boolean {
  try {
    const params = new URLSearchParams(
      search || (typeof window !== "undefined" ? window.location.search : "")
    );
    const raw = params.get("kioskDebug");
    if (!raw) return false;
    return raw === "1" || raw.toLowerCase() === "true" || raw === "";
  } catch {
    return false;
  }
}

type KioskDebugOverlayProps = {
  /** Logical surface name shown in the overlay header. */
  surface: "lobby" | "casttv" | string;
  /** Primary design/media container selector. */
  canvasSelector: string;
  /** Optional outer stage/shell selector. */
  stageSelector?: string;
};

/**
 * Temporary Fully/TV diagnostic overlay.
 * Enable with `?kioskDebug=true` on lobby or casttv — DO NOT remove until
 * the lobby vs casttv dimension discrepancy is identified on-device.
 */
export function KioskDebugOverlay({
  surface,
  canvasSelector,
  stageSelector = "body"
}: KioskDebugOverlayProps) {
  // Must detect query on the client after mount — useMemo(window) during SSR
  // locks enabled=false for the lifetime of the component.
  const [enabled, setEnabled] = useState(false);
  const [snap, setSnap] = useState<KioskDebugSnapshot | null>(null);

  useEffect(() => {
    setEnabled(isKioskDebugEnabled(window.location.search));
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const refresh = () => {
      const next = captureSnapshot(surface, canvasSelector, stageSelector);
      setSnap(next);
      console.info("[kioskDebug]", next);
    };

    refresh();
    const t1 = window.setTimeout(refresh, 250);
    const t2 = window.setTimeout(refresh, 1000);
    const t3 = window.setTimeout(refresh, 2500);
    const vv = window.visualViewport;
    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
    vv?.addEventListener("resize", refresh);
    vv?.addEventListener("scroll", refresh);

    const observed: Element[] = [];
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => refresh());
      const canvas = document.querySelector(canvasSelector);
      const stage = document.querySelector(stageSelector);
      if (canvas) {
        ro.observe(canvas);
        observed.push(canvas);
      }
      if (stage && stage !== canvas) {
        ro.observe(stage);
        observed.push(stage);
      }
      ro.observe(document.documentElement);
    }

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("orientationchange", refresh);
      vv?.removeEventListener("resize", refresh);
      vv?.removeEventListener("scroll", refresh);
      ro?.disconnect();
      void observed;
    };
  }, [enabled, surface, canvasSelector, stageSelector]);

  if (!enabled || !snap) return null;

  const rows: Array<[string, string]> = [
    ["surface", snap.surface],
    ["host", snap.host],
    ["inner", `${snap.innerWidth} × ${snap.innerHeight}`],
    ["client", `${snap.clientWidth} × ${snap.clientHeight}`],
    ["outer", `${snap.outerWidth} × ${snap.outerHeight}`],
    ["dpr", String(snap.devicePixelRatio)],
    ["screen", `${snap.screenWidth} × ${snap.screenHeight}`],
    [
      "visualViewport",
      snap.vvWidth == null
        ? "n/a"
        : `${fmt(snap.vvWidth, 1)} × ${fmt(snap.vvHeight, 1)} (scale ${fmt(snap.vvScale, 3)})`
    ],
    [
      "vv offset",
      snap.vvOffsetLeft == null ? "n/a" : `${fmt(snap.vvOffsetLeft, 1)}, ${fmt(snap.vvOffsetTop, 1)}`
    ],
    ["CALCULATED VIEWPORT RATIO", snap.viewportRatio],
    ["ACTUAL MAIN CANVAS", snap.canvasVsDesign],
    [
      "canvas offset",
      snap.canvasOffsetW == null ? "n/a" : `${snap.canvasOffsetW} × ${snap.canvasOffsetH}`
    ],
    [
      "canvas rect (painted)",
      snap.canvasRectW == null ? "n/a" : `${fmt(snap.canvasRectW, 1)} × ${fmt(snap.canvasRectH, 1)}`
    ],
    [
      "canvas pos",
      snap.canvasRectL == null ? "n/a" : `${fmt(snap.canvasRectL, 1)}, ${fmt(snap.canvasRectT, 1)}`
    ],
    [
      "stage offset",
      snap.stageOffsetW == null ? "n/a" : `${snap.stageOffsetW} × ${snap.stageOffsetH}`
    ],
    [
      "stage rect",
      snap.stageRectW == null ? "n/a" : `${fmt(snap.stageRectW, 1)} × ${fmt(snap.stageRectH, 1)}`
    ],
    ["canvas transform", snap.computedTransform],
    ["canvas transform-origin", snap.computedTransformOrigin],
    ["stage transform", snap.stageTransform],
    ["stage transform-origin", snap.stageTransformOrigin],
    ["css zoom (canvas)", snap.computedZoom],
    ["--fitdog-tv-scale (applied)", snap.cssVarFitdogTvScale],
    ["scale if min(inner/1920,inner/1080)", snap.scaleFromInner],
    ["scale if min(client/1920,client/1080)", snap.scaleFromClient],
    ["scale if min(vv/1920,vv/1080)", snap.scaleFromVv],
    ["scale if min(screen/1920,screen/1080)", snap.scaleFromScreen],
    ["fully bridge", snap.fullyPresent],
    ["fully.getScale()", snap.fullyScale],
    ["fully screen", snap.fullyScreen],
    ["html.class", snap.htmlClasses],
    ["body.class", snap.bodyClasses]
  ];

  return (
    <div
      id="kiosk-debug-overlay"
      data-kiosk-debug="true"
      data-kiosk-surface={surface}
      style={{
        position: "fixed",
        top: 8,
        left: 8,
        zIndex: 2147483000,
        maxWidth: "min(560px, calc(100vw - 16px))",
        maxHeight: "calc(100vh - 16px)",
        overflow: "auto",
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.35)",
        background: "rgba(0,0,0,0.82)",
        color: "#f8fafc",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
        lineHeight: 1.35,
        boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
        pointerEvents: "none",
        whiteSpace: "pre-wrap"
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#fdba74" }}>
        kioskDebug · {surface} (temporary — compare with casttv)
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={{ padding: "1px 8px 1px 0", color: "#94a3b8", verticalAlign: "top" }}>
                {label}
              </td>
              <td style={{ padding: "1px 0", color: "#f8fafc", verticalAlign: "top" }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
