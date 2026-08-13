/**
 * HTML <input type="date"> only accepts YYYY-MM-DD.
 * Safari/WebKit throws "The string did not match the expected pattern."
 * if Intl.DateTimeFormat("en-CA") injects slashes, unicode dashes, or bidi marks.
 */

const HTML_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isHtmlDateValue(value: unknown): boolean {
  return typeof value === "string" && HTML_DATE.test(value.trim());
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function pacificHtmlDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const year = onlyDigits(parts.find((part) => part.type === "year")?.value ?? "");
  const month = onlyDigits(parts.find((part) => part.type === "month")?.value ?? "").padStart(2, "0");
  const day = onlyDigits(parts.find((part) => part.type === "day")?.value ?? "").padStart(2, "0");
  if (year.length === 4 && month.length === 2 && day.length === 2) {
    return `${year}-${month}-${day}`;
  }
  return now.toISOString().slice(0, 10);
}

export function htmlDateInputValue(value: unknown): string {
  const raw = String(value ?? "").trim();
  return isHtmlDateValue(raw) ? raw : "";
}

export function normalizeHtmlDateValue(value: unknown, fallback = ""): string {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  if (isHtmlDateValue(raw)) return raw;

  const cleaned = raw.replace(/[\u200e\u200f\u2066-\u2069]/g, "").replace(/[\u2010-\u2015]/g, "-");
  const iso = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const slash = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const month = slash[1].padStart(2, "0");
    const day = slash[2].padStart(2, "0");
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${month}-${day}`;
  }

  return fallback;
}
