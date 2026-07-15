/** Parse commission sale/service dates from legacy JSON, Gingr CSV, and manual entry. */

export function parseCommissionDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const month = slash[1].padStart(2, "0");
    const day = slash[2].padStart(2, "0");
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${month}-${day}`;
  }

  // Gingr / legacy compact: MMDDYYYY e.g. 07142026
  const compact = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (compact) {
    return `${compact[3]}-${compact[1]}-${compact[2]}`;
  }

  // MMDDYY e.g. 071426
  const compactShort = raw.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (compactShort) {
    return `20${compactShort[3]}-${compactShort[1]}-${compactShort[2]}`;
  }

  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }

  return null;
}
