import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPER_ADMIN_EMAIL } from "@/lib/admin/auth";
import { getSmsProvider, normalizeSmsToE164 } from "@/lib/integrations/sms/provider";
import { getPublicSiteUrl } from "@/lib/site-url";

/** Lonnie Sandoval — seeded in staff directory / used for demo SMS delivery. */
const LONNIE_FALLBACK_PHONE = "213-913-1391";

export type SuperAdminSmsKind =
  | "fitdog_alert"
  | "front_desk_note"
  | "front_desk_comment"
  | "keyword_alert"
  | "write_up";

export type SuperAdminSmsPayload = {
  kind: SuperAdminSmsKind;
  title: string;
  detail?: string | null;
  idempotencyKey: string;
  adminPath?: string;
};

/** Phrases that must SMS Lonnie regardless of priority. */
const SUPER_ADMIN_SMS_KEYWORD_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "puncture", pattern: /\bpunctur(?:e|ed|ing|es)\b/i },
  { label: "dog fight", pattern: /\bdog[\s-]*fights?\b/i },
  { label: "fight", pattern: /\bfights?\b/i },
  { label: "angry owner", pattern: /\bangry\s+owners?\b/i },
  { label: "sick dog", pattern: /\bsick\s+dogs?\b/i },
  { label: "not eating", pattern: /\bnot\s+eating\b/i },
  { label: "missing meds", pattern: /\bmissing\s+med(?:s|ication|ications)?\b/i },
  { label: "write up", pattern: /\bwrite[\s-]*ups?\b|\bwritten\s+up\b/i }
];

function staffAlertSmsEnabled() {
  const flag = process.env.STAFF_ALERT_SMS_ENABLED?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return true;
}

function siteBase() {
  return getPublicSiteUrl().replace(/\/$/, "");
}

/** True for Critical / Urgent priority or the Urgent toggle — not High alone. */
export function isCriticalOrUrgentStaffNote(input: {
  priority?: string | null;
  urgent?: boolean | null;
}) {
  const priority = String(input.priority || "").trim();
  if (input.urgent) return true;
  return priority === "Critical" || priority === "Urgent";
}

/** First matched sensitive keyword label, or null. */
export function findSuperAdminSmsKeyword(...parts: Array<string | null | undefined>): string | null {
  const text = parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join("\n");
  if (!text) return null;
  for (const row of SUPER_ADMIN_SMS_KEYWORD_PATTERNS) {
    if (row.pattern.test(text)) return row.label;
  }
  return null;
}

export function textTriggersSuperAdminSms(...parts: Array<string | null | undefined>) {
  return findSuperAdminSmsKeyword(...parts) != null;
}

/** Critical/Urgent note OR sensitive keyword mention. */
export function staffContentNeedsSuperAdminSms(input: {
  priority?: string | null;
  urgent?: boolean | null;
  subject?: string | null;
  details?: string | null;
  message?: string | null;
  body?: string | null;
}) {
  if (isCriticalOrUrgentStaffNote(input)) return true;
  return textTriggersSuperAdminSms(input.subject, input.details, input.message, input.body);
}

async function resolveSuperAdminPhone(supabase?: SupabaseClient | null): Promise<string | null> {
  const fromEnv = normalizeSmsToE164(process.env.SUPER_ADMIN_SMS_PHONE);
  if (fromEnv) return fromEnv;

  if (supabase) {
    try {
      const { data } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
      const settings = (data?.settings ?? {}) as Record<string, unknown>;
      const stored = settings.staff_admin_ops as
        | { staff_directory?: Array<{ name?: string; email?: string; phone?: string | null; status?: string }> }
        | undefined;
      const directory = Array.isArray(stored?.staff_directory) ? stored.staff_directory : [];
      const lonnie = directory.find((member) => {
        const email = String(member.email || "")
          .trim()
          .toLowerCase();
        const name = String(member.name || "")
          .trim()
          .toLowerCase();
        const active = String(member.status || "Active").toLowerCase() !== "inactive";
        if (!active) return false;
        return email === SUPER_ADMIN_EMAIL || name.includes("lonnie");
      });
      const fromDirectory = normalizeSmsToE164(lonnie?.phone);
      if (fromDirectory) return fromDirectory;
    } catch {
      // Fall through to hardcoded Lonnie number.
    }
  }

  return normalizeSmsToE164(LONNIE_FALLBACK_PHONE);
}

function truncate(text: string, max: number) {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function buildBody(payload: SuperAdminSmsPayload) {
  const link = `${siteBase()}${payload.adminPath || "/admin?board=staff"}`;
  const parts = [`Fitdog: ${truncate(payload.title, 90)}`, payload.detail ? truncate(payload.detail, 100) : null, link].filter(
    Boolean
  );
  return truncate(parts.join(" — "), 320);
}

/**
 * SMS Lonnie (Super Admin) for critical ops. Never throws — callers use fire-and-forget.
 */
export async function sendSuperAdminSmsAlert(
  payload: SuperAdminSmsPayload,
  supabase?: SupabaseClient | null
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!staffAlertSmsEnabled()) {
    return { ok: false, skipped: true, error: "Staff alert SMS disabled." };
  }

  const sms = getSmsProvider();
  if (!sms.isConfigured()) {
    return { ok: false, skipped: true, error: "Twilio SMS not configured." };
  }

  const to = await resolveSuperAdminPhone(supabase);
  if (!to) {
    return { ok: false, error: "Super Admin phone not found." };
  }

  try {
    const sent = await sms.send({
      to,
      body: buildBody(payload),
      purpose: "transactional",
      idempotencyKey: payload.idempotencyKey
    });
    if (!sent.ok) return { ok: false, error: sent.error || "Twilio send failed." };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "SMS send failed." };
  }
}

/** Fire-and-forget wrapper so sync/create paths never block on Twilio. */
export function sendSuperAdminSmsAlertFireAndForget(
  payload: SuperAdminSmsPayload,
  supabase?: SupabaseClient | null
) {
  void sendSuperAdminSmsAlert(payload, supabase).catch(() => {
    // Intentionally swallow — alerts must not break staff workflows.
  });
}
