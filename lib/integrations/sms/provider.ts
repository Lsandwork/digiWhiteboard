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

function twilioAuthHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

function explainTwilioDeliveryError(errorCode?: number | null, fallback?: string): string {
  if (errorCode === 30034) {
    return "Twilio 30034: US A2P 10DLC not registered for this number. Complete Brand + Campaign registration, then send via the Messaging Service.";
  }
  if (errorCode === 30032) {
    return "Twilio 30032: Toll-Free number is not verified yet. Submit/finish Toll-Free Verification before US delivery works.";
  }
  if (errorCode === 30007) {
    return "Twilio 30007: Carrier filtered the message (content or sender reputation).";
  }
  if (fallback) return fallback;
  if (errorCode) return `Twilio delivery error ${errorCode}.`;
  return "Twilio accepted the message but delivery failed.";
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
            "Setup Required: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_FROM_NUMBER."
        };
      }

      try {
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
          headers: { Authorization: twilioAuthHeader(accountSid, authToken) },
          cache: "no-store"
        });
        if (!response.ok) {
          const json = (await response.json().catch(() => ({}))) as { message?: string };
          return { ok: false, message: json.message || `Twilio auth failed (HTTP ${response.status}).` };
        }

        const recent = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json?PageSize=5`,
          {
            headers: { Authorization: twilioAuthHeader(accountSid, authToken) },
            cache: "no-store"
          }
        );
        if (recent.ok) {
          const payload = (await recent.json()) as {
            messages?: Array<{ status?: string; error_code?: number | null; to?: string }>;
          };
          const failed = (payload.messages || []).find(
            (m) => m.status === "undelivered" || m.status === "failed"
          );
          if (failed?.error_code) {
            return {
              ok: false,
              message: explainTwilioDeliveryError(
                failed.error_code,
                `Recent SMS to ${failed.to || "a recipient"} failed.`
              )
            };
          }
        }

        const sender = messagingServiceSid
          ? `Messaging Service ${messagingServiceSid}`
          : `From ${fromNumber}`;
        return { ok: true, message: `Twilio credentials valid (${sender}).` };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Twilio connection test failed."
        };
      }
    },
    async send(input) {
      if (!this.isConfigured()) {
        return { ok: false, error: "SMS provider not configured." };
      }
      const body = new URLSearchParams({
        To: input.to,
        Body: input.body
      });

      if (messagingServiceSid && !input.from) {
        body.set("MessagingServiceSid", messagingServiceSid);
      } else {
        body.set("From", input.from || fromNumber);
      }

      const statusCallback = process.env.TWILIO_STATUS_CALLBACK_URL?.trim();
      if (statusCallback) {
        body.set("StatusCallback", statusCallback);
      } else {
        const site = process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/$/, "");
        if (site) {
          body.set("StatusCallback", `${site}/api/ruffly/webhooks/sms-status`);
        }
      }

      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: twilioAuthHeader(accountSid, authToken),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      });
      const json = (await response.json().catch(() => ({}))) as {
        sid?: string;
        message?: string;
        code?: number;
        status?: string;
        error_code?: number | null;
      };
      if (!response.ok) {
        return {
          ok: false,
          error: explainTwilioDeliveryError(json.code ?? json.error_code, json.message || `Twilio HTTP ${response.status}`)
        };
      }
      return { ok: true, providerMessageId: json.sid };
    }
  };
}

export function getSmsProvider(): SmsProvider {
  return createTwilioSmsProvider();
}
