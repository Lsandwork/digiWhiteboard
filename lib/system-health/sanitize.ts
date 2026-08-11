/**
 * Sanitizer for System Health diagnostics and Cursor debug bridge output.
 * Never emit secrets; redact PII by default for developer exports.
 */

const SECRET_KEY_RE =
  /(password|passwd|secret|token|api[_-]?key|authorization|refresh[_-]?token|session|cookie|credential|private[_-]?key|bearer)/i;

const PII_KEY_RE =
  /(phone|email|sms|message_body|message_content|address_street|street|home_address|full_address|owner_full_name|owner_name|customer_note|special_notes|driver_notes|reservation_notes|payment|card|cvv|ssn)/i;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g;

export type SanitizeOptions = {
  /** When true (default for Cursor/CLI), strip PII aggressively. */
  forDeveloper?: boolean;
  /** Allow city/ZIP presence flags without full street. */
  keepAddressDiagnostics?: boolean;
  maxDepth?: number;
  maxStringLength?: number;
};

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "[redacted-phone]";
  return `•••-•••-${digits.slice(-4)}`;
}

function redactString(value: string, options: SanitizeOptions): string {
  let out = value;
  out = out.replace(EMAIL_RE, "[redacted-email]");
  out = out.replace(PHONE_RE, (m) => maskPhone(m));
  const max = options.maxStringLength ?? 2000;
  if (out.length > max) out = `${out.slice(0, max)}…[truncated]`;
  return out;
}

/** IDs that must never be phone-masked (digits look like phone fragments). */
const PRESERVE_ID_KEY_RE =
  /^(correlation_id|request_id|id|plan_id|report_run_id|audit_id|entity_id|job_id)$/i;

function shouldPreserveIdentifier(key: string, value: string): boolean {
  if (PRESERVE_ID_KEY_RE.test(key)) return true;
  if (/^RG-\d{8}-\d{5}$/i.test(value.trim())) return true;
  if (/^(req_|err_|RG-)/i.test(value.trim())) return true;
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeValue(value: unknown, options: SanitizeOptions = {}, depth = 0): unknown {
  const forDeveloper = options.forDeveloper !== false;
  const maxDepth = options.maxDepth ?? 8;
  if (depth > maxDepth) return "[max-depth]";
  if (value == null) return value;
  if (typeof value === "string") return redactString(value, options);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item) => sanitizeValue(item, options, depth + 1));
  }
  if (!isPlainObject(value)) return String(value);

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (SECRET_KEY_RE.test(key)) {
      out[key] = "[redacted-secret]";
      continue;
    }
    if (typeof raw === "string" && shouldPreserveIdentifier(key, raw)) {
      out[key] = raw;
      continue;
    }
    if (forDeveloper && PII_KEY_RE.test(key)) {
      if (options.keepAddressDiagnostics && /address|street|city|zip|postal/i.test(key)) {
        if (typeof raw === "string") {
          const s = raw.trim();
          if (/city|zip|postal|state/i.test(key)) {
            out[key] = /zip|postal/i.test(key) ? Boolean(s) : s.slice(0, 40);
          } else if (/street|address/i.test(key)) {
            out[`${key}_present`] = Boolean(s);
            out[`${key}_length`] = s.length;
            continue;
          }
        }
      }
      if (/phone/i.test(key) && typeof raw === "string") {
        out[key] = maskPhone(raw);
        continue;
      }
      out[key] = "[redacted-pii]";
      continue;
    }
    out[key] = sanitizeValue(raw, options, depth + 1);
  }
  return out;
}

export function sanitizeForCursor(value: unknown): unknown {
  return sanitizeValue(value, { forDeveloper: true, keepAddressDiagnostics: true });
}

export function sanitizeForUi(value: unknown): unknown {
  return sanitizeValue(value, { forDeveloper: false, keepAddressDiagnostics: true });
}

export function buildAddressDiagnostic(address: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  raw?: string | null;
  lat?: number | null;
  lng?: number | null;
  geocodeStatus?: string | null;
}) {
  const street = String(address.street || "").trim();
  const city = String(address.city || "").trim();
  const zip = String(address.zip || "").trim();
  const raw = String(address.raw || "").trim();
  return {
    street_number_present: /^\d/.test(street) || /^\d/.test(raw),
    street_present: Boolean(street || raw),
    city: city || null,
    postal_code_present: Boolean(zip),
    state: address.state || null,
    geocode_status: address.geocodeStatus || null,
    has_coordinates: address.lat != null && address.lng != null
  };
}

export function assertNoSecrets(payload: unknown): void {
  const json = JSON.stringify(payload ?? {});
  if (/sk_live|sk_test|Bearer\s+[A-Za-z0-9\-._~+/]+=*/i.test(json)) {
    throw new Error("Refusing to emit payload that appears to contain secrets.");
  }
}
