import { isPresentationCastSupported } from "@/lib/lobby/tv-cast";
import { isAirPlayCastAvailable } from "@/lib/lobby/airplay-cast";
import { isGoogleCastBrowser, isGoogleCastConfigured, isGoogleCastFrameworkReady } from "@/lib/lobby/google-cast";

export function isChromeIos() {
  if (typeof navigator === "undefined") return false;
  return /CriOS/i.test(navigator.userAgent);
}

export function isAndroidChrome() {
  if (typeof navigator === "undefined") return false;
  return (
    /Android/i.test(navigator.userAgent) &&
    /Chrome|Chromium|Edg/i.test(navigator.userAgent) &&
    !/OPR|Opera/i.test(navigator.userAgent)
  );
}

export function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function isGoogleCastSdkLikelySupported() {
  if (!isGoogleCastBrowser()) return false;
  if (isChromeIos()) return false;
  return true;
}

export function supportsWirelessPresentationCast() {
  return isPresentationCastSupported();
}

export function supportsChromecastPicker() {
  return isGoogleCastSdkLikelySupported();
}

export function supportsAirPlayCast() {
  return isAirPlayCastAvailable();
}

/** True when the board should expose any cast action to the current browser. */
export function isCastSenderSupported() {
  if (supportsWirelessPresentationCast()) return true;
  if (supportsAirPlayCast()) return true;
  if (supportsChromecastPicker()) return true;
  if (isMobileBrowser() && isGoogleCastBrowser()) return true;
  return false;
}

export function prefersWirelessCastOnMobile() {
  return isMobileBrowser() && (isAndroidChrome() || isChromeIos()) && supportsWirelessPresentationCast();
}

export function shouldShowCastMenu() {
  return isMobileBrowser();
}

export function getCastUnavailableMessage() {
  if (isChromeIos()) {
    return "Use Wireless Display below, or copy the TV link and open it on your TV browser.";
  }
  if (isAndroidChrome()) {
    return "Use Google Chrome on the same Wi‑Fi as your TV, then choose Wireless Display or Chromecast.";
  }
  return "Use Google Chrome on the same Wi‑Fi as your TV to cast.";
}

export function getCastReadyHint() {
  if (prefersWirelessCastOnMobile()) {
    return "On mobile Chrome, Wireless Display is the fastest way to cast to Chromecast or smart TVs.";
  }
  if (isGoogleCastConfigured() && isGoogleCastFrameworkReady()) {
    return "Choose Chromecast to send this board to your TV.";
  }
  return "Keep this tab open while casting.";
}
