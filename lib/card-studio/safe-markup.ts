/**
 * Raw SVG/icon markup from template JSON is rendered with innerHTML in the designer and
 * the print preview. No editor UI produces it; anything script-capable is dropped
 * (element falls back to its `src` image or renders empty).
 */
const UNSAFE_SVG_MARKUP =
  /<\s*\/?\s*(script|foreignobject|iframe|object|embed|link|meta|style|a|use|animate|animatemotion|animatetransform|set|handler|base|form|input|textarea|button)\b|\bon[a-z]+\s*=|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|&#|&[a-z]+;|<!|<\?/i;

export function safeSvgMarkup(markup: unknown): string {
  const value = typeof markup === "string" ? markup.trim() : "";
  if (!value) return "";
  if (UNSAFE_SVG_MARKUP.test(value)) return "";
  return value;
}
