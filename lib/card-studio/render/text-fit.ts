/** Approximate glyph width for extra-bold condensed ID-card sans. */
const BOLD_WIDTH = 0.62;

export function fitFontSize(text: string, maxWidth: number, requested: number, minSize = 10) {
  const trimmed = text.trim();
  if (!trimmed || maxWidth <= 0) return requested;
  const needed = trimmed.length * requested * BOLD_WIDTH;
  if (needed <= maxWidth) return requested;
  return Math.max(minSize, Math.round((maxWidth / (trimmed.length * BOLD_WIDTH)) * 10) / 10);
}
