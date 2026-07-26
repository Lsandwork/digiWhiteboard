export const TEXT_SCALE_STORAGE_KEY = "fitdog_admin_text_scale";

export const TEXT_SCALES = ["sm", "md", "lg", "xl"] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export const TEXT_SCALE_VALUES: Record<TextScale, number> = {
  sm: 0.9,
  md: 1,
  lg: 1.12,
  xl: 1.25
};

export function isTextScale(value: unknown): value is TextScale {
  return typeof value === "string" && (TEXT_SCALES as readonly string[]).includes(value);
}

export function readStoredTextScale(): TextScale {
  if (typeof window === "undefined") return "md";
  try {
    const stored = window.localStorage.getItem(TEXT_SCALE_STORAGE_KEY);
    return isTextScale(stored) ? stored : "md";
  } catch {
    return "md";
  }
}

export function writeStoredTextScale(scale: TextScale) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEXT_SCALE_STORAGE_KEY, scale);
  } catch {
    // ignore storage errors
  }
}

export function applyTextScaleToDocument(scale: TextScale) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.textScale = scale;
  root.style.setProperty("--admin-text-scale", String(TEXT_SCALE_VALUES[scale]));
}

export function stepTextScale(current: TextScale, direction: -1 | 1): TextScale {
  const index = TEXT_SCALES.indexOf(current);
  const next = Math.min(TEXT_SCALES.length - 1, Math.max(0, index + direction));
  return TEXT_SCALES[next] ?? "md";
}
