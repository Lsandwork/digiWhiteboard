import type { SupabaseClient } from "@supabase/supabase-js";
import { getFitdogProvider, normalizeFitdogWebhookPayload } from "@/lib/fitdog-ops/providers";
import { reconcileFitdogSnapshot } from "@/lib/fitdog-ops/reconcile";
import { notifyFitdogPaymentAlert } from "@/lib/fitdog-ops/notifications";
import { buildFitdogIdempotencyKey } from "@/lib/fitdog-ops/idempotency";
import { severityForAlertType } from "@/lib/fitdog-ops/classify";
import {
  autoResolveMatchingAlerts,
  createSyncRun,
  finishSyncRun,
  getFitdogIntegrationSettings,
  insertRawEvent,
  listOpenAlertKeys,
  markRawEventProcessed,
  updateFitdogIntegrationSettings,
  upsertPaymentTransactions,
  upsertProposedAlert,
  upsertServices
} from "@/lib/fitdog-ops/store";
import type { FitdogSyncMode, FitdogSyncRun, FitdogSyncTrigger } from "@/lib/fitdog-ops/types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withBackoff<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await sleep(Math.min(30000, 1000 * 2 ** attempt));
      attempt += 1;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Fitdog sync failed.");
}

export async function runFitdogSync(
  supabase: SupabaseClient,
  options: {
    trigger: FitdogSyncTrigger;
    mode?: FitdogSyncMode;
    actorUserId?: string | null;
    force?: boolean;
  }
): Promise<FitdogSyncRun> {
  const settings = await getFitdogIntegrationSettings(supabase);
  if (!settings.sync_enabled && !options.force && options.trigger !== "manual") {
    const skipped = await createSyncRun(supabase, {
      trigger: options.trigger,
      mode: options.mode || "incremental",
      status: "skipped",
      actor_user_id: options.actorUserId ?? null,
      message: "Fitdog sync disabled."
    });
    return finishSyncRun(supabase, skipped.id, {
      status: "skipped",
      message: "Fitdog sync disabled."
    });
  }

  const mode: FitdogSyncMode =
    options.mode ||
    (options.trigger === "backfill"
      ? "backfill"
      : options.trigger === "reconciliation"
        ? "reconciliation"
        : "incremental");

  const run = await createSyncRun(supabase, {
    trigger: options.trigger,
    mode,
    status: "running",
    actor_user_id: options.actorUserId ?? null,
    checkpoint: settings.cursor || {}
  });

  try {
    const days =
      mode === "backfill"
        ? settings.backfill_days
        : mode === "reconciliation"
          ? settings.reconciliation_days
          : Math.max(1, Math.ceil(settings.incremental_interval_minutes / (24 * 60)) || 2);

    const since =
      mode === "incremental" && settings.last_successful_sync_at
        ? settings.last_successful_sync_at
        : new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const provider = getFitdogProvider(settings.integration_mode);
    const snapshot = await withBackoff(() =>
      provider.sync({
        mode,
        since,
        days,
        checkpoint: settings.cursor,
        encryptedSession: settings.encrypted_session
      })
    );

    if (snapshot.payments?.length) await upsertPaymentTransactions(supabase, snapshot.payments);
    if (snapshot.services?.length) await upsertServices(supabase, snapshot.services);

    for (const failure of snapshot.parse_failures || []) {
      await insertRawEvent(supabase, {
        ingestion_method: settings.integration_mode === "api" ? "api" : "playwright",
        event_type: "parse_failure",
        source_event_id: null,
        idempotency_key: `fitdog:parse:${Buffer.from(`${failure.source_url || ""}:${failure.error}`).toString("base64url").slice(0, 48)}`,
        payload: failure.sanitized || { error: failure.error },
        parse_error: failure.error
      });
    }

    const existingOpenKeys = await listOpenAlertKeys(supabase);
    const reconciled = reconcileFitdogSnapshot(snapshot, {
      graceMinutes: settings.missed_payment_grace_minutes,
      existingOpenKeys
    });

    let alertsCreated = 0;
    let alertsUpdated = 0;
    for (const proposed of reconciled.createOrUpdate) {
      const result = await upsertProposedAlert(supabase, proposed, {
        userId: options.actorUserId,
        name: "Fitdog Sync"
      });
      if (result.created) {
        alertsCreated += 1;
        await notifyFitdogPaymentAlert(supabase, result.alert, "created");
      } else {
        alertsUpdated += 1;
      }
    }

    const auto = await autoResolveMatchingAlerts(supabase, reconciled.resolveMatches, {
      userId: options.actorUserId,
      name: "Fitdog Sync"
    });
    for (const alert of auto.resolvedAlerts) {
      await notifyFitdogPaymentAlert(supabase, alert, "resolved");
    }

    if (snapshot.authExpired && snapshot.reauthenticated === false) {
      await upsertProposedAlert(
        supabase,
        {
          idempotency_key: buildFitdogIdempotencyKey({
            source_event_id: `sync-auth-${run.id}`,
            alert_type: "FITDOG_SYNC_ERROR",
            amount_due: 0
          }),
          alert_type: "FITDOG_SYNC_ERROR",
          severity: severityForAlertType("FITDOG_SYNC_ERROR"),
          source_event_id: run.id,
          source_record_id: run.id,
          owner_id: null,
          owner_name: "Fitdog Sync",
          dog_id: null,
          dog_name: null,
          reservation_id: null,
          invoice_id: null,
          transaction_id: null,
          service_name: null,
          service_date: null,
          amount_due: 0,
          amount_paid: 0,
          currency: "USD",
          failure_reason: "Fitdog authentication expired.",
          payment_attempt_count: 0,
          payment_method_brand: null,
          payment_method_last_four: null,
          package_credit_check: {},
          source_url: "https://app.fitdog.com/login"
        },
        { userId: options.actorUserId, name: "Fitdog Sync" }
      );
    }

    const settingsPatch: Parameters<typeof updateFitdogIntegrationSettings>[1] = {
      last_successful_sync_at: new Date().toISOString(),
      cursor: snapshot.checkpoint || settings.cursor,
      encrypted_session: snapshot.encryptedSession || settings.encrypted_session
    };
    if (mode === "backfill") settingsPatch.last_backfill_at = new Date().toISOString();
    if (mode === "reconciliation") settingsPatch.last_reconciliation_at = new Date().toISOString();
    await updateFitdogIntegrationSettings(supabase, settingsPatch, options.actorUserId);

    return finishSyncRun(supabase, run.id, {
      status: "completed",
      records_scanned: reconciled.records_scanned || snapshot.records_scanned || 0,
      alerts_created: alertsCreated,
      alerts_updated: alertsUpdated,
      alerts_resolved: auto.resolved,
      error_count: snapshot.parse_failures?.length || 0,
      message: `Sync complete (${mode}).`,
      checkpoint: snapshot.checkpoint || {},
      metadata: {
        authExpired: Boolean(snapshot.authExpired),
        reauthenticated: Boolean(snapshot.reauthenticated),
        provider: provider.mode
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fitdog sync failed.";
    await upsertProposedAlert(
      supabase,
      {
        idempotency_key: buildFitdogIdempotencyKey({
          source_event_id: `sync-error-${run.id}`,
          alert_type: "FITDOG_SYNC_ERROR",
          amount_due: 0
        }),
        alert_type: "FITDOG_SYNC_ERROR",
        severity: severityForAlertType("FITDOG_SYNC_ERROR"),
        source_event_id: run.id,
        source_record_id: run.id,
        owner_id: null,
        owner_name: "Fitdog Sync",
        dog_id: null,
        dog_name: null,
        reservation_id: null,
        invoice_id: null,
        transaction_id: null,
        service_name: null,
        service_date: null,
        amount_due: 0,
        amount_paid: 0,
        currency: "USD",
        failure_reason: message,
        payment_attempt_count: 0,
        payment_method_brand: null,
        payment_method_last_four: null,
        package_credit_check: {},
        source_url: null
      },
      { userId: options.actorUserId, name: "Fitdog Sync" }
    ).catch(() => undefined);

    return finishSyncRun(supabase, run.id, {
      status: /interrupt|abort/i.test(message) ? "interrupted" : "failed",
      error_count: 1,
      error_details: message,
      message
    });
  }
}

export async function ingestFitdogWebhookEvent(
  supabase: SupabaseClient,
  payload: unknown
) {
  const normalized = normalizeFitdogWebhookPayload(payload);
  const idempotency_key = buildFitdogIdempotencyKey({
    source_event_id: normalized.source_event_id || normalized.transaction_id,
    owner_id: normalized.owner_id,
    dog_id: normalized.dog_id,
    reservation_id: normalized.reservation_id,
    invoice_id: normalized.invoice_id,
    alert_type: "PAYMENT_FAILED",
    amount_due: normalized.amount_due
  });

  const raw = await insertRawEvent(supabase, {
    ingestion_method: "webhook",
    event_type: normalized.event_type,
    source_event_id: normalized.source_event_id,
    idempotency_key: `raw:${idempotency_key}`,
    payload
  });

  // Process asynchronously-friendly: do the work now but keep the handler fast for typical payloads.
  const settings = await getFitdogIntegrationSettings(supabase);
  const reconciled = reconcileFitdogSnapshot(
    { events: [normalized], payments: [], services: [], records_scanned: 1 },
    { graceMinutes: settings.missed_payment_grace_minutes, existingOpenKeys: await listOpenAlertKeys(supabase) }
  );

  let created = 0;
  let updated = 0;
  let resolved = 0;
  for (const proposed of reconciled.createOrUpdate) {
    const result = await upsertProposedAlert(supabase, proposed, { name: "Fitdog Webhook" });
    if (result.created) {
      created += 1;
      await notifyFitdogPaymentAlert(supabase, result.alert, "created");
    } else {
      updated += 1;
    }
  }
  const auto = await autoResolveMatchingAlerts(supabase, reconciled.resolveMatches, { name: "Fitdog Webhook" });
  resolved = auto.resolved;
  for (const alert of auto.resolvedAlerts) {
    await notifyFitdogPaymentAlert(supabase, alert, "resolved");
  }

  await markRawEventProcessed(supabase, String((raw as { id: string }).id));
  return { created, updated, resolved, event: normalized };
}
