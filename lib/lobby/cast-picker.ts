import { isAirPlayCastAvailable, startAirPlayCast, stopAirPlayCast } from "@/lib/lobby/airplay-cast";
import {
  isAndroidChrome,
  isChromeIos,
  prefersWirelessCastOnMobile
} from "@/lib/lobby/cast-platform";
import {
  isGoogleCastBrowser,
  isGoogleCastConfigured,
  isGoogleCastFrameworkReady,
  preloadGoogleCast,
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

export async function probeCastDeviceAvailability(displayToken?: string, castUrl?: string) {
  if (isAirPlayCastAvailable()) {
    return true;
  }

  if (prefersWirelessCastOnMobile() && isPresentationCastSupported()) {
    return true;
  }

  if (isGoogleCastBrowser()) {
    try {
      await preloadGoogleCast();
      if (isGoogleCastFrameworkReady()) return true;
    } catch {
      // Fall through to Presentation API.
    }
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

export async function openPresentationDevicePicker(displayToken?: string, castUrl?: string): Promise<PresentationConnectionLike> {
  const PresentationRequestCtor = getPresentationRequestConstructor();
  if (!PresentationRequestCtor) {
    throw new Error("Wireless display is not supported in this browser. Try Google Chrome on Android or desktop.");
  }

  const request = new PresentationRequestCtor([tvUrl(displayToken, castUrl)]);
  const connection = await request.start();
  setActivePresentationConnection(connection);
  return connection;
}

export function getDefaultCastRoute(): "chromecast" | "wireless" | "airplay" {
  if (prefersWirelessCastOnMobile()) return "wireless";
  if (isGoogleCastBrowser()) return "chromecast";
  if (isAirPlayCastAvailable()) return "airplay";
  return "chromecast";
}

export async function openChromecastPicker(displayToken?: string, castUrl?: string): Promise<CastPickerResult> {
  if (!isGoogleCastBrowser()) {
    throw new Error("Chromecast is not available in this browser. Use Google Chrome.");
  }

  const url = tvUrl(displayToken, castUrl);

  if (isGoogleCastConfigured()) {
    try {
      await preloadGoogleCast();
      if (isGoogleCastFrameworkReady()) {
        await startGoogleCastSession(displayToken, url);
        return { method: "chromecast" };
      }
    } catch (error) {
      if (isCastCancelled(error)) {
        throw error;
      }
    }
  }

  if (isPresentationCastSupported()) {
    const connection = await openPresentationDevicePicker(displayToken, url);
    return { method: "wireless", connection };
  }

  if (isGoogleCastConfigured()) {
    try {
      await preloadGoogleCast();
      if (isGoogleCastFrameworkReady()) {
        await startGoogleCastSession(displayToken, url);
        return { method: "chromecast" };
      }
    } catch (error) {
      if (isCastCancelled(error)) {
        throw error;
      }
    }
  }

  if (isChromeIos()) {
    throw new Error("Chromecast is not available in Chrome on iPhone. Use Wireless Display or copy the TV link.");
  }

  if (!isGoogleCastConfigured()) {
    throw new Error(
      "Chromecast whiteboard casting needs setup. Use Wireless Display, copy the TV link, or ask an admin to configure Google Cast."
    );
  }

  throw new Error("Unable to cast the whiteboard. Use Google Chrome on the same Wi‑Fi as your TV.");
}

export async function openWirelessCastPicker(displayToken?: string, castUrl?: string): Promise<CastPickerResult> {
  if (!isPresentationCastSupported()) {
    throw new Error("Wireless display is not supported in this browser.");
  }

  const connection = await openPresentationDevicePicker(displayToken, castUrl);
  return { method: "wireless", connection };
}

export async function openAirPlayPicker(): Promise<CastPickerResult> {
  if (!isAirPlayCastAvailable()) {
    throw new Error("AirPlay is not available in this browser. Use Safari on Mac, iPhone, or iPad.");
  }

  await startAirPlayCast();
  return { method: "airplay" };
}

/** Smart cast route for staff and lobby boards, with mobile Chrome support. */
export async function openMobileAwareCastPicker(displayToken?: string, castUrl?: string): Promise<CastPickerResult> {
  const route = getDefaultCastRoute();
  if (route === "wireless") {
    try {
      return await openWirelessCastPicker(displayToken, castUrl);
    } catch (error) {
      if (isCastCancelled(error)) throw error;
      if (isAndroidChrome()) {
        return openChromecastPicker(displayToken, castUrl);
      }
      throw error;
    }
  }

  if (route === "airplay") {
    return openAirPlayPicker();
  }

  return openChromecastPicker(displayToken, castUrl);
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
