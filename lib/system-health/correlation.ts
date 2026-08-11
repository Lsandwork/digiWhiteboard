/** Correlation ID helpers for end-to-end operation tracing. */

function pad(n: number, width: number) {
  return String(n).padStart(width, "0");
}

/** Route Generator correlation: RG-YYYYMMDD-##### */
export function createRouteCorrelationId(operatingDate?: string | Date, sequence?: number): string {
  const d =
    operatingDate instanceof Date
      ? operatingDate
      : operatingDate
        ? new Date(`${String(operatingDate).slice(0, 10)}T12:00:00`)
        : new Date();
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1, 2);
  const day = pad(d.getUTCDate(), 2);
  const seq =
    sequence != null
      ? pad(sequence % 100000, 5)
      : pad(Math.floor(Math.random() * 100000), 5);
  return `RG-${y}${m}${day}-${seq}`;
}

export function createRequestId(prefix = "req"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function createErrorId(): string {
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isRouteCorrelationId(value: string): boolean {
  return /^RG-\d{8}-\d{5}$/i.test(String(value || "").trim());
}
