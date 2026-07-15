/** Integer-cent money helpers — avoid float final math. */

export function parseMoneyToCents(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  const cleaned = String(value ?? "")
    .replace(/[^0-9.\-]/g, "")
    .trim();
  if (!cleaned) return 0;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function centsToDisplay(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  const sign = safe < 0 ? "-" : "";
  const abs = Math.abs(safe);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

export function formatCentsCurrency(cents: number): string {
  return centsToDisplay(cents);
}

export function parsePercentToBps(value: unknown): number | null {
  const cleaned = String(value ?? "")
    .replace(/[^0-9.\-]/g, "")
    .trim();
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100); // 50.00% → 5000 bps
}

export function bpsToDisplay(bps: number | null | undefined): string {
  if (bps == null || !Number.isFinite(bps)) return "";
  return `${(bps / 100).toFixed(2)}%`;
}

export function calculatePercentCommissionCents(grossCents: number, rateBps: number): number {
  if (!Number.isFinite(grossCents) || !Number.isFinite(rateBps) || rateBps < 0) return 0;
  // (gross * bps) / 10000 with integer rounding
  return Math.round((grossCents * rateBps) / 10_000);
}

export function sanitizeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  // Prevent CSV formula injection on export
  if (/^[=+\-@]/.test(text)) return `'${text}`;
  return text;
}
