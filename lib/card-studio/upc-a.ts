/**
 * UPC-A is 12 decimal digits including a GS1 check digit.
 * Do not pad, truncate, or rewrite a Gingr owner barcode to force it valid.
 */
export type UpcAStatus = "VALID" | "INVALID" | "MISSING";

export type UpcAEvaluation = {
  status: UpcAStatus;
  raw: string;
  value: string | null;
  message: string;
};

function upcACheckDigit(eleven: string): string {
  let sum = 0;
  for (let i = 0; i < 11; i += 1) {
    const n = Number(eleven[i]);
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return String((10 - (sum % 10)) % 10);
}

export function evaluateUpcA(raw: string | null | undefined): UpcAEvaluation {
  if (raw == null) {
    return {
      status: "MISSING",
      raw: "",
      value: null,
      message: "MISSING: Gingr owner barcode is empty. Card Studio will not invent a barcode."
    };
  }
  const value = String(raw);
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      status: "MISSING",
      raw: value,
      value: null,
      message: "MISSING: Gingr owner barcode is empty. Card Studio will not invent a barcode."
    };
  }
  if (!/^\d+$/.test(trimmed)) {
    return {
      status: "INVALID",
      raw: trimmed,
      value: null,
      message: `INVALID: Gingr owner barcode "${trimmed}" is not numeric and cannot be rendered as UPC-A. The stored value was not modified.`
    };
  }
  if (trimmed.length !== 12) {
    return {
      status: "INVALID",
      raw: trimmed,
      value: null,
      message: `INVALID: Gingr owner barcode "${trimmed}" has ${trimmed.length} digits. UPC-A requires exactly 12 digits (including the check digit). Leading zeros were preserved and the value was not padded or truncated.`
    };
  }
  const expected = upcACheckDigit(trimmed.slice(0, 11));
  if (trimmed[11] !== expected) {
    return {
      status: "INVALID",
      raw: trimmed,
      value: null,
      message: `INVALID: Gingr owner barcode "${trimmed}" is not a valid UPC-A check digit. Expected ${expected} and the stored value was not rewritten.`
    };
  }
  return {
    status: "VALID",
    raw: trimmed,
    value: trimmed,
    message: "VALID: 12-digit UPC-A Gingr owner barcode."
  };
}

export function isValidUpcA(raw: string | null | undefined): raw is string {
  return evaluateUpcA(raw).status === "VALID";
}
