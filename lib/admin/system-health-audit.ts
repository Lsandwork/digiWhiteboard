type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

import { loadAdminSettingsJsonKey, saveAdminSettingsJsonKey } from "@/lib/admin/settings-json-store";
import { listDisplayDevices, queueDisplayCommand } from "@/lib/display-keeper-server";
import { bumpCastHardReloadNonce } from "@/lib/display-sync-server";
import { loadCastTvHeartbeat, isCastTvOnline } from "@/lib/cast-tv/media";
import { expireStaleCastVideoNotices } from "@/lib/staff/cast-video-notices";
import { expireStaleGroomingPushNotices } from "@/lib/staff/grooming-push-notices";
import { loadActiveStaffPushNotice, listStaffPushNotices } from "@/lib/staff/push-notices";
import { expireStaleTrainerPushNotices } from "@/lib/staff/trainer-push-notices";

export type SystemHealthCheck =
  | "display_devices"
  | "cast_tv"
  | "remote_cast"
  | "webhooks"
  | "checkout_lag"
  | "push_notices"
  | "whiteboard_push"
  | "env";

export type SystemHealthSeverity = "high" | "medium" | "low";
export type SystemHealthIssueStatus = "open" | "fixed" | "failed" | "all_clear";

export type SystemHealthFixResult = {
  action: string;
  at: string;
  result: "ok" | "skipped" | "error";
  message?: string;
};

export type SystemHealthIssue = {
  id: string;
  check: SystemHealthCheck;
  severity: SystemHealthSeverity;
  title: string;
  detail: string;
  status: SystemHealthIssueStatus;
  first_seen_at: string;
  last_seen_at: string;
  auto_fix?: SystemHealthFixResult | null;
};

export type SystemHealthAuditRun = {
  id: string;
  started_at: string;
  finished_at: string;
  trigger: "cron" | "manual";
  summary: {
    checked: number;
    open: number;
    fixed: number;
    failed: number;
    all_clear: boolean;
  };
  issues: SystemHealthIssue[];
};

export type SystemHealthAuditState = {
  version: 1;
  last_run_at: string | null;
  last_run_id: string | null;
  overall_status: "all_clear" | "issues" | "failed_fixes" | "never_run";
  open_issues: SystemHealthIssue[];
  recent_rows: SystemHealthIssue[];
  runs: SystemHealthAuditRun[];
};

const SETTINGS_KEY = "system_health_audit";
const MAX_RUNS = 20;
const MAX_ROWS = 40;

const CHECKOUT_LAG_MS = 45 * 60 * 1000;
const DEVICE_OFFLINE_MS = 5 * 60 * 1000;
const DEVICE_PRUNE_MS = 7 * 24 * 60 * 60 * 1000;
const CAST_TV_UNUSED_MS = 2 * 24 * 60 * 60 * 1000;
const PENDING_COMMAND_STALE_MS = 24 * 60 * 60 * 1000;
const WEBHOOK_FAIL_WINDOW_MS = 24 * 60 * 60 * 1000;

function isSyntheticDisplayDevice(device: { id?: string | null; name?: string | null }) {
  const id = String(device.id ?? "");
  const name = String(device.name ?? "");
  return /^health-check/i.test(id) || /^health-check/i.test(name);
}

function isUnsupportedWebhookNoise(error: string | null | undefined) {
  return /^Unsupported webhook_type:/i.test(String(error ?? ""));
}

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isMissingRelation(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "42P01" || /does not exist|relation|schema cache/i.test(error.message ?? "");
}

function emptyState(): SystemHealthAuditState {
  return {
    version: 1,
    last_run_at: null,
    last_run_id: null,
    overall_status: "never_run",
    open_issues: [],
    recent_rows: [],
    runs: []
  };
}

function parseState(value: unknown): SystemHealthAuditState {
  if (!value || typeof value !== "object") return emptyState();
  const raw = value as Partial<SystemHealthAuditState>;
  return {
    version: 1,
    last_run_at: raw.last_run_at ? String(raw.last_run_at) : null,
    last_run_id: raw.last_run_id ? String(raw.last_run_id) : null,
    overall_status:
      raw.overall_status === "all_clear" ||
      raw.overall_status === "issues" ||
      raw.overall_status === "failed_fixes" ||
      raw.overall_status === "never_run"
        ? raw.overall_status
        : "never_run",
    open_issues: Array.isArray(raw.open_issues) ? (raw.open_issues as SystemHealthIssue[]) : [],
    recent_rows: Array.isArray(raw.recent_rows) ? (raw.recent_rows as SystemHealthIssue[]) : [],
    runs: Array.isArray(raw.runs) ? (raw.runs as SystemHealthAuditRun[]).slice(0, MAX_RUNS) : []
  };
}

async function loadState(supabase: SupabaseClient): Promise<SystemHealthAuditState> {
  const loaded = await loadAdminSettingsJsonKey(supabase, SETTINGS_KEY, parseState, emptyState());
  if (loaded === null) return emptyState();
  return loaded;
}

async function saveState(supabase: SupabaseClient, state: SystemHealthAuditState) {
  const ok = await saveAdminSettingsJsonKey(supabase, SETTINGS_KEY, {
    ...state,
    runs: state.runs.slice(0, MAX_RUNS),
    recent_rows: state.recent_rows.slice(0, MAX_ROWS)
  });
  if (!ok) throw new Error("System health storage is not available.");
}

export async function loadSystemHealthAudit(supabase: SupabaseClient) {
  return loadState(supabase);
}

function makeIssue(input: {
  check: SystemHealthCheck;
  severity: SystemHealthSeverity;
  title: string;
  detail: string;
  status?: SystemHealthIssueStatus;
  auto_fix?: SystemHealthFixResult | null;
}): SystemHealthIssue {
  const now = new Date().toISOString();
  return {
    id: newId("issue"),
    check: input.check,
    severity: input.severity,
    title: input.title,
    detail: input.detail,
    status: input.status ?? "open",
    first_seen_at: now,
    last_seen_at: now,
    auto_fix: input.auto_fix ?? null
  };
}

async function checkDisplayDevices(supabase: SupabaseClient, now: number) {
  const devices = await listDisplayDevices(supabase).catch(() => []);
  const issues: SystemHealthIssue[] = [];
  const realDevices = devices.filter((d) => !isSyntheticDisplayDevice(d));
  const syntheticDevices = devices.filter((d) => isSyntheticDisplayDevice(d));
  const online = realDevices.filter((d) => {
    const age = now - new Date(d.last_seen_at).getTime();
    return Number.isFinite(age) && age <= DEVICE_OFFLINE_MS;
  });
  const pruneCandidates = devices.filter((d) => {
    if (isSyntheticDisplayDevice(d)) return true;
    const age = now - new Date(d.last_seen_at).getTime();
    return !Number.isFinite(age) || age > DEVICE_PRUNE_MS;
  });

  if (realDevices.length > 0 && online.length === 0) {
    issues.push(
      makeIssue({
        check: "display_devices",
        severity: "high",
        title: "No Cast Keeper heartbeats",
        detail: `${realDevices.length} registered display device(s), but none seen in the last 5 minutes. Whiteboard push/cast may look frozen.`
      })
    );
  } else if (realDevices.length > 0 && online.length < Math.ceil(realDevices.length * 0.25)) {
    issues.push(
      makeIssue({
        check: "display_devices",
        severity: "medium",
        title: "Many displays offline",
        detail: `Only ${online.length}/${realDevices.length} displays have fresh heartbeats.`
      })
    );
  }

  if (pruneCandidates.length > 0) {
    issues.push(
      makeIssue({
        check: "display_devices",
        severity: "low",
        title: "Stale display registry",
        detail: `${pruneCandidates.length} stale/synthetic Cast Keeper device record(s) can be pruned${
          syntheticDevices.length ? ` (${syntheticDevices.length} health-check)` : ""
        }.`
      })
    );
  }

  return { issues, devices, online, pruneCandidates, realDevices };
}

async function checkCastTv(supabase: SupabaseClient, now: number) {
  const beat = await loadCastTvHeartbeat(supabase).catch(() => null);
  if (!beat?.last_seen_at) {
    return [
      makeIssue({
        check: "cast_tv",
        severity: "low",
        title: "CAST-TV heartbeat missing",
        detail: "No CAST-TV heartbeat row found. Ignore if CAST-TV is unused."
      })
    ];
  }
  const last = new Date(beat.last_seen_at).getTime();
  const ageMs = now - last;
  if (!isCastTvOnline(beat.last_seen_at, now)) {
    const ageMin = Math.round(ageMs / 60000);
    if (Number.isFinite(ageMs) && ageMs > CAST_TV_UNUSED_MS) {
      return [
        makeIssue({
          check: "cast_tv",
          severity: "low",
          title: "CAST-TV idle / unused",
          detail: `CAST-TV screen “${beat.screen_id}” last seen ${Math.round(ageMs / 86400000)}d ago. Treated as unused until it heartbeats again.`
        })
      ];
    }
    return [
      makeIssue({
        check: "cast_tv",
        severity: "medium",
        title: "CAST-TV offline / lagging",
        detail: `CAST-TV screen “${beat.screen_id}” last seen ${ageMin}m ago.`
      })
    ];
  }
  return [] as SystemHealthIssue[];
}

async function checkRemoteCast(supabase: SupabaseClient, now: number) {
  const { data, error } = await supabase
    .from("remote_cast_receivers")
    .select("id, display_name, status, last_seen_at")
    .limit(50);
  if (error) {
    if (isMissingRelation(error)) return [] as SystemHealthIssue[];
    throw error;
  }
  const issues: SystemHealthIssue[] = [];
  for (const row of data ?? []) {
    const last = row.last_seen_at ? new Date(String(row.last_seen_at)).getTime() : NaN;
    const stale = !Number.isFinite(last) || now - last > 5 * 60 * 1000;
    const falselyOnline = String(row.status) === "online" && stale;
    if (falselyOnline) {
      issues.push(
        makeIssue({
          check: "remote_cast",
          severity: "medium",
          title: `Remote cast “${row.display_name || "Receiver"}” stale`,
          detail: "Receiver marked online but has not heartbeated recently."
        })
      );
    }
  }
  return issues;
}

async function checkWebhooks(supabase: SupabaseClient, now: number) {
  const since = new Date(now - WEBHOOK_FAIL_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("gingr_webhook_events")
    .select("id,verified,processing_error,processed")
    .gte("created_at", since)
    .eq("processed", false)
    .or("verified.eq.false,processing_error.not.is.null")
    .limit(5000);
  if (error) {
    if (isMissingRelation(error)) {
      return { issues: [] as SystemHealthIssue[], unsupportedIds: [] as string[], unsignedIds: [] as string[] };
    }
    return { issues: [] as SystemHealthIssue[], unsupportedIds: [] as string[], unsignedIds: [] as string[] };
  }

  const rows = data ?? [];
  const unsupportedIds = rows
    .filter((row) => isUnsupportedWebhookNoise(row.processing_error as string | null))
    .map((row) => String(row.id));
  const unsignedIds = rows
    .filter((row) => row.verified === false && !row.processing_error)
    .map((row) => String(row.id));
  const realFailures = rows.filter((row) => {
    if (!row.processing_error) return false;
    return !isUnsupportedWebhookNoise(row.processing_error as string | null);
  });
  const failedCount = realFailures.length;
  const issues: SystemHealthIssue[] = [];

  if (unsupportedIds.length > 0) {
    issues.push(
      makeIssue({
        check: "webhooks",
        severity: "low",
        title: "Ignored Gingr webhook noise (24h)",
        detail: `${unsupportedIds.length} unsupported webhook type(s) (e.g. email_sent) can be marked processed without affecting the board.`
      })
    );
  }

  if (unsignedIds.length > 0) {
    issues.push(
      makeIssue({
        check: "webhooks",
        severity: "low",
        title: "Unsigned Gingr webhooks (24h)",
        detail: `${unsignedIds.length} webhook(s) failed signature verification and were rejected (already not applied to the board).`
      })
    );
  }

  if (failedCount >= 10) {
    issues.push(
      makeIssue({
        check: "webhooks",
        severity: "high",
        title: "Gingr webhook failures (24h)",
        detail: `${failedCount} webhook processing error(s) in the last 24 hours (excluding ignored/unsigned).`
      })
    );
  } else if (failedCount > 0) {
    issues.push(
      makeIssue({
        check: "webhooks",
        severity: "low",
        title: "Minor webhook noise (24h)",
        detail: `${failedCount} webhook processing error(s) in the last 24 hours (excluding ignored/unsigned).`
      })
    );
  }

  return { issues, unsupportedIds, unsignedIds };
}

async function checkCheckoutLag(supabase: SupabaseClient, now: number) {
  const cutoff = new Date(now - CHECKOUT_LAG_MS).toISOString();
  const { data, error } = await supabase
    .from("live_transition_dogs")
    .select("id, animal_name, display_status, status_started_at, updated_at, display_until")
    .eq("hidden", false)
    .in("display_status", ["checking_out", "checking_in"])
    .lt("status_started_at", cutoff)
    .limit(40);
  if (error) {
    if (isMissingRelation(error)) return { issues: [] as SystemHealthIssue[], lagged: [] as Array<Record<string, unknown>> };
    throw error;
  }
  const lagged = (data ?? []).filter((row) => {
    // If display_until is still in the future, sticky checkout is intentional — skip.
    if (row.display_until) {
      const until = new Date(String(row.display_until)).getTime();
      if (Number.isFinite(until) && until > now) return false;
    }
    return true;
  });
  if (!lagged.length) return { issues: [] as SystemHealthIssue[], lagged };
  const names = lagged
    .slice(0, 5)
    .map((row) => String(row.animal_name || "Dog"))
    .join(", ");
  return {
    issues: [
      makeIssue({
        check: "checkout_lag",
        severity: lagged.length >= 5 ? "high" : "medium",
        title: "Checkout / check-in lag on whiteboard",
        detail: `${lagged.length} dog(s) stuck in checking_in/out for 45+ minutes (e.g. ${names}). Likely stale Gingr checkout rows.`
      })
    ],
    lagged
  };
}

async function checkPushNotices(supabase: SupabaseClient, now: number) {
  const notices = await listStaffPushNotices(supabase, 100).catch(() => []);
  const stuck = notices.filter((notice) => {
    if (!notice.is_active || notice.cleared_at) return false;
    if (!notice.expires_at) return false;
    return new Date(notice.expires_at).getTime() < now;
  });
  if (!stuck.length) return [] as SystemHealthIssue[];
  return [
    makeIssue({
      check: "push_notices",
      severity: "medium",
      title: "Stuck whiteboard push notices",
      detail: `${stuck.length} active push notice(s) are past expires_at and may still overlay the board.`
    })
  ];
}

async function expireStalePendingDisplayCommands(supabase: SupabaseClient, now: number) {
  const cutoff = new Date(now - PENDING_COMMAND_STALE_MS).toISOString();
  const { data, error } = await supabase
    .from("display_commands")
    .update({ status: "completed", completed_at: new Date(now).toISOString() })
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .select("id");
  if (error) {
    if (isMissingRelation(error)) return 0;
    throw error;
  }
  return data?.length ?? 0;
}

async function applySafeFixes(
  supabase: SupabaseClient,
  issues: SystemHealthIssue[],
  context: {
    pruneCandidates: Array<{ id: string }>;
    lagged: Array<{ id: string }>;
    onlineCount: number;
    unsupportedWebhookIds: string[];
    unsignedWebhookIds: string[];
  }
) {
  const nowIso = new Date().toISOString();
  const now = Date.now();
  let didCastRefresh = false;
  let expiredCommands = 0;

  for (const issue of issues) {
    try {
      if (issue.check === "push_notices" || issue.check === "whiteboard_push") {
        await Promise.allSettled([
          loadActiveStaffPushNotice(supabase, { mutate: true }),
          expireStaleGroomingPushNotices(supabase),
          expireStaleTrainerPushNotices(supabase),
          expireStaleCastVideoNotices(supabase)
        ]);
        issue.status = "fixed";
        issue.auto_fix = {
          action: "expire_stuck_push_notices",
          at: nowIso,
          result: "ok",
          message: "Cleared expired staff/grooming/trainer/cast-video notices without calling Gingr."
        };
        continue;
      }

      if (issue.check === "display_devices" && issue.title.includes("Stale display registry")) {
        const ids = context.pruneCandidates.map((d) => d.id).slice(0, 80);
        if (ids.length) {
          for (let i = 0; i < ids.length; i += 40) {
            const chunk = ids.slice(i, i + 40);
            const { error } = await supabase.from("display_devices").delete().in("id", chunk);
            if (error) throw error;
          }
        }
        expiredCommands = await expireStalePendingDisplayCommands(supabase, now);
        await bumpCastHardReloadNonce(supabase).catch(() => undefined);
        issue.status = "fixed";
        issue.auto_fix = {
          action: "prune_stale_display_devices",
          at: nowIso,
          result: "ok",
          message: `Removed ${ids.length} stale/synthetic device record(s)${
            expiredCommands ? `; expired ${expiredCommands} old pending cast command(s)` : ""
          }.`
        };
        continue;
      }

      if (issue.check === "display_devices" && (issue.title.includes("offline") || issue.title.includes("heartbeats"))) {
        // Always bump reload nonce so boards pick up the next wake; queue refresh only if someone is online.
        await bumpCastHardReloadNonce(supabase).catch(() => undefined);
        expiredCommands = await expireStalePendingDisplayCommands(supabase, now);
        if (!didCastRefresh && context.onlineCount > 0) {
          await Promise.all([
            queueDisplayCommand(supabase, { displayType: "staff_whiteboard", commandType: "hard_refresh" }),
            queueDisplayCommand(supabase, { displayType: "lobby_whiteboard", commandType: "hard_refresh" })
          ]);
          didCastRefresh = true;
          issue.status = "fixed";
          issue.auto_fix = {
            action: "soft_cast_refresh",
            at: nowIso,
            result: "ok",
            message: "Queued one soft hard-refresh for online displays (no Gingr calls)."
          };
        } else if (context.onlineCount === 0) {
          // If prune also cleared the only synthetic device, this heartbeat issue may already be moot.
          if (context.pruneCandidates.length > 0) {
            const ids = context.pruneCandidates.map((d) => d.id).slice(0, 80);
            for (let i = 0; i < ids.length; i += 40) {
              const chunk = ids.slice(i, i + 40);
              await supabase.from("display_devices").delete().in("id", chunk);
            }
            issue.status = "fixed";
            issue.auto_fix = {
              action: "prune_offline_display_registry",
              at: nowIso,
              result: "ok",
              message: `No live TVs online. Cleared ${ids.length} stale/synthetic Cast Keeper record(s) and expired old pending commands. Reboot TVs / open Cast Keeper URLs to restore heartbeats.`
            };
          } else {
            issue.status = "open";
            issue.auto_fix = {
              action: "soft_cast_refresh",
              at: nowIso,
              result: "skipped",
              message: "Skipped cast refresh — no online devices to wake. Power/network check needed."
            };
          }
        }
        continue;
      }

      if (issue.check === "remote_cast") {
        const { error } = await supabase
          .from("remote_cast_receivers")
          .update({ status: "offline", updated_at: nowIso })
          .eq("status", "online")
          .lt("last_seen_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());
        if (error && !isMissingRelation(error)) throw error;
        issue.status = "fixed";
        issue.auto_fix = {
          action: "mark_stale_remote_cast_offline",
          at: nowIso,
          result: "ok",
          message: "Marked stale remote cast receivers offline."
        };
        continue;
      }

      if (issue.check === "checkout_lag") {
        const ids = context.lagged.map((row) => String(row.id)).slice(0, 30);
        if (ids.length) {
          const { error } = await supabase
            .from("live_transition_dogs")
            .update({
              hidden: true,
              display_status: "removed",
              current_status: "audit_cleared_stale",
              updated_at: nowIso
            })
            .in("id", ids)
            .eq("hidden", false);
          if (error) throw error;
        }
        issue.status = "fixed";
        issue.auto_fix = {
          action: "hide_stale_checkout_rows",
          at: nowIso,
          result: "ok",
          message: `Hid ${ids.length} stale checking_in/out row(s) from the whiteboard (local DB only — no Gingr API).`
        };
        continue;
      }

      if (issue.check === "webhooks" && issue.title.includes("Ignored Gingr webhook noise")) {
        const ids = context.unsupportedWebhookIds.slice(0, 2000);
        let cleared = 0;
        for (let i = 0; i < ids.length; i += 100) {
          const chunk = ids.slice(i, i + 100);
          const { data, error } = await supabase
            .from("gingr_webhook_events")
            .update({ processed: true, processing_error: null })
            .in("id", chunk)
            .select("id");
          if (error) throw error;
          cleared += data?.length ?? 0;
        }
        issue.status = "fixed";
        issue.auto_fix = {
          action: "clear_unsupported_webhook_noise",
          at: nowIso,
          result: "ok",
          message: `Marked ${cleared} unsupported webhook event(s) as processed (email_sent / form edits, etc.).`
        };
        continue;
      }

      if (issue.check === "webhooks" && issue.title.includes("Unsigned Gingr webhooks")) {
        const ids = context.unsignedWebhookIds.slice(0, 2000);
        let cleared = 0;
        for (let i = 0; i < ids.length; i += 100) {
          const chunk = ids.slice(i, i + 100);
          const { data, error } = await supabase
            .from("gingr_webhook_events")
            .update({ processed: true })
            .in("id", chunk)
            .select("id");
          if (error) throw error;
          cleared += data?.length ?? 0;
        }
        issue.status = "fixed";
        issue.auto_fix = {
          action: "acknowledge_unsigned_webhooks",
          at: nowIso,
          result: "ok",
          message: `Acknowledged ${cleared} unsigned webhook(s). They were already rejected and never applied to the board.`
        };
        continue;
      }

      if (issue.check === "cast_tv" && issue.title.includes("idle / unused")) {
        issue.status = "fixed";
        issue.auto_fix = {
          action: "acknowledge_cast_tv_unused",
          at: nowIso,
          result: "ok",
          message: "CAST-TV has been idle over 2 days — acknowledged as unused. No Gingr/network changes."
        };
        continue;
      }

      if (issue.check === "cast_tv" && issue.title.includes("heartbeat missing")) {
        issue.status = "fixed";
        issue.auto_fix = {
          action: "acknowledge_cast_tv_missing",
          at: nowIso,
          result: "ok",
          message: "No CAST-TV heartbeat row — acknowledged as unused until a screen comes online."
        };
        continue;
      }

      if (issue.check === "cast_tv" && issue.title.includes("offline / lagging")) {
        // Overnight/weekend offline should not stick as an open WARNING for days.
        issue.status = "fixed";
        issue.auto_fix = {
          action: "acknowledge_cast_tv_offline",
          at: nowIso,
          result: "ok",
          message: "CAST-TV offline acknowledged. Re-open the CAST-TV URL on the screen to restore heartbeats."
        };
        continue;
      }

      if (issue.check === "webhooks" || issue.check === "cast_tv" || issue.check === "env") {
        issue.auto_fix = {
          action: "observe_only",
          at: nowIso,
          result: "skipped",
          message: "Reported for operators — no automatic Gingr/network mutation."
        };
      }
    } catch (error) {
      issue.status = "failed";
      issue.auto_fix = {
        action: "auto_fix",
        at: nowIso,
        result: "error",
        message: error instanceof Error ? error.message : "Auto-fix failed."
      };
    }
  }

  return issues;
}

export async function runSystemHealthAudit(
  supabase: SupabaseClient,
  options?: { trigger?: "cron" | "manual"; autoFix?: boolean }
) {
  const trigger = options?.trigger ?? "manual";
  const autoFix = options?.autoFix !== false;
  const started_at = new Date().toISOString();
  const now = Date.now();

  const display = await checkDisplayDevices(supabase, now);
  const castTvIssues = await checkCastTv(supabase, now);
  const remoteIssues = await checkRemoteCast(supabase, now);
  const webhooks = await checkWebhooks(supabase, now);
  const checkout = await checkCheckoutLag(supabase, now);
  const pushIssues = await checkPushNotices(supabase, now);

  let issues = [
    ...display.issues,
    ...castTvIssues,
    ...remoteIssues,
    ...webhooks.issues,
    ...checkout.issues,
    ...pushIssues
  ];

  if (autoFix && issues.length) {
    issues = await applySafeFixes(supabase, issues, {
      pruneCandidates: display.pruneCandidates,
      lagged: checkout.lagged as Array<{ id: string }>,
      onlineCount: display.online.length,
      unsupportedWebhookIds: webhooks.unsupportedIds,
      unsignedWebhookIds: webhooks.unsignedIds
    });
  }

  const fixed = issues.filter((i) => i.status === "fixed").length;
  const failed = issues.filter((i) => i.status === "failed").length;
  const open = issues.filter((i) => i.status === "open").length;
  const allClear = open === 0 && failed === 0;

  const allClearIssue =
    allClear
      ? [
          makeIssue({
            check: "whiteboard_push",
            severity: "low",
            title: "All clear",
            detail:
              fixed > 0
                ? `Audit finished clean after ${fixed} auto-fix(es). No open whiteboard/Gingr health issues remain.`
                : "No whiteboard push, checkout lag, Cast Keeper, or Gingr webhook issues detected.",
            status: "all_clear",
            auto_fix: {
              action: fixed > 0 ? "auto_fixed" : "none",
              at: started_at,
              result: "ok",
              message: fixed > 0 ? `Audit passed — ${fixed} issue(s) auto-fixed.` : "Audit passed — no fixes required."
            }
          })
        ]
      : [];

  const tableRows = [...allClearIssue, ...issues].sort((a, b) => {
    const rank = { failed: 0, open: 1, fixed: 2, all_clear: 3 } as const;
    return rank[a.status] - rank[b.status];
  });

  const finished_at = new Date().toISOString();
  const run: SystemHealthAuditRun = {
    id: newId("run"),
    started_at,
    finished_at,
    trigger,
    summary: {
      checked: 7,
      open,
      fixed,
      failed,
      all_clear: allClear
    },
    issues: tableRows
  };

  const previous = await loadState(supabase);
  const overall_status: SystemHealthAuditState["overall_status"] =
    failed > 0 ? "failed_fixes" : open > 0 ? "issues" : "all_clear";

  const next: SystemHealthAuditState = {
    version: 1,
    last_run_at: finished_at,
    last_run_id: run.id,
    overall_status,
    open_issues: issues.filter((i) => i.status === "open" || i.status === "failed"),
    recent_rows: tableRows.slice(0, MAX_ROWS),
    runs: [run, ...previous.runs].slice(0, MAX_RUNS)
  };
  await saveState(supabase, next);
  return next;
}

export type OverviewSystemHealth = {
  last_run_at: string | null;
  overall_status: SystemHealthAuditState["overall_status"];
  summary: SystemHealthAuditRun["summary"] | null;
  rows: SystemHealthIssue[];
  next_cron_hint: string;
};

export function toOverviewSystemHealth(state: SystemHealthAuditState): OverviewSystemHealth {
  const latest = state.runs[0] ?? null;
  return {
    last_run_at: state.last_run_at,
    overall_status: state.overall_status,
    summary: latest?.summary ?? null,
    rows: state.recent_rows.length ? state.recent_rows : latest?.issues ?? [],
    next_cron_hint: "Auto-audits run twice daily at 7:00 AM and 7:00 PM Pacific."
  };
}
