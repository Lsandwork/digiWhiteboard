/**
 * Fail-safe structured event emitter for System Health.
 * Never throws into calling application paths.
 */

import { getServiceSupabase } from "@/lib/supabase/server";
import { sanitizeValue } from "@/lib/system-health/sanitize";
import type { SystemHealthEventInput } from "@/lib/system-health/types";

function releaseVersion(): string | null {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.npm_package_version ||
    null
  );
}

function environment(): string {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
}

export async function emitSystemHealthEvent(input: SystemHealthEventInput): Promise<string | null> {
  try {
    const supabase = getServiceSupabase();
    const occurredAt =
      input.occurredAt instanceof Date
        ? input.occurredAt.toISOString()
        : input.occurredAt || new Date().toISOString();

    const row = {
      event_type: input.eventType,
      event_category: input.eventCategory ?? "system",
      severity: input.severity ?? "info",
      occurred_at: occurredAt,
      user_id: input.userId ?? null,
      user_email: input.userEmail ?? null,
      role: input.role ?? null,
      module: input.module ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      correlation_id: input.correlationId ?? null,
      request_id: input.requestId ?? null,
      session_id: input.sessionId ?? null,
      integration: input.integration ?? null,
      status: input.status ?? null,
      duration_ms: input.durationMs ?? null,
      message: input.message ?? null,
      metadata_json: sanitizeValue(input.metadata ?? {}, { forDeveloper: false }) as Record<
        string,
        unknown
      >,
      before_json: input.before != null ? sanitizeValue(input.before, { forDeveloper: false }) : null,
      after_json: input.after != null ? sanitizeValue(input.after, { forDeveloper: false }) : null,
      release_version: releaseVersion(),
      environment: environment()
    };

    const { data, error } = await supabase
      .from("system_health_events")
      .insert(row)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[system-health] emit event failed", error.message);
      return null;
    }
    return data?.id ? String(data.id) : null;
  } catch (error) {
    console.error("[system-health] emit event exception", error);
    return null;
  }
}

export async function emitSystemHealthEvents(
  inputs: SystemHealthEventInput[]
): Promise<number> {
  if (!inputs.length) return 0;
  try {
    const supabase = getServiceSupabase();
    const release = releaseVersion();
    const env = environment();
    const rows = inputs.map((input) => {
      const occurredAt =
        input.occurredAt instanceof Date
          ? input.occurredAt.toISOString()
          : input.occurredAt || new Date().toISOString();
      return {
        event_type: input.eventType,
        event_category: input.eventCategory ?? "system",
        severity: input.severity ?? "info",
        occurred_at: occurredAt,
        user_id: input.userId ?? null,
        user_email: input.userEmail ?? null,
        role: input.role ?? null,
        module: input.module ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        correlation_id: input.correlationId ?? null,
        request_id: input.requestId ?? null,
        session_id: input.sessionId ?? null,
        integration: input.integration ?? null,
        status: input.status ?? null,
        duration_ms: input.durationMs ?? null,
        message: input.message ?? null,
        metadata_json: sanitizeValue(input.metadata ?? {}, { forDeveloper: false }),
        before_json: input.before != null ? sanitizeValue(input.before, { forDeveloper: false }) : null,
        after_json: input.after != null ? sanitizeValue(input.after, { forDeveloper: false }) : null,
        release_version: release,
        environment: env
      };
    });
    const { error } = await supabase.from("system_health_events").insert(rows);
    if (error) {
      console.error("[system-health] batch emit failed", error.message);
      return 0;
    }
    return rows.length;
  } catch (error) {
    console.error("[system-health] batch emit exception", error);
    return 0;
  }
}

export async function recordUserActivity(params: {
  action: string;
  message: string;
  userId?: string | null;
  userEmail?: string | null;
  role?: string | null;
  module?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
  before?: unknown;
  after?: unknown;
  severity?: SystemHealthEventInput["severity"];
}) {
  return emitSystemHealthEvent({
    eventType: params.action,
    eventCategory: "user_activity",
    severity: params.severity ?? "info",
    userId: params.userId,
    userEmail: params.userEmail,
    role: params.role,
    module: params.module ?? "ruffops",
    entityType: params.entityType,
    entityId: params.entityId,
    correlationId: params.correlationId,
    message: params.message,
    metadata: params.metadata,
    before: params.before,
    after: params.after
  });
}
