import { buildLobbyTvCastUrl } from "@/lib/lobby/tv-cast";

export const LOBBY_CAST_NAMESPACE = "urn:x-cast:com.fitdog.lobby";

type CastSessionLike = {
  sendMessage: (namespace: string, data: string | Record<string, unknown>) => Promise<void>;
};

type CastContextLike = {
  setOptions: (options: Record<string, unknown>) => void;
  requestSession: () => Promise<void>;
  getCurrentSession: () => CastSessionLike | null;
  endCurrentSession: (stopCasting: boolean) => void;
  addEventListener: (type: string, handler: (event: { sessionState: string }) => void) => void;
  getCastState: () => string;
};

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    cast?: {
      framework: {
        CastContext: {
          getInstance: () => CastContextLike;
        };
        CastContextEventType: {
          CAST_STATE_CHANGED: string;
          SESSION_STATE_CHANGED: string;
        };
        SessionState: {
          SESSION_STARTED: string;
          SESSION_ENDED: string;
        };
      };
    };
    chrome?: {
      cast?: {
        AutoJoinPolicy: {
          ORIGIN_SCOPED: string;
        };
      };
    };
  }
}

let castSdkPromise: Promise<void> | null = null;

export function getGoogleCastAppId() {
  return process.env.NEXT_PUBLIC_GOOGLE_CAST_APP_ID?.trim() ?? "";
}

export function isGoogleCastConfigured() {
  return Boolean(getGoogleCastAppId());
}

export function loadGoogleCastSdk() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Cast is only available in the browser."));
  }

  if (window.cast?.framework) {
    return Promise.resolve();
  }

  if (!castSdkPromise) {
    castSdkPromise = new Promise<void>((resolve, reject) => {
      window.__onGCastApiAvailable = (isAvailable) => {
        if (isAvailable && window.cast?.framework) {
          resolve();
          return;
        }
        reject(new Error("Google Cast is not available in this browser."));
      };

      const existing = document.querySelector<HTMLScriptElement>("script[data-fitdog-cast-sdk]");
      if (existing) {
        existing.addEventListener("load", () => window.__onGCastApiAvailable?.(Boolean(window.cast?.framework)), {
          once: true
        });
        existing.addEventListener("error", () => reject(new Error("Failed to load Google Cast SDK.")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
      script.async = true;
      script.dataset.fitdogCastSdk = "true";
      script.onerror = () => reject(new Error("Failed to load Google Cast SDK."));
      document.head.appendChild(script);
    });
  }

  return castSdkPromise;
}

function getCastContext() {
  return window.cast?.framework.CastContext.getInstance() ?? null;
}

export async function initializeGoogleCast() {
  const appId = getGoogleCastAppId();
  if (!appId) {
    throw new Error("Chromecast is not configured for this site.");
  }

  await loadGoogleCastSdk();
  const context = getCastContext();
  if (!context) {
    throw new Error("Google Cast could not be initialized.");
  }

  context.setOptions({
    receiverApplicationId: appId,
    autoJoinPolicy: window.chrome?.cast?.AutoJoinPolicy.ORIGIN_SCOPED ?? "origin_scoped"
  });

  return context;
}

export async function startGoogleCastSession() {
  const context = await initializeGoogleCast();
  await context.requestSession();

  const session = context.getCurrentSession();
  if (!session) {
    throw new Error("No cast session was created.");
  }

  const url = buildLobbyTvCastUrl();
  await session.sendMessage(LOBBY_CAST_NAMESPACE, { url });
  return context;
}

export async function stopGoogleCastSession() {
  const context = getCastContext();
  if (!context) return;
  context.endCurrentSession(true);
}

export function isGoogleCastSessionActive() {
  const context = getCastContext();
  if (!context) return false;
  return context.getCastState() === "CONNECTED";
}
