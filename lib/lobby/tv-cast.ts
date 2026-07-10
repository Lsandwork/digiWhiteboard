import { safeCastUrl, safeOrigin } from "@/lib/safe-url";

export type PresentationConnectionLike = {
  state: string;
  close: () => void;
  addEventListener: (type: string, listener: () => void) => void;
};

type PresentationRequestLike = {
  start: () => Promise<PresentationConnectionLike>;
  getAvailability?: () => Promise<{ value: boolean }>;
};

type PresentationRequestConstructor = new (urls: string[]) => PresentationRequestLike;

let activePresentationConnection: PresentationConnectionLike | null = null;

function defaultCastOrigin() {
  return typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
}

export function getCastSiteOrigin(currentHref?: string) {
  if (typeof window !== "undefined") {
    return safeOrigin(window.location.origin, defaultCastOrigin());
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    const origin = safeOrigin(site, "");
    if (origin) return origin;
  }

  if (currentHref) {
    const origin = safeOrigin(currentHref, "");
    if (origin) return origin;
  }

  return "http://localhost:3000";
}

function readSearchParam(name: string) {
  if (typeof window === "undefined") return null;
  try {
    return new URL(window.location.href).searchParams.get(name);
  } catch {
    return null;
  }
}

function buildTvCastUrl(pathname: string, currentHref?: string, displayToken?: string) {
  const origin = getCastSiteOrigin(currentHref);
  const fallback = safeCastUrl(pathname, origin, `${defaultCastOrigin()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`);

  try {
    const url = new URL(pathname, origin);

    if (!pathname.startsWith("/display/")) {
      url.searchParams.set("display", "tv");
      url.searchParams.set("chromecast", "1");
    }

    url.searchParams.set("castMode", "1");

    const token = displayToken?.trim() || readSearchParam("token")?.trim();
    if (token) {
      url.searchParams.set("token", token);
    }

    if (readSearchParam("debugBoard") === "1") {
      url.searchParams.set("debugBoard", "1");
    }

    return url.toString();
  } catch {
    return fallback;
  }
}

export function setActivePresentationConnection(connection: PresentationConnectionLike | null) {
  if (activePresentationConnection && activePresentationConnection !== connection) {
    try {
      activePresentationConnection.close();
    } catch {
      // Ignore stale connection cleanup errors.
    }
  }

  activePresentationConnection = connection;
  if (!connection) return;

  const clearConnection = () => {
    if (activePresentationConnection === connection) {
      activePresentationConnection = null;
    }
  };

  connection.addEventListener("close", clearConnection);
  connection.addEventListener("terminate", clearConnection);
}

export function isPresentationCastActive() {
  return activePresentationConnection?.state === "connected";
}

export async function stopPresentationCast() {
  if (!activePresentationConnection) return;
  try {
    activePresentationConnection.close();
  } catch {
    // Ignore close failures when the receiver already disconnected.
  }
  activePresentationConnection = null;
}

export function buildLobbyTvCastUrl(currentHref?: string, displayToken?: string) {
  return buildTvCastUrl("/lobby/checkouts", currentHref, displayToken);
}

export function buildStaffTvCastUrl(currentHref?: string, displayToken?: string) {
  return buildTvCastUrl("/", currentHref, displayToken);
}

export function isPresentationCastSupported() {
  return typeof window !== "undefined" && "PresentationRequest" in window;
}

export function getPresentationRequestConstructor() {
  if (!isPresentationCastSupported()) return null;
  return (window as Window & { PresentationRequest?: PresentationRequestConstructor }).PresentationRequest ?? null;
}

export function isFullscreenSupported() {
  return typeof document !== "undefined" && Boolean(document.documentElement?.requestFullscreen);
}

export function isDocumentFullscreen() {
  return typeof document !== "undefined" && Boolean(document.fullscreenElement);
}

export async function requestDocumentFullscreen() {
  if (!isFullscreenSupported()) return false;
  if (isDocumentFullscreen()) return true;

  try {
    await document.documentElement.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

export async function exitDocumentFullscreen() {
  if (!isDocumentFullscreen()) return;
  try {
    await document.exitFullscreen();
  } catch {
    // Ignore exit failures when the browser already left fullscreen.
  }
}
