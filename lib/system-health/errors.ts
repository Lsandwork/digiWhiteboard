/** Fingerprinted error capture — groups identical exceptions. */

import { createHash } from "crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import { sanitizeValue } from "@/lib/system-health/sanitize";
import { emitSystemHealthEvent } from "@/lib/system-health/events";
import type { CaptureErrorInput } from "@/lib/system-health/types";

function releaseVersion(): string | null {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
    process.env.NEXT_PUBLIC_APP_VERSION ||
    null
  );
}

function environment(): string {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
}

function normalizeMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b\d{4,}\b/g, "<n>")
    .slice(0, 500);
}

export function fingerprintError(errorType: string, message: string, stack?: string | null): string {
  const stackHead = String(stack || "")
    .split("\n")
    .slice(0, 4)
    .map((l) => l.replace(/:\d+:\d+/g, ":?:?"))
    .join("|");
  const basis = `${errorType}|${normalizeMessage(message)}|${stackHead}`;
  return createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

function serializeError(error: unknown): { type: string; message: string; stack: string | null } {
  if (error instanceof Error) {
    return {
      type: error.name || "Error",
      message: error.message || "Unknown error",
      stack: error.stack || null
    };
  }
  if (typeof error === "string") {
    return { type: "Error", message: error, stack: null };
  }
  try {
    return { type: "Error", message: JSON.stringify(error), stack: null };
  } catch {
    return { type: "Error", message: String(error), stack: null };
  }
}

export async function captureSystemHealthError(input: CaptureErrorInput): Promise<string | null> {
  try {
    const supabase = getServiceSupabase();
    const serialized = serializeError(input.error);
    const fingerprint = fingerprintError(serialized.type, serialized.message, serialized.stack);
    const now = new Date().toISOString();
    const context = sanitizeValue(input.context ?? {}, { forDeveloper: false }) as Record<
      string,
      unknown
    >;

    const { data: existing } = await supabase
      .from("system_health_errors")
      .select("id, occurrence_count, status")
      .eq("fingerprint", fingerprint)
      .maybeSingle();

    if (existing?.id) {
      const nextCount = Number(existing.occurrence_count || 1) + 1;
      const reopen = existing.status === "resolved" ? { status: "unresolved", resolved_at: null } : {};
      await supabase
        .from("system_health_errors")
        .update({
          occurrence_count: nextCount,
          last_occurrence_at: now,
          updated_at: now,
          correlation_id: input.correlationId ?? null,
          request_id: input.requestId ?? null,
          context_json: context,
          ...reopen
        })
        .eq("id", existing.id);

      await emitSystemHealthEvent({
        eventType: "system_health.error_occurrence",
        eventCategory: "error",
        severity: input.severity ?? "error",
        module: input.module,
        correlationId: input.correlationId,
        requestId: input.requestId,
        userId: input.userId,
        role: input.role,
        message: serialized.message.slice(0, 400),
        metadata: { fingerprint, errorId: existing.id, occurrenceCount: nextCount }
      });
      return String(existing.id);
    }

    const { data, error } = await supabase
      .from("system_health_errors")
      .insert({
        fingerprint,
        error_type: serialized.type,
        error_message: serialized.message.slice(0, 2000),
        severity: input.severity ?? "error",
        environment: environment(),
        application_module: input.module ?? null,
        page: input.page ?? null,
        endpoint: input.endpoint ?? null,
        user_id: input.userId ?? null,
        role: input.role ?? null,
        browser: input.browser ?? null,
        device: input.device ?? null,
        release_version: releaseVersion(),
        correlation_id: input.correlationId ?? null,
        request_id: input.requestId ?? null,
        stack_trace: serialized.stack ? serialized.stack.slice(0, 8000) : null,
        affected_operation: input.affectedOperation ?? null,
        context_json: context,
        occurrence_count: 1,
        first_occurrence_at: now,
        last_occurrence_at: now,
        status: "unresolved"
      })
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[system-health] capture error failed", error.message);
      return null;
    }

    const id = data?.id ? String(data.id) : null;
    await emitSystemHealthEvent({
      eventType: "system_health.error_captured",
      eventCategory: "error",
      severity: input.severity ?? "error",
      module: input.module,
      correlationId: input.correlationId,
      requestId: input.requestId,
      userId: input.userId,
      role: input.role,
      message: serialized.message.slice(0, 400),
      metadata: { fingerprint, errorId: id }
    });
    return id;
  } catch (error) {
    console.error("[system-health] capture error exception", error);
    return null;
  }
}

export async function updateErrorStatus(params: {
  errorId: string;
  status: "unresolved" | "resolved" | "ignored";
  actorAdminId?: string | null;
  notes?: string | null;
  assignTo?: string | null;
}) {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: params.status,
    updated_at: now
  };
  if (params.notes != null) patch.internal_notes = params.notes;
  if (params.assignTo !== undefined) patch.assigned_to = params.assignTo;
  if (params.status === "resolved") {
    patch.resolved_at = now;
    patch.resolved_by = params.actorAdminId ?? null;
  }
  if (params.status === "unresolved") {
    patch.resolved_at = null;
    patch.resolved_by = null;
  }
  const { error } = await supabase.from("system_health_errors").update(patch).eq("id", params.errorId);
  if (error) throw new Error(error.message);
}
