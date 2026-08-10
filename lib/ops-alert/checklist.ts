/**
 * Turn free-form reminder instructions into short checklist lines whenever
 * the copy is structured enough. Falls back to an empty list so the message
 * body can still render as a paragraph.
 */

const BULLET_PREFIX = /^(?:[-*•●◦▪▸►✓✔☑✅]|[\d]+[.)])\s+/;

function cleanLine(line: string) {
  return line.replace(BULLET_PREFIX, "").replace(/\s+/g, " ").trim();
}

function looksLikeChecklist(lines: string[]) {
  if (lines.length < 2) return false;
  const bulletHits = lines.filter((line) => BULLET_PREFIX.test(line)).length;
  if (bulletHits >= Math.ceil(lines.length * 0.5)) return true;
  // Short parallel lines without bullets still read as a checklist on the yard TV.
  const shortLines = lines.filter((line) => line.length > 0 && line.length <= 64 && !/[.!?]$/.test(line));
  return shortLines.length >= 2 && shortLines.length === lines.length;
}

export function parseChecklistItems(message: string | null | undefined): string[] {
  if (!message) return [];
  const raw = message.replace(/\r\n/g, "\n").trim();
  if (!raw) return [];

  const newlineSplit = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (newlineSplit.length >= 2 && looksLikeChecklist(newlineSplit)) {
    return newlineSplit.map(cleanLine).filter(Boolean);
  }

  const semicolonSplit = raw
    .split(/\s*;\s*/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (semicolonSplit.length >= 3 && looksLikeChecklist(semicolonSplit)) {
    return semicolonSplit.map(cleanLine).filter(Boolean);
  }

  // "Do A, then B, then C" / "A, B, and C" style yard checklists.
  const andSplit = raw
    .split(/\s*(?:,|\band\b)\s+/i)
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    andSplit.length >= 3 &&
    andSplit.every((line) => line.length <= 48) &&
    !raw.includes("?")
  ) {
    return andSplit.map(cleanLine).filter(Boolean);
  }

  return [];
}

/** Message text with checklist lines removed, for residual paragraph display. */
export function residualMessage(message: string | null | undefined, checklist: string[]) {
  if (!message) return null;
  if (!checklist.length) return message.trim() || null;
  // When the whole message became a checklist, don't also show the paragraph.
  return null;
}
