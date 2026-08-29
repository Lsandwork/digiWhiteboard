import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPER_ADMIN_EMAIL } from "@/lib/admin/auth";
import { getSmsProvider, normalizeSmsToE164 } from "@/lib/integrations/sms/provider";
import type { SmsCostCategory } from "@/lib/integrations/sms/cost-events";
import { buildAdminAlertSms } from "@/lib/integrations/sms/templates";
import { getPublicSiteUrl } from "@/lib/site-url";
import { getOrLoadTtlCache, invalidateTtlCache } from "@/lib/server-ttl-cache";

/** Default Super Admin SMS recipients when env/staff directory do not override. */
const SUPER_ADMIN_SMS_FALLBACK_PHONES = ["213-913-1391", "415-250-9297", "404-468-3303"] as const;

/** Cache directory/settings phone lookup — recipients rarely change. */
export const SUPER_ADMIN_PHONE_CACHE_TTL_MS = 30 * 60_000;
const SUPER_ADMIN_PHONE_CACHE_KEY = "staff:super-admin-sms-phones";

export function clearSuperAdminPhoneCacheForTests() {
  invalidateTtlCache(SUPER_ADMIN_PHONE_CACHE_KEY);
}

export type SuperAdminSmsKind =
  | "fitdog_alert"
  | "front_desk_note"
  | "front_desk_comment"
  | "keyword_alert"
  | "write_up"
  | "urgent_alert";

export type SuperAdminSmsPayload = {
  kind: SuperAdminSmsKind;
  title: string;
  detail?: string | null;
  idempotencyKey: string;
  adminPath?: string;
  /** Critical safety alerts may include a short admin link in the SMS body. */
  includeLink?: boolean;
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

function smsCategoryForKind(kind: SuperAdminSmsKind): SmsCostCategory {
  if (kind === "urgent_alert" || kind === "keyword_alert" || kind === "fitdog_alert") {
    return "ADMIN_CRITICAL";
  }
  if (kind === "write_up") return "ADMIN_ROUTINE";
  return "ADMIN_OPERATIONAL";
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

/** Staff whiteboard / emergency push marked Urgent. */
export function isUrgentPushAlert(input: {
  priority?: string | null;
  display_mode?: string | null;
}) {
  const priority = String(input.priority || "")
    .trim()
    .toLowerCase();
  const mode = String(input.display_mode || "")
    .trim()
    .toLowerCase();
  return priority === "urgent" || priority === "emergency" || mode === "urgent" || mode === "emergency";
}

/** SMS Lonnie whenever an urgent/emergency alert is pushed live. Stable idempotency prevents retry duplicates. */
export function sendUrgentAlertSmsFireAndForget(
  input: {
    id: string;
    title: string;
    message?: string | null;
    priority?: string | null;
    display_mode?: string | null;
    source?: string | null;
    /** Explicit staff resend — uses a separate idempotency key and audit trail. */
    resendId?: string | null;
  },
  supabase?: SupabaseClient | null
) {
  if (!isUrgentPushAlert(input)) return;
  const baseKey = `sa-sms:urgent:push:${input.id}`;
  const idempotencyKey = input.resendId ? `${baseKey}:resend:${input.resendId}`.slice(0, 64) : baseKey.slice(0, 64);
  const isHeatAlert = String(input.source || "").trim().toLowerCase() === "heat_alert";
  sendSuperAdminSmsAlertFireAndForget(
    {
      kind: "urgent_alert",
      title: isHeatAlert ? "Heat Alert" : `URGENT: ${input.title}`,
      detail: input.message,
      idempotencyKey,
      adminPath: "/admin?board=admin&tab=emergency_alerts",
      includeLink: !isHeatAlert
    },
    supabase
  );
}

function parsePhoneList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\s]+/)) {
    const normalized = normalizeSmsToE164(part.trim());
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

async function loadSuperAdminPhonesFromSupabase(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from("admin_settings")
    .select("settings->staff_admin_ops->staff_directory")
    .eq("id", "default")
    .maybeSingle();
  const directoryRaw = (data as Record<string, unknown> | null)?.staff_directory;
  const directory = Array.isArray(directoryRaw)
    ? (directoryRaw as Array<{ name?: string; email?: string; phone?: string | null; status?: string }>)
    : [];
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
  if (fromDirectory) return [fromDirectory];
  return SUPER_ADMIN_SMS_FALLBACK_PHONES.map((phone) => normalizeSmsToE164(phone)).filter(Boolean) as string[];
}

/** All E.164 phones that receive Super Admin / ops SMS alerts. */
export async function resolveSuperAdminPhones(supabase?: SupabaseClient | null): Promise<string[]> {
  const fromPluralEnv = parsePhoneList(process.env.SUPER_ADMIN_SMS_PHONES);
  if (fromPluralEnv.length) return fromPluralEnv;

  const fromEnv = normalizeSmsToE164(process.env.SUPER_ADMIN_SMS_PHONE);
  if (fromEnv) return [fromEnv];

  if (supabase) {
    try {
      return await getOrLoadTtlCache(SUPER_ADMIN_PHONE_CACHE_KEY, SUPER_ADMIN_PHONE_CACHE_TTL_MS, () =>
        loadSuperAdminPhonesFromSupabase(supabase)
      );
    } catch {
      // Fall through to hardcoded recipients.
    }
  }

  return SUPER_ADMIN_SMS_FALLBACK_PHONES.map((phone) => normalizeSmsToE164(phone)).filter(Boolean) as string[];
}

function buildBody(payload: SuperAdminSmsPayload) {
  return buildAdminAlertSms({
    title: payload.title,
    detail: payload.detail,
    adminPath: payload.adminPath,
    includeLink: payload.includeLink,
    siteBase: siteBase()
  });
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

  const phones = await resolveSuperAdminPhones(supabase);
  if (!phones.length) {
    return { ok: false, error: "Super Admin phone not found." };
  }

  const category = smsCategoryForKind(payload.kind);
  const body = buildBody(payload);

  try {
    const results = await Promise.all(
      phones.map((to) =>
        sms.send({
          to,
          body,
          purpose: "transactional",
          idempotencyKey: `${payload.idempotencyKey}:${to.slice(-4)}`.slice(0, 64),
          costMetadata: {
            category,
            templateKey: `admin_${payload.kind}`,
            multiSegmentFlag: category !== "ADMIN_CRITICAL"
          }
        })
      )
    );
    const failed = results.filter((row) => !row.ok);
    if (failed.length === results.length) {
      return { ok: false, error: failed[0]?.error || "Twilio send failed." };
    }
    if (failed.length) {
      return {
        ok: true,
        error: `Partial send: ${failed.length}/${results.length} failed (${failed.map((row) => row.error).filter(Boolean).join("; ")})`
      };
    }
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
