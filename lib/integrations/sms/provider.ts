export type SmsSendInput = {
  to: string;
  body: string;
  from?: string;
  purpose: "transactional" | "marketing";
  idempotencyKey?: string;
};

export type SmsProvider = {
  id: string;
  displayName: string;
  isConfigured(): boolean;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  send(input: SmsSendInput): Promise<{ ok: boolean; providerMessageId?: string; error?: string }>;
};

/** Normalize US/CA phones to E.164. Rejects masked or partial numbers. */
export function normalizeSmsToE164(phone: string | null | undefined): string | null {
  const raw = String(phone ?? "").trim();
  if (!raw || /[•*]/.test(raw)) return null;
  // Prefer an explicit phone-shaped chunk before we strip all non-digits
  // (flattened notes often append gate codes after " · ").
  const chunk =
    raw.match(/\+?1?[\s.\-()]?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/)?.[0] ||
    raw.split(/\s*[·|]\s*/)[0] ||
    raw;
  const digits = chunk.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function createTwilioSmsProvider(): SmsProvider {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim() || "";
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || "";

  return {
    id: "twilio",
    displayName: "Twilio SMS",
    isConfigured() {
      return Boolean(accountSid && authToken && (messagingServiceSid || fromNumber));
    },
    async testConnection() {
      if (!this.isConfigured()) {
        return {
          ok: false,
          message:
            "Setup Required: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID (or TWILIO_FROM_NUMBER)."
        };
      }
      try {
        const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
          headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
          cache: "no-store"
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          return { ok: false, message: `Twilio auth failed (${response.status}): ${text.slice(0, 160)}` };
        }
        const json = (await response.json()) as { friendly_name?: string; status?: string };
        const via = messagingServiceSid ? "Messaging Service" : `From ${fromNumber}`;
        return {
          ok: true,
          message: `Twilio reachable (${json.friendly_name || accountSid.slice(0, 8)}…, status=${json.status || "unknown"}, send via ${via}).`
        };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Twilio connection failed."
        };
      }
    },
    async send(input) {
      if (!this.isConfigured()) {
        return { ok: false, error: "SMS provider not configured." };
      }
      const to = normalizeSmsToE164(input.to);
      if (!to) {
        return { ok: false, error: `Invalid destination phone: ${String(input.to || "").slice(0, 40)}` };
      }
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const body = new URLSearchParams({
        To: to,
        Body: input.body
      });
      // Prefer Messaging Service (A2P 10DLC) when configured; otherwise From number.
      if (messagingServiceSid) {
        body.set("MessagingServiceSid", messagingServiceSid);
      } else {
        body.set("From", input.from || fromNumber);
      }
      const headers: Record<string, string> = {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      };
      if (input.idempotencyKey) {
        headers["I-Twilio-Idempotency-Token"] = input.idempotencyKey.slice(0, 64);
      }
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers,
        body
      });
      const json = (await response.json().catch(() => ({}))) as {
        sid?: string;
        message?: string;
        code?: number;
        more_info?: string;
        status?: string;
      };
      if (!response.ok) {
        const detail = [json.message, json.code ? `code ${json.code}` : null, json.more_info]
          .filter(Boolean)
          .join(" — ");
        return { ok: false, error: detail || `Twilio HTTP ${response.status}` };
      }
      return { ok: true, providerMessageId: json.sid };
    }
  };
}

export function getSmsProvider(): SmsProvider {
  return createTwilioSmsProvider();
}
