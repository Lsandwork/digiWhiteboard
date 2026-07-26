import type { SupabaseClient } from "@supabase/supabase-js";
import { OPEN_ALERT_STATUSES, type FitdogIntegrationSettings, type FitdogSyncRun, type OperationsAlert, type OperationsAlertActivity, type OperationsAlertAssignment, type OperationsAlertListFilters, type OperationsAlertStatus, type OperationsAlertSummary } from "@/lib/fitdog-ops/types";
import { normalizeUsdAmount } from "@/lib/fitdog-ops/money";
import { sanitizeFitdogPayload } from "@/lib/fitdog-ops/sanitize";
import type { ProposedAlert } from "@/lib/fitdog-ops/reconcile";
import { alertMatchesSuccessfulPayment } from "@/lib/fitdog-ops/reconcile";
import type { FitdogPaymentTransaction, FitdogServiceRecord } from "@/lib/fitdog-ops/types";
import {
  fitdogBackfillDays,
  fitdogEnvMode,
  fitdogMissedPaymentGraceMinutes,
  fitdogReconciliationDays,
  fitdogSyncEnabled
} from "@/lib/fitdog-ops/config";

type Db = SupabaseClient;

function isMissingRelation(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42P01" || /does not exist|relation/i.test(error?.message ?? "");
}

function mapAlert(row: Record<string, unknown>): OperationsAlert {
  return {
    id: String(row.id),
    source: String(row.source || "fitdog"),
    source_event_id: row.source_event_id != null ? String(row.source_event_id) : null,
    source_record_id: row.source_record_id != null ? String(row.source_record_id) : null,
    idempotency_key: String(row.idempotency_key),
    alert_type: row.alert_type as OperationsAlert["alert_type"],
    severity: row.severity as OperationsAlert["severity"],
    owner_id: row.owner_id != null ? String(row.owner_id) : null,
    owner_name: String(row.owner_name || ""),
    dog_id: row.dog_id != null ? String(row.dog_id) : null,
    dog_name: row.dog_name != null ? String(row.dog_name) : null,
    reservation_id: row.reservation_id != null ? String(row.reservation_id) : null,
    invoice_id: row.invoice_id != null ? String(row.invoice_id) : null,
    transaction_id: row.transaction_id != null ? String(row.transaction_id) : null,
    service_name: row.service_name != null ? String(row.service_name) : null,
    service_date: row.service_date != null ? String(row.service_date) : null,
    amount_due: normalizeUsdAmount(row.amount_due),
    amount_paid: normalizeUsdAmount(row.amount_paid),
    currency: String(row.currency || "USD"),
    failure_reason: row.failure_reason != null ? String(row.failure_reason) : null,
    payment_attempt_count: Number(row.payment_attempt_count || 0),
    payment_method_brand: row.payment_method_brand != null ? String(row.payment_method_brand) : null,
    payment_method_last_four: row.payment_method_last_four != null ? String(row.payment_method_last_four) : null,
    status: row.status as OperationsAlertStatus,
    assigned_user_id: row.assigned_user_id != null ? String(row.assigned_user_id) : null,
    assigned_user_name: row.assigned_user_name != null ? String(row.assigned_user_name) : null,
    detected_at: String(row.detected_at),
    acknowledged_at: row.acknowledged_at != null ? String(row.acknowledged_at) : null,
    resolved_at: row.resolved_at != null ? String(row.resolved_at) : null,
    follow_up_at: row.follow_up_at != null ? String(row.follow_up_at) : null,
    resolution_type: row.resolution_type != null ? String(row.resolution_type) : null,
    resolution_notes: row.resolution_notes != null ? String(row.resolution_notes) : null,
    package_credit_check: (row.package_credit_check as Record<string, unknown>) || {},
    source_url: row.source_url != null ? String(row.source_url) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

export async function getFitdogIntegrationSettings(supabase: Db): Promise<FitdogIntegrationSettings> {
  const { data, error } = await supabase.from("fitdog_integration_settings").select("*").eq("id", "default").maybeSingle();
  if (error && !isMissingRelation(error)) throw error;
  if (!data) {
    return {
      id: "default",
      integration_mode: fitdogEnvMode(),
      sync_enabled: fitdogSyncEnabled(),
      missed_payment_grace_minutes: fitdogMissedPaymentGraceMinutes(),
      backfill_days: fitdogBackfillDays(),
      reconciliation_days: fitdogReconciliationDays(),
      incremental_interval_minutes: 8,
      encrypted_session: {},
      last_successful_sync_at: null,
      last_backfill_at: null,
      last_reconciliation_at: null,
      cursor: {},
      notes: null,
      updated_at: new Date().toISOString(),
      updated_by: null
    };
  }
  return {
    id: String(data.id),
    integration_mode: (data.integration_mode as FitdogIntegrationSettings["integration_mode"]) || fitdogEnvMode(),
    sync_enabled: data.sync_enabled !== false,
    missed_payment_grace_minutes: Number(data.missed_payment_grace_minutes ?? fitdogMissedPaymentGraceMinutes()),
    backfill_days: Number(data.backfill_days ?? fitdogBackfillDays()),
    reconciliation_days: Number(data.reconciliation_days ?? fitdogReconciliationDays()),
    incremental_interval_minutes: Number(data.incremental_interval_minutes ?? 8),
    encrypted_session: (data.encrypted_session as Record<string, unknown>) || {},
    last_successful_sync_at: data.last_successful_sync_at ? String(data.last_successful_sync_at) : null,
    last_backfill_at: data.last_backfill_at ? String(data.last_backfill_at) : null,
    last_reconciliation_at: data.last_reconciliation_at ? String(data.last_reconciliation_at) : null,
    cursor: (data.cursor as Record<string, unknown>) || {},
    notes: data.notes != null ? String(data.notes) : null,
    updated_at: String(data.updated_at),
    updated_by: data.updated_by != null ? String(data.updated_by) : null
  };
}

export async function updateFitdogIntegrationSettings(
  supabase: Db,
  patch: Partial<FitdogIntegrationSettings>,
  actorUserId?: string | null
) {
  const current = await getFitdogIntegrationSettings(supabase);
  const next = {
    id: "default",
    integration_mode: patch.integration_mode ?? current.integration_mode,
    sync_enabled: patch.sync_enabled ?? current.sync_enabled,
    missed_payment_grace_minutes: patch.missed_payment_grace_minutes ?? current.missed_payment_grace_minutes,
    backfill_days: patch.backfill_days ?? current.backfill_days,
    reconciliation_days: patch.reconciliation_days ?? current.reconciliation_days,
    incremental_interval_minutes: patch.incremental_interval_minutes ?? current.incremental_interval_minutes,
    encrypted_session: patch.encrypted_session ?? current.encrypted_session,
    last_successful_sync_at: patch.last_successful_sync_at ?? current.last_successful_sync_at,
    last_backfill_at: patch.last_backfill_at ?? current.last_backfill_at,
    last_reconciliation_at: patch.last_reconciliation_at ?? current.last_reconciliation_at,
    cursor: patch.cursor ?? current.cursor,
    notes: patch.notes ?? current.notes,
    updated_by: actorUserId ?? current.updated_by,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from("fitdog_integration_settings").upsert(next);
  if (error) throw error;
  return getFitdogIntegrationSettings(supabase);
}

export async function createSyncRun(
  supabase: Db,
  input: Partial<FitdogSyncRun> & Pick<FitdogSyncRun, "trigger" | "mode">
): Promise<FitdogSyncRun> {
  const row = {
    trigger: input.trigger,
    mode: input.mode,
    status: input.status || "running",
    actor_user_id: input.actor_user_id ?? null,
    metadata: input.metadata || {},
    checkpoint: input.checkpoint || {},
    retry_count: input.retry_count || 0
  };
  const { data, error } = await supabase.from("fitdog_sync_runs").insert(row).select("*").single();
  if (error) throw error;
  return data as FitdogSyncRun;
}

export async function finishSyncRun(
  supabase: Db,
  id: string,
  patch: Partial<FitdogSyncRun>
) {
  const finished_at = patch.finished_at || new Date().toISOString();
  const { data: existing } = await supabase.from("fitdog_sync_runs").select("started_at").eq("id", id).maybeSingle();
  const started = existing?.started_at ? new Date(String(existing.started_at)).getTime() : Date.now();
  const duration_ms = Math.max(0, Date.now() - started);
  const { data, error } = await supabase
    .from("fitdog_sync_runs")
    .update({ ...patch, finished_at, duration_ms })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as FitdogSyncRun;
}

export async function listSyncRuns(supabase: Db, limit = 25) {
  const { data, error } = await supabase
    .from("fitdog_sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return (data || []) as FitdogSyncRun[];
}

export async function getLatestSuccessfulSync(supabase: Db) {
  const { data, error } = await supabase
    .from("fitdog_sync_runs")
    .select("*")
    .eq("status", "completed")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  return (data as FitdogSyncRun) || null;
}

export async function insertRawEvent(
  supabase: Db,
  input: {
    ingestion_method: "api" | "webhook" | "playwright" | "manual";
    event_type?: string | null;
    source_event_id?: string | null;
    idempotency_key: string;
    payload: unknown;
    parse_error?: string | null;
    screenshot_path?: string | null;
  }
) {
  const sanitized = sanitizeFitdogPayload(input.payload);
  const { data, error } = await supabase
    .from("fitdog_raw_events")
    .upsert(
      {
        source: "fitdog",
        ingestion_method: input.ingestion_method,
        event_type: input.event_type ?? null,
        source_event_id: input.source_event_id ?? null,
        idempotency_key: input.idempotency_key,
        payload: input.payload as Record<string, unknown>,
        sanitized_payload: sanitized as Record<string, unknown>,
        parse_error: input.parse_error ?? null,
        screenshot_path: input.screenshot_path ?? null,
        processed_at: null
      },
      { onConflict: "idempotency_key" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function markRawEventProcessed(supabase: Db, id: string) {
  await supabase.from("fitdog_raw_events").update({ processed_at: new Date().toISOString() }).eq("id", id);
}

export async function upsertPaymentTransactions(supabase: Db, payments: FitdogPaymentTransaction[]) {
  if (!payments.length) return;
  const rows = payments.map((payment) => ({
    fitdog_transaction_id: payment.fitdog_transaction_id,
    fitdog_owner_id: payment.fitdog_owner_id ?? null,
    fitdog_dog_id: payment.fitdog_dog_id ?? null,
    fitdog_reservation_id: payment.fitdog_reservation_id ?? null,
    fitdog_invoice_id: payment.fitdog_invoice_id ?? null,
    status: payment.status,
    amount: normalizeUsdAmount(payment.amount),
    currency: payment.currency || "USD",
    failure_reason: payment.failure_reason ?? null,
    payment_method_brand: payment.payment_method_brand ?? null,
    payment_method_last_four: payment.payment_method_last_four ?? null,
    attempt_number: payment.attempt_number ?? 1,
    attempted_at: payment.attempted_at ?? null,
    succeeded_at: payment.succeeded_at ?? null,
    source_url: payment.source_url ?? null,
    raw: sanitizeFitdogPayload(payment.raw || payment) as Record<string, unknown>
  }));
  const { error } = await supabase.from("fitdog_payment_transactions").upsert(rows, {
    onConflict: "fitdog_transaction_id"
  });
  if (error) throw error;
}

export async function upsertServices(supabase: Db, services: FitdogServiceRecord[]) {
  if (!services.length) return;
  const rows = services.map((service) => ({
    fitdog_service_id: service.fitdog_service_id,
    fitdog_reservation_id: service.fitdog_reservation_id ?? null,
    fitdog_owner_id: service.fitdog_owner_id ?? null,
    fitdog_dog_id: service.fitdog_dog_id ?? null,
    service_name: service.service_name,
    service_date: service.service_date ?? null,
    completed_at: service.completed_at ?? null,
    attended: Boolean(service.attended),
    amount_due: normalizeUsdAmount(service.amount_due),
    currency: service.currency || "USD",
    covered_by_package: Boolean(service.covered_by_package),
    covered_by_credit: Boolean(service.covered_by_credit),
    complimentary: Boolean(service.complimentary),
    discounted: Boolean(service.discounted),
    waived: Boolean(service.waived),
    adjustment_notes: service.adjustment_notes ?? null,
    source_url: service.source_url ?? null,
    raw: sanitizeFitdogPayload(service.raw || service) as Record<string, unknown>
  }));
  const { error } = await supabase.from("fitdog_services").upsert(rows, { onConflict: "fitdog_service_id" });
  if (error) throw error;
}

export async function addAlertActivity(
  supabase: Db,
  input: {
    alert_id: string;
    activity_type: string;
    message: string;
    metadata?: Record<string, unknown>;
    actor_user_id?: string | null;
    actor_name?: string | null;
  }
) {
  const { data, error } = await supabase
    .from("operations_alert_activity")
    .insert({
      alert_id: input.alert_id,
      activity_type: input.activity_type,
      message: input.message,
      metadata: input.metadata || {},
      actor_user_id: input.actor_user_id ?? null,
      actor_name: input.actor_name ?? null
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as OperationsAlertActivity;
}

export async function upsertProposedAlert(
  supabase: Db,
  proposed: ProposedAlert,
  actor?: { userId?: string | null; name?: string | null }
): Promise<{ alert: OperationsAlert; created: boolean }> {
  const { data: existing } = await supabase
    .from("operations_alerts")
    .select("*")
    .eq("idempotency_key", proposed.idempotency_key)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("operations_alerts")
      .update({
        failure_reason: proposed.failure_reason,
        payment_attempt_count: Math.max(Number(existing.payment_attempt_count || 0), proposed.payment_attempt_count),
        amount_due: proposed.amount_due,
        amount_paid: proposed.amount_paid,
        payment_method_brand: proposed.payment_method_brand,
        payment_method_last_four: proposed.payment_method_last_four,
        package_credit_check: proposed.package_credit_check,
        source_url: proposed.source_url,
        severity: proposed.alert_type === "CARD_DECLINED" ? "critical" : proposed.severity,
        updated_at: new Date().toISOString()
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    await addAlertActivity(supabase, {
      alert_id: String(existing.id),
      activity_type: "updated",
      message: "Alert updated from Fitdog sync.",
      actor_user_id: actor?.userId,
      actor_name: actor?.name || "Fitdog Sync"
    });
    return { alert: mapAlert(data as Record<string, unknown>), created: false };
  }

  const { data, error } = await supabase
    .from("operations_alerts")
    .insert({
      source: "fitdog",
      source_event_id: proposed.source_event_id,
      source_record_id: proposed.source_record_id,
      idempotency_key: proposed.idempotency_key,
      alert_type: proposed.alert_type,
      severity: proposed.alert_type === "CARD_DECLINED" ? "critical" : proposed.severity,
      owner_id: proposed.owner_id,
      owner_name: proposed.owner_name,
      dog_id: proposed.dog_id,
      dog_name: proposed.dog_name,
      reservation_id: proposed.reservation_id,
      invoice_id: proposed.invoice_id,
      transaction_id: proposed.transaction_id,
      service_name: proposed.service_name,
      service_date: proposed.service_date,
      amount_due: proposed.amount_due,
      amount_paid: proposed.amount_paid,
      currency: proposed.currency,
      failure_reason: proposed.failure_reason,
      payment_attempt_count: proposed.payment_attempt_count,
      payment_method_brand: proposed.payment_method_brand,
      payment_method_last_four: proposed.payment_method_last_four,
      status: "new",
      package_credit_check: proposed.package_credit_check,
      source_url: proposed.source_url,
      detected_at: proposed.detected_at || new Date().toISOString()
    })
    .select("*")
    .single();
  if (error) throw error;
  const alert = mapAlert(data as Record<string, unknown>);
  await addAlertActivity(supabase, {
    alert_id: alert.id,
    activity_type: "created",
    message: `Alert created (${proposed.alert_type}).`,
    actor_user_id: actor?.userId,
    actor_name: actor?.name || "Fitdog Sync"
  });
  return { alert, created: true };
}

export async function listOpenAlertKeys(supabase: Db) {
  const { data, error } = await supabase
    .from("operations_alerts")
    .select("idempotency_key,status")
    .in("status", OPEN_ALERT_STATUSES);
  if (error) {
    if (isMissingRelation(error)) return new Set<string>();
    throw error;
  }
  return new Set((data || []).map((row) => String(row.idempotency_key)));
}

export async function listOpenAlerts(supabase: Db) {
  const { data, error } = await supabase
    .from("operations_alerts")
    .select("*")
    .in("status", OPEN_ALERT_STATUSES);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return (data || []).map((row) => mapAlert(row as Record<string, unknown>));
}

export async function resolveAlertFromPayment(
  supabase: Db,
  alert: OperationsAlert,
  transaction: FitdogPaymentTransaction,
  actor?: { userId?: string | null; name?: string | null }
) {
  const { data, error } = await supabase
    .from("operations_alerts")
    .update({
      // Keep original alert_type (e.g. CARD_DECLINED) so Past Alerts can still group Declined Payments.
      status: "paid",
      amount_paid: normalizeUsdAmount(transaction.amount),
      transaction_id: transaction.fitdog_transaction_id,
      resolved_at: new Date().toISOString(),
      resolution_type: "automatic_payment",
      resolution_notes: "Automatically resolved after successful Fitdog payment.",
      severity: "low",
      updated_at: new Date().toISOString()
    })
    .eq("id", alert.id)
    .select("*")
    .single();
  if (error) throw error;
  await addAlertActivity(supabase, {
    alert_id: alert.id,
    activity_type: "automatic_resolution",
    message: `Resolved by successful payment ${transaction.fitdog_transaction_id}.`,
    metadata: { transaction_id: transaction.fitdog_transaction_id },
    actor_user_id: actor?.userId,
    actor_name: actor?.name || "Fitdog Sync"
  });
  return mapAlert(data as Record<string, unknown>);
}

export async function autoResolveMatchingAlerts(
  supabase: Db,
  matches: Array<{ transaction: FitdogPaymentTransaction; match: ProposedAlert["auto_resolve_match"] }>,
  actor?: { userId?: string | null; name?: string | null }
) {
  const open = await listOpenAlerts(supabase);
  let resolved = 0;
  const resolvedAlerts: OperationsAlert[] = [];
  for (const item of matches) {
    for (const alert of open) {
      if (!alertMatchesSuccessfulPayment(alert, item.match)) continue;
      const next = await resolveAlertFromPayment(supabase, alert, item.transaction, actor);
      resolved += 1;
      resolvedAlerts.push(next);
    }
  }
  return { resolved, resolvedAlerts };
}

export async function getOperationsAlertSummary(supabase: Db): Promise<OperationsAlertSummary> {
  const settings = await getFitdogIntegrationSettings(supabase);
  const { data, error } = await supabase.from("operations_alerts").select("alert_type,status,amount_due,resolved_at,acknowledged_at,detected_at");
  if (error) {
    if (isMissingRelation(error)) {
      return {
        new_alerts: 0,
        failed_payments: 0,
        missed_payments: 0,
        card_declined: 0,
        other_notifications: 0,
        outstanding_amount: 0,
        resolved_today: 0,
        unacknowledged: 0,
        last_successful_sync_at: settings.last_successful_sync_at
      };
    }
    throw error;
  }

  const rows = data || [];
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const open = rows.filter((row) => OPEN_ALERT_STATUSES.includes(row.status as OperationsAlertStatus));

  return {
    new_alerts: open.filter((row) => row.status === "new").length,
    failed_payments: open.filter((row) =>
      ["PAYMENT_FAILED", "CARD_DECLINED", "PAYMENT_PROCESSING_ERROR", "PAYMENT_RETRY_FAILED"].includes(String(row.alert_type))
    ).length,
    missed_payments: open.filter((row) => row.alert_type === "PAYMENT_MISSED").length,
    card_declined: open.filter((row) => row.alert_type === "CARD_DECLINED").length,
    other_notifications: open.filter((row) => row.alert_type === "FITDOG_NOTIFICATION").length,
    outstanding_amount: open.reduce((sum, row) => sum + normalizeUsdAmount(row.amount_due), 0),
    resolved_today: rows.filter((row) => row.resolved_at && new Date(String(row.resolved_at)) >= startOfDay).length,
    unacknowledged: open.filter((row) => !row.acknowledged_at && row.status === "new").length,
    last_successful_sync_at: settings.last_successful_sync_at
  };
}

export async function listOperationsAlerts(supabase: Db, filters: OperationsAlertListFilters = {}) {
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize || 50));
  let query = supabase.from("operations_alerts").select("*", { count: "exact" });

  const view = filters.view || "payment";
  if (view === "payment") {
    query = query
      .in("alert_type", [
        "PAYMENT_FAILED",
        "PAYMENT_MISSED",
        "CARD_DECLINED",
        "CARD_EXPIRED",
        "CARD_MISSING",
        "PAYMENT_PROCESSING_ERROR",
        "PAYMENT_RETRY_FAILED",
        "OUTSTANDING_BALANCE",
        "FITDOG_NOTIFICATION"
      ])
      .in("status", OPEN_ALERT_STATUSES);
  } else if (view === "card_declined") {
    query = query.eq("alert_type", "CARD_DECLINED").in("status", OPEN_ALERT_STATUSES);
  } else if (view === "other") {
    query = query.neq("alert_type", "CARD_DECLINED").in("status", OPEN_ALERT_STATUSES);
  } else if (view === "resolved") {
    query = query.in("status", ["paid", "waived", "false_positive", "resolved"]);
  }

  if (filters.alertType && filters.alertType !== "all") query = query.eq("alert_type", filters.alertType);
  // On the Past Alerts (resolved) view, ignore open-status filters so history still loads.
  if (filters.status && filters.status !== "all") {
    if (view === "resolved" && OPEN_ALERT_STATUSES.includes(filters.status as OperationsAlertStatus)) {
      // keep resolved statuses only
    } else {
      query = query.eq("status", filters.status);
    }
  }
  if (filters.assignedUserId === "unassigned" || filters.unassignedOnly) query = query.is("assigned_user_id", null);
  else if (filters.assignedUserId && filters.assignedUserId !== "all") query = query.eq("assigned_user_id", filters.assignedUserId);
  if (filters.dateFrom) query = query.gte("detected_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("detected_at", filters.dateTo);
  if (filters.minAmount != null && Number.isFinite(filters.minAmount)) query = query.gte("amount_due", filters.minAmount);
  if (filters.owner) query = query.ilike("owner_name", `%${filters.owner}%`);
  if (filters.dog) query = query.ilike("dog_name", `%${filters.dog}%`);
  if (filters.service) query = query.ilike("service_name", `%${filters.service}%`);
  if (filters.q) {
    const q = filters.q.trim();
    query = query.or(
      `owner_name.ilike.%${q}%,dog_name.ilike.%${q}%,service_name.ilike.%${q}%,failure_reason.ilike.%${q}%,invoice_id.ilike.%${q}%`
    );
  }

  const sortBy =
    filters.sortBy ||
    (view === "resolved" ? "resolved_at" : "detected_at");
  const ascending = filters.sortDir === "asc";
  // Prefer critical unresolved first via client re-sort after fetch of page window.
  query = query
    .order(sortBy, { ascending, nullsFirst: false })
    .order("detected_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    if (isMissingRelation(error)) return { rows: [] as OperationsAlert[], total: 0, page, pageSize };
    throw error;
  }

  const severityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const rows = (data || [])
    .map((row) => mapAlert(row as Record<string, unknown>))
    .sort((a, b) => {
      const openA = OPEN_ALERT_STATUSES.includes(a.status) ? 0 : 1;
      const openB = OPEN_ALERT_STATUSES.includes(b.status) ? 0 : 1;
      if (openA !== openB) return openA - openB;
      const sev = (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9);
      if (sev !== 0) return sev;
      return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
    });

  return { rows, total: count || rows.length, page, pageSize };
}

export async function getOperationsAlert(supabase: Db, id: string) {
  const { data, error } = await supabase.from("operations_alerts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const alert = mapAlert(data as Record<string, unknown>);
  const [{ data: activity }, { data: assignments }, { data: payments }] = await Promise.all([
    supabase.from("operations_alert_activity").select("*").eq("alert_id", id).order("created_at", { ascending: false }),
    supabase.from("operations_alert_assignments").select("*").eq("alert_id", id).order("created_at", { ascending: false }),
    alert.owner_id
      ? supabase
          .from("fitdog_payment_transactions")
          .select("*")
          .eq("fitdog_owner_id", alert.owner_id)
          .order("attempted_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as unknown[] })
  ]);
  return {
    alert,
    activity: (activity || []) as OperationsAlertActivity[],
    assignments: (assignments || []) as OperationsAlertAssignment[],
    payments: payments || []
  };
}

export async function updateOperationsAlert(
  supabase: Db,
  id: string,
  patch: Partial<OperationsAlert>,
  activity: { type: string; message: string; actor_user_id?: string | null; actor_name?: string | null; metadata?: Record<string, unknown> }
) {
  const { data, error } = await supabase
    .from("operations_alerts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  await addAlertActivity(supabase, {
    alert_id: id,
    activity_type: activity.type,
    message: activity.message,
    metadata: activity.metadata,
    actor_user_id: activity.actor_user_id,
    actor_name: activity.actor_name
  });
  return mapAlert(data as Record<string, unknown>);
}

export async function assignOperationsAlert(
  supabase: Db,
  input: {
    alert_id: string;
    assigned_user_id: string | null;
    assigned_user_name: string | null;
    assigned_by_user_id?: string | null;
    assigned_by_name?: string | null;
    note?: string | null;
  }
) {
  await supabase.from("operations_alert_assignments").insert({
    alert_id: input.alert_id,
    assigned_user_id: input.assigned_user_id,
    assigned_user_name: input.assigned_user_name,
    assigned_by_user_id: input.assigned_by_user_id ?? null,
    assigned_by_name: input.assigned_by_name ?? null,
    note: input.note ?? null
  });
  return updateOperationsAlert(
    supabase,
    input.alert_id,
    {
      assigned_user_id: input.assigned_user_id,
      assigned_user_name: input.assigned_user_name,
      status: input.assigned_user_id ? "assigned" : "new"
    },
    {
      type: "assignment",
      message: input.assigned_user_name ? `Assigned to ${input.assigned_user_name}.` : "Unassigned.",
      actor_user_id: input.assigned_by_user_id,
      actor_name: input.assigned_by_name
    }
  );
}

export async function countUnacknowledgedPaymentAlerts(supabase: Db) {
  const { count, error } = await supabase
    .from("operations_alerts")
    .select("id", { count: "exact", head: true })
    .eq("status", "new")
    .in("alert_type", [
      "PAYMENT_FAILED",
      "PAYMENT_MISSED",
      "CARD_DECLINED",
      "CARD_EXPIRED",
      "CARD_MISSING",
      "PAYMENT_PROCESSING_ERROR",
      "PAYMENT_RETRY_FAILED",
      "OUTSTANDING_BALANCE"
    ]);
  if (error) {
    if (isMissingRelation(error)) return 0;
    throw error;
  }
  return count || 0;
}
