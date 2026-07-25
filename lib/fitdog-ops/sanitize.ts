const SENSITIVE_KEY =
  /(card[-_ ]?number|pan|cvv|cvc|security[-_ ]?code|password|passwd|secret|authorization|cookie|session|token|ssn)/i;

export function maskLastFour(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.slice(-4);
}

export function sanitizeFitdogPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (Array.isArray(value)) return value.map((item) => sanitizeFitdogPayload(item, depth + 1));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value.replace(/\D/g, "").length >= 13) {
      return `[redacted-card-ending-${maskLastFour(value) ?? "xxxx"}]`;
    }
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      if (/last[-_ ]?four|last4/i.test(key)) {
        out[key] = maskLastFour(nested);
      } else {
        out[key] = "[redacted]";
      }
      continue;
    }
    out[key] = sanitizeFitdogPayload(nested, depth + 1);
  }
  return out;
}
