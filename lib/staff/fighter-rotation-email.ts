import { getEmailProvider, type EmailProvider } from "@/lib/integrations/email/provider";

export const FIGHTER_ROTATION_EMAIL_TO = "contact@fitdog.com";
export const FIGHTER_ROTATION_EMAIL_SUBJECT = "Gingr Fighter / Rotation DOG Checking in";

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type FighterRotationCheckInEmailInput = {
  dogName: string;
  ownerName?: string | null;
  /** Full icon comment/note lines, e.g. "Rex: Separate from Max" — shown verbatim in the email. */
  comments: string[];
  checkedInAt?: string | null;
};

export function buildFighterRotationCheckInEmail(input: FighterRotationCheckInEmailInput) {
  const dogName = String(input.dogName ?? "").trim() || "Dog";
  const ownerName = String(input.ownerName ?? "").trim();
  const comments = input.comments.map((comment) => stripHtml(comment)).filter(Boolean);
  const checkedInAt = input.checkedInAt ? new Date(input.checkedInAt) : null;
  const checkedInLabel =
    checkedInAt && !Number.isNaN(checkedInAt.getTime()) ? checkedInAt.toISOString() : null;

  const text = [
    FIGHTER_ROTATION_EMAIL_SUBJECT,
    "",
    `Dog checking in: ${dogName}`,
    ownerName ? `Owner: ${ownerName}` : null,
    checkedInLabel ? `Checked in: ${checkedInLabel}` : null,
    "",
    "Fighter / Rotation icon comments / notes from Gingr:",
    "",
    ...(comments.length ? comments : ["(No Fighter/Rotation comment text was returned by Gingr for this dog.)"])
  ]
    .filter((line) => line !== null)
    .join("\n");

  const commentsHtml = comments.length
    ? comments
        .map(
          (comment) =>
            `<p style="margin:0 0 14px;font-size:18px;line-height:1.45;">${escapeHtml(comment)}</p>`
        )
        .join("")
    : `<p style="margin:0;font-size:18px;line-height:1.45;">(No Fighter/Rotation comment text was returned by Gingr for this dog.)</p>`;

  const html = `<!DOCTYPE html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#111827;">
  <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b45309;">${escapeHtml(
    FIGHTER_ROTATION_EMAIL_SUBJECT
  )}</p>
  <h1 style="margin:0 0 12px;font-size:28px;">${escapeHtml(dogName)} is checking in</h1>
  ${ownerName ? `<p style="margin:0 0 6px;font-size:16px;">Owner: ${escapeHtml(ownerName)}</p>` : ""}
  ${checkedInLabel ? `<p style="margin:0 0 16px;font-size:14px;color:#4b5563;">Checked in: ${escapeHtml(checkedInLabel)}</p>` : ""}
  <h2 style="margin:20px 0 10px;font-size:18px;">Fighter / Rotation icon comments / notes from Gingr</h2>
  <div style="border:1px solid #f59e0b;background:#fffbeb;border-radius:8px;padding:16px 18px;">${commentsHtml}</div>
  <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Also shown on the staff digital whiteboard. This email is sent for every Gingr check-in of a dog with a Fighter/Rotation icon.</p>
</body></html>`;

  return { to: FIGHTER_ROTATION_EMAIL_TO, subject: FIGHTER_ROTATION_EMAIL_SUBJECT, text, html };
}

export async function sendFighterRotationCheckInEmail(
  input: FighterRotationCheckInEmailInput,
  provider: EmailProvider = getEmailProvider()
) {
  if (!provider.isConfigured()) {
    return { ok: false as const, error: "email_provider_not_configured" };
  }
  const content = buildFighterRotationCheckInEmail(input);
  const result = await provider.send({
    to: content.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    purpose: "transactional"
  });
  return result.ok
    ? { ok: true as const, providerMessageId: result.providerMessageId }
    : { ok: false as const, error: result.error || "email_send_failed" };
}
