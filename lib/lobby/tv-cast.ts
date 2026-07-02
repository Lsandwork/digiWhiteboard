export type PresentationConnectionLike = {
  state: string;
  close: () => void;
  addEventListener: (type: string, listener: () => void) => void;
};

type PresentationRequestLike = {
  start: () => Promise<PresentationConnectionLike>;
};

type PresentationRequestConstructor = new (urls: string[]) => PresentationRequestLike;

export function buildLobbyTvCastUrl(currentHref?: string) {
  const base =
    typeof window !== "undefined" ? window.location.href : (currentHref ?? "http://localhost/lobby/checkouts");
  const url = new URL(base);
  url.searchParams.set("display", "tv");
  return url.toString();
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
