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

export function getCastSiteOrigin(currentHref?: string) {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    try {
      return new URL(site).origin;
    } catch {
      // Fall through.
    }
  }

  if (currentHref) {
    try {
      return new URL(currentHref).origin;
    } catch {
      // Fall through.
    }
  }

  return "http://localhost:3000";
}

function buildTvCastUrl(pathname: string, currentHref?: string, displayToken?: string) {
  const origin = getCastSiteOrigin(currentHref);
  const url = new URL(pathname, origin);

  if (!pathname.startsWith("/display/")) {
    url.searchParams.set("display", "tv");
  }

  const token =
    displayToken?.trim() ||
    (typeof window !== "undefined" ? new URL(window.location.href).searchParams.get("token")?.trim() : "");
  if (token) {
    url.searchParams.set("token", token);
  }

  return url.toString();
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
  return buildTvCastUrl("/display/lobby-whiteboard", currentHref, displayToken);
}

export function buildStaffTvCastUrl(currentHref?: string, displayToken?: string) {
  return buildTvCastUrl("/display/staff-whiteboard", currentHref, displayToken);
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
