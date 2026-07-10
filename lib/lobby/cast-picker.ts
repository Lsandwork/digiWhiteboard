import {
  isAirPlayCastAvailable,
  isIosMobile,
  startAirPlayCast,
  stopAirPlayCast,
  supportsTabCaptureAirPlay
} from "@/lib/lobby/airplay-cast";
import {
  isAndroidChrome,
  isChromeIos,
  isMobileBrowser,
  prefersWirelessCastOnMobile
} from "@/lib/lobby/cast-platform";
import {
  isGoogleCastBrowser,
  isGoogleCastConfigured,
  isGoogleCastFrameworkReady,
  startGoogleCastSession
} from "@/lib/lobby/google-cast";
import {
  buildLobbyTvCastUrl,
  getPresentationRequestConstructor,
  isPresentationCastSupported,
  setActivePresentationConnection,
  type PresentationConnectionLike
} from "@/lib/lobby/tv-cast";

export type CastPickerMethod = "chromecast" | "wireless" | "airplay";

export type CastPickerResult =
  | { method: "airplay" | "chromecast" }
  | { method: "wireless"; connection: PresentationConnectionLike };

function isCastCancelled(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /cancel|abort|denied|dismiss/i.test(message);
}

function tvUrl(displayToken?: string, castUrl?: string) {
  return castUrl ?? buildLobbyTvCastUrl(undefined, displayToken);
}

export function isCastDevicePickerSupported() {
  return isAirPlayCastAvailable() || isGoogleCastBrowser() || isPresentationCastSupported();
}

/**
 * Starts Presentation API casting. `request.start()` is invoked synchronously so it
 * stays inside the user-gesture stack (no awaits before start).
 */
export function openPresentationDevicePicker(displayToken?: string, castUrl?: string): Promise<PresentationConnectionLike> {
  const PresentationRequestCtor = getPresentationRequestConstructor();
  if (!PresentationRequestCtor) {
    throw new Error("Wireless display is not supported in this browser. Try Google Chrome on Android or desktop.");
  }

  const targetUrl = tvUrl(displayToken, castUrl);
  let request: { start: () => Promise<PresentationConnectionLike> };
  try {
    request = new PresentationRequestCtor([targetUrl]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid cast URL.";
    throw new Error(/pattern/i.test(message) ? "Cast URL was invalid for this browser." : message);
  }

  const startPromise = request.start();
  return startPromise.then((connection: PresentationConnectionLike) => {
    setActivePresentationConnection(connection);
    return connection;
  });
}

export function getDefaultCastRoute(): "chromecast" | "wireless" | "airplay" {
  if (prefersWirelessCastOnMobile()) return "wireless";
  if (isChromeIos() && isPresentationCastSupported()) return "wireless";
  if (isGoogleCastBrowser() && !isChromeIos() && !isIosMobile()) return "chromecast";
  if (supportsTabCaptureAirPlay()) return "airplay";
  if (isAirPlayCastAvailable()) return "airplay";
  return "chromecast";
}

function tryGoogleCastIfReady(displayToken?: string, castUrl?: string) {
  if (!isGoogleCastBrowser() || !isGoogleCastConfigured() || !isGoogleCastFrameworkReady()) {
    return null;
  }
  // startGoogleCastSession calls requestSession() synchronously when the SDK is already ready.
  return startGoogleCastSession(displayToken, castUrl);
}

export async function openChromecastPicker(displayToken?: string, castUrl?: string): Promise<CastPickerResult> {
  const url = tvUrl(displayToken, castUrl);

  // One gesture-gated picker per click. Never await anything before start()/requestSession(),
  // and never fall through to another picker after an await (the user gesture is already spent).
  if (isPresentationCastSupported()) {
    const connection = await openPresentationDevicePicker(displayToken, url);
    if (isChromeIos() || isMobileBrowser()) {
      return { method: "wireless", connection };
    }
    return { method: "chromecast" };
  }

  if (isGoogleCastBrowser()) {
    const googleCastPromise = tryGoogleCastIfReady(displayToken, url);
    if (googleCastPromise) {
      await googleCastPromise;
      return { method: "chromecast" };
    }

    if (!isGoogleCastConfigured()) {
      throw new Error(
        "Chromecast whiteboard casting needs setup. Use the Cast to TV button in Chrome, copy the TV link, or ask an admin to configure Google Cast."
      );
    }

    throw new Error("Google Cast is still loading. Wait a second, then click Cast to TV again.");
  }

  if (isAirPlayCastAvailable()) {
    return openAirPlayPicker(displayToken, url);
  }

  throw new Error("Chromecast is not available in this browser. Use Google Chrome.");
}

export async function openWirelessCastPicker(displayToken?: string, castUrl?: string): Promise<CastPickerResult> {
  if (!isPresentationCastSupported()) {
    if (isIosMobile() || isChromeIos()) {
      return openAirPlayPicker(displayToken, castUrl);
    }
    throw new Error("Wireless display is not supported in this browser.");
  }

  const connection = await openPresentationDevicePicker(displayToken, castUrl);
  return { method: "wireless", connection };
}

export async function openAirPlayPicker(displayToken?: string, castUrl?: string): Promise<CastPickerResult> {
  if (!isAirPlayCastAvailable()) {
    throw new Error("AirPlay is not available in this browser. Use Safari on Mac, iPhone, or iPad.");
  }

  await startAirPlayCast(tvUrl(displayToken, castUrl));
  return { method: "airplay" };
}

/** Smart cast route for staff and lobby boards, with mobile Chrome support. */
export async function openMobileAwareCastPicker(displayToken?: string, castUrl?: string): Promise<CastPickerResult> {
  const url = tvUrl(displayToken, castUrl);
  const route = getDefaultCastRoute();

  if (route === "wireless") {
    try {
      return await openWirelessCastPicker(displayToken, url);
    } catch (error) {
      if (isCastCancelled(error)) throw error;
      if (isAndroidChrome()) {
        return openChromecastPicker(displayToken, url);
      }
      if (isIosMobile() || isChromeIos()) {
        return openAirPlayPicker(displayToken, url);
      }
      throw error;
    }
  }

  if (route === "airplay") {
    return openAirPlayPicker(displayToken, url);
  }

  try {
    return await openChromecastPicker(displayToken, url);
  } catch (error) {
    if (isCastCancelled(error)) throw error;
    if (isIosMobile() || isChromeIos()) {
      return openAirPlayPicker(displayToken, url);
    }
    throw error;
  }
}

export async function stopAllCastSessions() {
  const { stopPresentationCast } = await import("@/lib/lobby/tv-cast");
  const { stopGoogleCastSession } = await import("@/lib/lobby/google-cast");
  stopAirPlayCast();
  await stopPresentationCast();
  await stopGoogleCastSession();
}

/** Chrome Cast only — no AirPlay or Presentation API fallbacks. */
export async function openDefaultCastDevicePicker(displayToken?: string, castUrl?: string): Promise<CastPickerResult> {
  return openChromecastPicker(displayToken, castUrl);
}

/** @deprecated Use openMobileAwareCastPicker, openChromecastPicker, or openAirPlayPicker. */
export async function openCastDevicePicker(displayToken?: string, castUrl?: string): Promise<CastPickerResult> {
  return openMobileAwareCastPicker(displayToken, castUrl);
}

/** Availability probe only — never call from a cast-start click handler. */
export async function probeCastDeviceAvailability(displayToken?: string, castUrl?: string) {
  if (isAirPlayCastAvailable()) {
    return true;
  }

  if (prefersWirelessCastOnMobile() && isPresentationCastSupported()) {
    return true;
  }

  if (isGoogleCastBrowser() && isGoogleCastFrameworkReady()) {
    return true;
  }

  if (isPresentationCastSupported()) {
    const PresentationRequestCtor = getPresentationRequestConstructor();
    if (!PresentationRequestCtor) return false;

    try {
      const request = new PresentationRequestCtor([tvUrl(displayToken, castUrl)]);
      if (request.getAvailability) {
        const availability = await request.getAvailability();
        return availability.value;
      }
      return true;
    } catch {
      return true;
    }
  }

  return false;
}
