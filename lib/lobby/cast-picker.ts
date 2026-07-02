import { startAirPlayCast, isAirPlayPickerSupported } from "@/lib/lobby/airplay-cast";
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

export function isCastDevicePickerSupported() {
  return isAirPlayPickerSupported() || isGoogleCastBrowser() || isPresentationCastSupported();
}

export async function probeCastDeviceAvailability() {
  if (isAirPlayPickerSupported()) {
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
      const request = new PresentationRequestCtor([buildLobbyTvCastUrl()]);
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

export async function openPresentationDevicePicker(): Promise<PresentationConnectionLike> {
  const PresentationRequestCtor = getPresentationRequestConstructor();
  if (!PresentationRequestCtor) {
    throw new Error("Wireless display is not supported in this browser. Use Chrome on desktop.");
  }

  const request = new PresentationRequestCtor([buildLobbyTvCastUrl()]);
  return request.start();
}

export async function openCastDevicePicker(): Promise<CastPickerResult> {
  if (isAirPlayPickerSupported()) {
    await startAirPlayCast();
    return { method: "airplay" };
  }

  if (isGoogleCastBrowser()) {
    try {
      await preloadGoogleCast();
      if (isGoogleCastFrameworkReady()) {
        await startGoogleCastSession();
        return { method: "chromecast" };
      }
    } catch (error) {
      if (isCastCancelled(error)) {
        throw error;
      }
    }
  }

  if (isPresentationCastSupported()) {
    const connection = await openPresentationDevicePicker();
    return { method: "wireless", connection };
  }

  throw new Error("Casting is not supported in this browser. Use Chrome for Chromecast or Safari for AirPlay.");
}
