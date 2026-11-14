import { classifyAppointmentOption } from "@/lib/gingr-route-generator/transportation";

const KNOWN_ADDON_PREFIXES = [
  "before outing",
  "after outing",
  "boarding @ fitdog club",
  "boarding @"
] as const;

export function looksLikeServiceAddonLabel(value: string): boolean {
  const token = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!token) return false;
  return KNOWN_ADDON_PREFIXES.some((prefix) => token.startsWith(prefix));
}

/** Collapse whitespace; leave wording otherwise unchanged for classifier matching. */
export function normalizeServiceAddonLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isRecognizedServiceAddon(value: string): boolean {
  return Boolean(classifyAppointmentOption(normalizeServiceAddonLabel(value)));
}