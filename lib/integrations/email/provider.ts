export type EmailSendInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  purpose: "transactional" | "marketing";
};

export type EmailProvider = {
  id: string;
  displayName: string;
  isConfigured(): boolean;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  send(input: EmailSendInput): Promise<{ ok: boolean; providerMessageId?: string; error?: string }>;
};

export function createResendEmailProvider(): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY?.trim() || "";
  const from = process.env.RUFFLY_EMAIL_FROM?.trim() || "";

  return {
    id: "resend",
    displayName: "Resend Email",
    isConfigured() {
      return Boolean(apiKey && from);
    },
    async testConnection() {
      if (!this.isConfigured()) {
        return { ok: false, message: "Setup Required: set RESEND_API_KEY and RUFFLY_EMAIL_FROM." };
      }
      return { ok: true, message: "Resend credentials present (live send not executed)." };
    },
    async send(input) {
      if (!this.isConfigured()) return { ok: false, error: "Email provider not configured." };
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text
        })
      });
      const json = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok) return { ok: false, error: json.message || `Resend HTTP ${response.status}` };
      return { ok: true, providerMessageId: json.id };
    }
  };
}

export function getEmailProvider(): EmailProvider {
  return createResendEmailProvider();
}
