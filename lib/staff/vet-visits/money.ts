export function parseMoneyToCents(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  const cleaned = String(value ?? "")
    .replace(/[^0-9.\-]/g, "")
    .trim();
  if (!cleaned) return 0;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function centsToDisplay(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  const sign = safe < 0 ? "-" : "";
  return `${sign}$${(Math.abs(safe) / 100).toFixed(2)}`;
}
