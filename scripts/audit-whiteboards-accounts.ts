/**
 * Live audit of whiteboards, display devices, CAST-TV, remote cast, and accounts.
 * Usage: npx tsx scripts/audit-whiteboards-accounts.ts
 */
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

loadEnvConfig(process.cwd());

const OUT = join(process.cwd(), "tmp-whiteboard-accounts-audit.json");
const baseUrl = (process.env.TEST_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://staff.ruffops.com").replace(
  /\/$/,
  ""
);

type Severity = "pass" | "warn" | "fail" | "info";
type Finding = { area: string; severity: Severity; title: string; detail: string };

const findings: Finding[] = [];
const now = Date.now();

function find(area: string, severity: Severity, title: string, detail: string) {
  findings.push({ area, severity, title, detail });
}

function ago(iso: string | null | undefined) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.round((now - t) / 1000);
}

function formatAge(seconds: number | null) {
  if (seconds == null) return "never";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

async function probe(path: string, init?: RequestInit) {
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init?.headers || {}) },
      signal: AbortSignal.timeout(15000)
    });
    const ms = Date.now() - started;
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, ms, json, text: text.slice(0, 200) };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      json: null,
      text: error instanceof Error ? error.message : "fetch failed"
    };
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // --- Public board probes ---
  const probes = [
    ["Staff board HTML", "/"],
    ["Lobby board HTML", "/lobby/checkouts"],
    ["CAST-TV HTML", "/cast-tv"],
    ["Remote receiver HTML", "/cast/receiver"],
    ["Staff cast redirect", "/staff-cast"],
    ["Lobby cast redirect", "/lobby-cast"],
    ["Live board API", "/api/live-board"],
    ["Lobby checkouts API", "/api/lobby/checkouts?fast=1"],
    ["Lobby status API", "/api/lobby/status"],
    ["Whiteboard state staff", "/api/whiteboard/state?board=staff"],
    ["Whiteboard state lobby", "/api/whiteboard/state?board=lobby"],
    ["Display sync API", "/api/display/sync"],
    ["CAST-TV settings", "/api/cast-tv/settings"]
  ] as const;

  for (const [name, path] of probes) {
    const result = await probe(path);
    if (result.ok) {
      find("boards", "pass", name, `${baseUrl}${path} → ${result.status} in ${result.ms}ms`);
    } else {
      find(
        "boards",
        path.includes("api") ? "fail" : "warn",
        name,
        `${baseUrl}${path} → ${result.status || "error"} (${result.text})`
      );
    }
  }

  // Domain routing probes
  for (const [host, expectPath, label] of [
    ["lobby.ruffops.com", "/lobby/checkouts", "Lobby custom domain"],
    ["casttv.ruffops.com", "/cast-tv", "CAST-TV custom domain"]
  ] as const) {
    try {
      const res = await fetch(`https://${host}/`, {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        headers: { Accept: "text/html" }
      });
      const location = res.headers.get("location") || "";
      const body = res.status === 200 ? (await res.text()).slice(0, 400) : "";
      const looksOk =
        res.status === 200 ||
        location.includes(expectPath) ||
        body.includes("lobby") ||
        body.includes("cast") ||
        body.includes("Fitdog");
      find(
        "domains",
        looksOk ? "pass" : "warn",
        label,
        `https://${host}/ → ${res.status}${location ? ` loc=${location}` : ""}`
      );
    } catch (error) {
      find("domains", "fail", label, error instanceof Error ? error.message : "unreachable");
    }
  }

  // --- Display devices ---
  const { data: devices, error: devicesError } = await sb
    .from("display_devices")
    .select("id, name, display_type, status, last_seen_at, current_route, app_version, updated_at")
    .order("last_seen_at", { ascending: false })
    .limit(200);
  if (devicesError) {
    find("devices", "fail", "display_devices query", devicesError.message);
  } else {
    const rows = devices ?? [];
    const online = rows.filter((d) => {
      const age = ago(d.last_seen_at);
      return age != null && age <= 90;
    });
    const stale = rows.filter((d) => {
      const age = ago(d.last_seen_at);
      return age == null || age > 90;
    });
    find(
      "devices",
      online.length ? "pass" : rows.length ? "warn" : "info",
      "Cast Keeper devices",
      `${online.length} online (≤90s) / ${rows.length} total · ${stale.length} stale`
    );
    for (const d of rows.slice(0, 40)) {
      const age = ago(d.last_seen_at);
      const onlineNow = age != null && age <= 90;
      find(
        "devices",
        onlineNow ? "pass" : age != null && age <= 3600 ? "warn" : "info",
        `${d.display_type}: ${d.name || d.id.slice(0, 8)}`,
        `last seen ${formatAge(age)} · route=${d.current_route || "—"} · ver=${d.app_version || "—"} · status=${d.status}`
      );
    }
  }

  // --- CAST-TV heartbeats + media ---
  const { data: castBeats, error: castBeatError } = await sb
    .from("cast_tv_heartbeats")
    .select("screen_id, last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(50);
  if (castBeatError) {
    find("cast_tv", "warn", "cast_tv_heartbeats", castBeatError.message);
  } else {
    const beats = castBeats ?? [];
    if (!beats.length) {
      find("cast_tv", "warn", "CAST-TV heartbeats", "No heartbeat rows — CAST-TV screens may be offline or unused.");
    }
    for (const beat of beats) {
      const age = ago(beat.last_seen_at);
      const online = age != null && age <= 90;
      find(
        "cast_tv",
        online ? "pass" : "warn",
        `CAST-TV screen ${beat.screen_id}`,
        `last seen ${formatAge(age)}`
      );
    }
  }

  const { data: castMedia, error: castMediaError } = await sb
    .from("cast_tv_media")
    .select("id, title, enabled, sort_order, media_type")
    .limit(200);
  if (!castMediaError) {
    const media = castMedia ?? [];
    const enabled = media.filter((m) => m.enabled !== false);
    find(
      "cast_tv",
      enabled.length ? "pass" : "warn",
      "CAST-TV media playlist",
      `${enabled.length} enabled / ${media.length} total items`
    );
  }

  // --- Remote cast receivers ---
  const { data: receivers, error: receiversError } = await sb
    .from("remote_cast_receivers")
    .select("id, name, status, last_seen_at, current_screen, paired_at, updated_at")
    .order("last_seen_at", { ascending: false })
    .limit(100);
  if (receiversError) {
    find("remote_cast", "info", "remote_cast_receivers", receiversError.message);
  } else {
    const rows = receivers ?? [];
    if (!rows.length) {
      find("remote_cast", "info", "Remote cast receivers", "None registered.");
    }
    for (const r of rows) {
      const age = ago(r.last_seen_at);
      const online = age != null && age <= 120;
      find(
        "remote_cast",
        online ? "pass" : "warn",
        `Receiver ${r.name || r.id.slice(0, 8)}`,
        `screen=${r.current_screen || "—"} · last seen ${formatAge(age)} · status=${r.status}`
      );
    }
  }

  // --- Board data freshness ---
  const { data: dogs, error: dogsError } = await sb
    .from("live_transition_dogs")
    .select("id, animal_name, current_status, updated_at, last_seen_from_gingr_at")
    .order("updated_at", { ascending: false })
    .limit(5);
  if (dogsError) {
    find("data", "fail", "live_transition_dogs", dogsError.message);
  } else {
    const newest = dogs?.[0]?.updated_at;
    const age = ago(newest);
    find(
      "data",
      age != null && age < 3600 ? "pass" : "warn",
      "Staff board dog data",
      `${dogs?.length ?? 0} recent rows sampled · newest update ${formatAge(age)}`
    );
  }

  const { count: webhookFailCount } = await sb
    .from("gingr_webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("processing_status", "failed");
  const { count: webhookRecentCount } = await sb
    .from("gingr_webhook_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(now - 24 * 3600 * 1000).toISOString());
  find(
    "data",
    (webhookFailCount ?? 0) > 20 ? "warn" : "pass",
    "Gingr webhooks (24h / failed)",
    `${webhookRecentCount ?? 0} events in last 24h · ${webhookFailCount ?? 0} failed (all-time filter)`
  );

  // --- Accounts ---
  const { data: users, error: usersError } = await sb
    .from("admin_users")
    .select("id, email, role, status, force_password_change, last_login_at, created_at, updated_at")
    .order("email", { ascending: true })
    .limit(500);
  if (usersError) {
    find("accounts", "fail", "admin_users query", usersError.message);
  } else {
    const rows = users ?? [];
    const active = rows.filter((u) => String(u.status).toLowerCase() === "active");
    const inactive = rows.filter((u) => String(u.status).toLowerCase() !== "active");
    const demo = rows.filter((u) => String(u.email || "").toLowerCase().endsWith("@demo.com"));
    const superAdmins = active.filter((u) => u.role === "owner_admin");
    const neverLoggedIn = active.filter((u) => !u.last_login_at);
    const dormant = active.filter((u) => {
      const age = ago(u.last_login_at);
      return age != null && age > 60 * 24 * 3600;
    });
    const forcePw = active.filter((u) => u.force_password_change);

    find("accounts", "info", "Account inventory", `${rows.length} total · ${active.length} active · ${inactive.length} inactive`);
    find(
      "accounts",
      superAdmins.length ? "pass" : "fail",
      "Active Super Admins",
      superAdmins.length
        ? superAdmins.map((u) => u.email).join(", ")
        : "No active owner_admin accounts — recovery risk"
    );
    find(
      "accounts",
      demo.some((u) => String(u.status).toLowerCase() === "active") ? "warn" : "pass",
      "Demo accounts (@demo.com)",
      `${demo.length} total · ${demo.filter((u) => String(u.status).toLowerCase() === "active").length} active (password123 risk if enabled in prod)`
    );
    find(
      "accounts",
      neverLoggedIn.length > 10 ? "warn" : "info",
      "Active never logged in",
      `${neverLoggedIn.length} active accounts with no last_login_at`
    );
    find(
      "accounts",
      dormant.length ? "warn" : "pass",
      "Dormant active accounts (>60d)",
      dormant.length
        ? dormant
            .slice(0, 15)
            .map((u) => `${u.email} (${formatAge(ago(u.last_login_at))})`)
            .join("; ")
        : "None"
    );
    find(
      "accounts",
      forcePw.length ? "info" : "pass",
      "Force password change",
      `${forcePw.length} active users must change password on next login`
    );

    const byRole = new Map<string, number>();
    for (const u of active) {
      const role = String(u.role || "unknown");
      byRole.set(role, (byRole.get(role) || 0) + 1);
    }
    find(
      "accounts",
      "info",
      "Active accounts by role",
      [...byRole.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([role, count]) => `${role}:${count}`)
        .join(" · ")
    );

    for (const u of rows) {
      const isDemo = String(u.email || "").toLowerCase().endsWith("@demo.com");
      const isActive = String(u.status).toLowerCase() === "active";
      let severity: Severity = "info";
      if (isDemo && isActive) severity = "warn";
      if (!isActive) severity = "info";
      find(
        "account_detail",
        severity,
        `${u.email || u.id}`,
        `role=${u.role} · status=${u.status} · last_login=${formatAge(ago(u.last_login_at))} · force_pw=${Boolean(u.force_password_change)}`
      );
    }
  }

  // Staff directory linkage
  const { data: directory, error: dirError } = await sb
    .from("staff_directory")
    .select("id, name, status, admin_user_id, dashboard_role, email")
    .limit(500);
  if (!dirError && directory) {
    const linked = directory.filter((d) => d.admin_user_id);
    const orphanLinks = linked.filter((d) => !(users ?? []).some((u) => u.id === d.admin_user_id));
    find(
      "directory",
      orphanLinks.length ? "warn" : "pass",
      "Staff directory ↔ login links",
      `${directory.length} directory rows · ${linked.length} linked · ${orphanLinks.length} orphan admin_user_id`
    );
  }

  // Admin settings flags
  const { data: settingsRow } = await sb.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  const settings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  if (settings.public_display_disabled === true) {
    find("settings", "fail", "public_display_disabled", "Public displays are DISABLED in admin settings.");
  } else {
    find("settings", "pass", "public_display_disabled", "Public displays enabled.");
  }
  if (settings.allow_env_admin_login === true) {
    find("settings", "warn", "allow_env_admin_login", "Env emergency admin login is enabled.");
  } else {
    find("settings", "pass", "allow_env_admin_login", "Env emergency admin login is off/unset.");
  }

  const summary = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    counts: {
      pass: findings.filter((f) => f.severity === "pass").length,
      warn: findings.filter((f) => f.severity === "warn").length,
      fail: findings.filter((f) => f.severity === "fail").length,
      info: findings.filter((f) => f.severity === "info").length
    },
    findings
  };

  writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary.counts));
  console.log(`Wrote ${OUT}`);
  for (const f of findings.filter((x) => x.severity === "fail" || x.severity === "warn").slice(0, 40)) {
    console.log(`[${f.severity.toUpperCase()}] ${f.area}: ${f.title} — ${f.detail}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
