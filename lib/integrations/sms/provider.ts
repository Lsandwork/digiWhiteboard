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

export function createTwilioSmsProvider(): SmsProvider {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim() || "";

  return {
    id: "twilio",
    displayName: "Twilio SMS",
    isConfigured() {
      return Boolean(accountSid && authToken && fromNumber);
    },
    async testConnection() {
      if (!this.isConfigured()) {
        return { ok: false, message: "Setup Required: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER." };
      }
      return { ok: true, message: "Twilio credentials present (live send not executed)." };
    },
    async send(input) {
      if (!this.isConfigured()) {
        return { ok: false, error: "SMS provider not configured." };
      }
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const body = new URLSearchParams({
        To: input.to,
        From: input.from || fromNumber,
        Body: input.body
      });
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      });
      const json = (await response.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (!response.ok) {
        return { ok: false, error: json.message || `Twilio HTTP ${response.status}` };
      }
      return { ok: true, providerMessageId: json.sid };
    }
  };
}

export function getSmsProvider(): SmsProvider {
  return createTwilioSmsProvider();
}
