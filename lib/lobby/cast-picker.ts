import { isAirPlayCastAvailable, startAirPlayCast, isAirPlayPickerSupported } from "@/lib/lobby/airplay-cast";
import {
  isGoogleCastBrowser,
  isGoogleCastFrameworkReady,
  preloadGoogleCast,
  startGoogleCastSession
} from "@/lib/lobby/google-cast";
import {
  buildLobbyTvCastUrl,
  getPresentationRequestConstructor,
  isPresentationCastSupported,
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

function tvUrl(displayToken?: string) {
  return buildLobbyTvCastUrl(undefined, displayToken);
}

export function isCastDevicePickerSupported() {
  return isAirPlayCastAvailable() || isGoogleCastBrowser() || isPresentationCastSupported();
}

export async function probeCastDeviceAvailability(displayToken?: string) {
  if (isAirPlayCastAvailable()) {
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
      const request = new PresentationRequestCtor([tvUrl(displayToken)]);
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

export async function openPresentationDevicePicker(displayToken?: string): Promise<PresentationConnectionLike> {
  const PresentationRequestCtor = getPresentationRequestConstructor();
  if (!PresentationRequestCtor) {
    throw new Error("Wireless display is not supported in this browser. Use Chrome on desktop.");
  }

  const request = new PresentationRequestCtor([tvUrl(displayToken)]);
  return request.start();
}

export async function openChromecastPicker(displayToken?: string): Promise<CastPickerResult> {
  if (isGoogleCastBrowser()) {
    try {
      await preloadGoogleCast();
      if (isGoogleCastFrameworkReady()) {
        await startGoogleCastSession(displayToken);
        return { method: "chromecast" };
      }
    } catch (error) {
      if (isCastCancelled(error)) {
        throw error;
      }
    }
  }

  if (isPresentationCastSupported()) {
    const connection = await openPresentationDevicePicker(displayToken);
    return { method: "wireless", connection };
  }

  throw new Error("Chromecast is not available in this browser. Use Chrome on desktop.");
}

export async function openAirPlayPicker(): Promise<CastPickerResult> {
  if (!isAirPlayCastAvailable()) {
    throw new Error("AirPlay is not available in this browser. Use Safari on Mac, iPhone, or iPad.");
  }

  await startAirPlayCast();
  return { method: "airplay" };
}

/** Main cast button: Chromecast on Chrome, AirPlay on Safari / Apple devices. */
export async function openDefaultCastDevicePicker(displayToken?: string): Promise<CastPickerResult> {
  if (isGoogleCastBrowser() && !isAirPlayPickerSupported()) {
    return openChromecastPicker(displayToken);
  }

  if (isAirPlayCastAvailable()) {
    return openAirPlayPicker();
  }

  return openChromecastPicker(displayToken);
}

/** @deprecated Use openDefaultCastDevicePicker, openChromecastPicker, or openAirPlayPicker. */
export async function openCastDevicePicker(displayToken?: string): Promise<CastPickerResult> {
  return openDefaultCastDevicePicker(displayToken);
}
