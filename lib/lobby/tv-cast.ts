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

function buildTvCastUrl(pathname: string, currentHref?: string, displayToken?: string) {
  if (typeof window !== "undefined") {
    const url = new URL(pathname, window.location.origin);
    url.searchParams.set("display", "tv");

    const token =
      displayToken?.trim() || new URL(window.location.href).searchParams.get("token")?.trim();
    if (token) {
      url.searchParams.set("token", token);
    }

    return url.toString();
  }

  const url = new URL(currentHref ?? `http://localhost:3000${pathname}`);
  url.searchParams.set("display", "tv");

  const token = displayToken?.trim();
  if (token) {
    url.searchParams.set("token", token);
  }

  return url.toString();
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
