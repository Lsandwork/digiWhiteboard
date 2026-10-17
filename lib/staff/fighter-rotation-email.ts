import { getEmailProvider, type EmailProvider } from "@/lib/integrations/email/provider";
import type { FighterRotationConflict } from "@/lib/staff/fighter-rotation-alerts";

/**
 * Fighter/Rotation icon alerts are emailed — never SMS'd — for EVERY dog
 * checked in through Gingr that triggers one. The subject line is fixed by
 * operations so the inbox can filter on it, and the body carries the exact
 * comments/notes attached to the icon in Gingr.
 */
export const FIGHTER_ROTATION_ALERT_EMAIL_TO = "contact@fitdog.com";
export const FIGHTER_ROTATION_ALERT_EMAIL_SUBJECT = "Gingr Fighter / Rotation DOG Checking in";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type FighterRotationEmailContent = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export function buildFighterRotationEmail(input: {
  arrivingDogName: string;
  relatedDogNames: string[];
  /** Exact comments/notes from the Fighter/Rotation icons in Gingr. */
  comments: string[];
  checkedInAt?: Date;
}): FighterRotationEmailContent {
  const at = (input.checkedInAt ?? new Date()).toISOString();
  const comments = input.comments.map((comment) => String(comment ?? "").trim()).filter(Boolean);
  const commentLines = comments.length ? comments : ["(No comment text was attached to the icon in Gingr.)"];

  const text = [
    FIGHTER_ROTATION_ALERT_EMAIL_SUBJECT,
    "",
    `Dog checking in: ${input.arrivingDogName}`,
    input.relatedDogNames.length
      ? `Named in notes / also checked in: ${input.relatedDogNames.join(", ")}`
      : "Named in notes / also checked in: (none named)",
    `Checked in at: ${at}`,
    "",
    "Comments / notes from the Fighter/Rotation icon in Gingr:",
    ...commentLines.map((comment) => `- ${comment}`),
    "",
    "This alert is also shown on the staff digital whiteboard. It is never sent by SMS."
  ].join("\n");

  const html = [
    `<h2>${escapeHtml(FIGHTER_ROTATION_ALERT_EMAIL_SUBJECT)}</h2>`,
    `<p><strong>Dog checking in:</strong> ${escapeHtml(input.arrivingDogName)}</p>`,
    input.relatedDogNames.length
      ? `<p><strong>Named in notes / also checked in:</strong> ${escapeHtml(input.relatedDogNames.join(", "))}</p>`
      : "",
    `<p><strong>Checked in at:</strong> ${escapeHtml(at)}</p>`,
    "<p><strong>Comments / notes from the Fighter/Rotation icon in Gingr:</strong></p>",
    "<ul>",
    ...commentLines.map((comment) => `<li>${escapeHtml(comment)}</li>`),
    "</ul>",
    "<p>This alert is also shown on the staff digital whiteboard. It is never sent by SMS.</p>"
  ]
    .filter(Boolean)
    .join("\n");

  return { to: FIGHTER_ROTATION_ALERT_EMAIL_TO, subject: FIGHTER_ROTATION_ALERT_EMAIL_SUBJECT, html, text };
}

/** Build the email from a pushed notice (message already embeds the icon notes). */
export function buildFighterRotationEmailFromNotice(notice: {
  title: string;
  message?: string | null;
}): FighterRotationEmailContent {
  const body = String(notice.message ?? "").trim();
  const firstLine = body.split("\n").map((line) => line.trim()).find(Boolean) ?? notice.title;
  const dogName = firstLine.replace(/\s+is checking in\.?$/i, "").trim() || "Unknown dog";
  return buildFighterRotationEmail({
    arrivingDogName: dogName,
    relatedDogNames: [],
    comments: body ? [body] : []
  });
}

export async function sendFighterRotationEmail(
  content: FighterRotationEmailContent,
  provider: EmailProvider = getEmailProvider()
): Promise<{ ok: boolean; skipped?: boolean; error?: string; providerMessageId?: string }> {
  if (!provider.isConfigured()) {
    return { ok: false, skipped: true, error: "Email provider not configured (RESEND_API_KEY / RUFFLY_EMAIL_FROM)." };
  }
  try {
    const result = await provider.send({
      to: content.to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      purpose: "transactional"
    });
    if (!result.ok) return { ok: false, error: result.error || "Email send failed." };
    return { ok: true, providerMessageId: result.providerMessageId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Email send failed." };
  }
}

/** Send the check-in email and log the known result; never throws into the webhook/push path. */
export async function sendFighterRotationCheckInEmail(conflict: FighterRotationConflict) {
  const result = await sendFighterRotationEmail(
    buildFighterRotationEmail({
      arrivingDogName: conflict.arrivingDogName,
      relatedDogNames: conflict.relatedDogs.map((dog) => dog.dogName),
      comments: conflict.comments
    })
  );
  if (!result.ok) {
    console.error("[fighter-rotation-email] check-in email not sent", {
      dog: conflict.arrivingAnimalId,
      skipped: Boolean(result.skipped),
      error: result.error
    });
  }
  return result;
}

/** Fire-and-forget email for a fighter notice pushed/re-pushed from push-notice paths. */
export function sendFighterRotationNoticeEmailFireAndForget(notice: { title: string; message?: string | null }) {
  void sendFighterRotationEmail(buildFighterRotationEmailFromNotice(notice))
    .then((result) => {
      if (!result.ok) {
        console.error("[fighter-rotation-email] notice email not sent", {
          skipped: Boolean(result.skipped),
          error: result.error
        });
      }
    })
    .catch((error) => {
      console.error("[fighter-rotation-email] notice email failed", {
        error: error instanceof Error ? error.message : "unknown"
      });
    });
}
