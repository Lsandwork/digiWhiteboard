export function toUsdCents(amount: unknown): number {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromUsdCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function normalizeUsdAmount(amount: unknown): number {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function formatUsd(amount: unknown, currency = "USD"): string {
  const value = normalizeUsdAmount(amount);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      currencyDisplay: "symbol"
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

export function isPositiveAmount(amount: unknown): boolean {
  return normalizeUsdAmount(amount) > 0;
}
