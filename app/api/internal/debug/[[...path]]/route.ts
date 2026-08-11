/**
 * Internal read-only developer debug API.
 * Auth: RUFFOPS_DEBUG_TOKEN header (x-ruffops-debug-token) OR admin session with system_health.developer.
 * Never mutates business data.
 */

import { NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { getServiceSupabase } from "@/lib/supabase/server";
import { accessFromLegacyRole, hasPermission } from "@/lib/admin/permissions";
import { isAdminRequest } from "@/lib/admin/api-auth";
import {
  debugHealth,
  debugRouteRun,
  debugErrors,
  debugIntegration,
  debugSearch,
  debugFeatureContext,
  debugBugBundle,
  debugDog
} from "@/lib/system-health/debug-bridge";

export const dynamic = "force-dynamic";

const debugRate = new Map<string, { count: number; resetAt: number }>();

function allowDebugRequest(key: string, limit = 60, windowMs = 60_000) {
  const now = Date.now();
  const row = debugRate.get(key);
  if (!row || row.resetAt < now) {
    debugRate.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (row.count >= limit) return false;
  row.count += 1;
  return true;
}

function tokenOk(request: Request): boolean {
  const expected = process.env.RUFFOPS_DEBUG_TOKEN?.trim();
  if (!expected) return false;
  const got =
    request.headers.get("x-ruffops-debug-token")?.trim() ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(got && got === expected);
}

async function authorize(request: Request) {
  if (tokenOk(request)) {
    return { ok: true as const, actor: { adminId: null as string | null, email: "debug-token" } };
  }
  if (!isAdminRequest(request)) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const session = getAdminSessionFromRequest(request);
  if (!session) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const supabase = getServiceSupabase();
  const access =
    (await getUserAccess(supabase, session.adminUserId, session.role, session.email)) ??
    accessFromLegacyRole(null, session.email, session.role);
  if (!hasPermission(access, "system_health.developer") && !hasPermission(access, "system_health.view")) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return {
    ok: true as const,
    actor: { adminId: session.adminUserId, email: session.email }
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path?: string[] }> | { path?: string[] } }
) {
  const ip = request.headers.get("x-forwarded-for") || "local";
  if (!allowDebugRequest(`debug-api:${ip}`)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const resolved = await Promise.resolve(context.params);
  const parts = resolved.path || [];
  const url = new URL(request.url);

  try {
    if (parts.length === 0 || parts[0] === "health") {
      return NextResponse.json(await debugHealth(auth.actor));
    }
    if (parts[0] === "route-runs" && parts[1]) {
      return NextResponse.json(await debugRouteRun(parts[1], auth.actor));
    }
    if (parts[0] === "correlation" && parts[1]) {
      return NextResponse.json(await debugBugBundle(parts[1], auth.actor));
    }
    if (parts[0] === "errors") {
      const last = url.searchParams.get("last") || "1h";
      const hours = last.endsWith("h") ? Number(last.replace(/h$/i, "")) : 1;
      return NextResponse.json(await debugErrors({ lastHours: hours, actor: auth.actor }));
    }
    if (parts[0] === "integrations" && parts[1]) {
      const last = url.searchParams.get("last") || "24h";
      const hours = last.endsWith("h") ? Number(last.replace(/h$/i, "")) : 24;
      return NextResponse.json(
        await debugIntegration({ integration: parts[1], lastHours: hours, actor: auth.actor })
      );
    }
    if (parts[0] === "events" || parts[0] === "search") {
      const q = url.searchParams.get("q") || url.searchParams.get("query") || "";
      return NextResponse.json(await debugSearch({ query: q, actor: auth.actor }));
    }
    if (parts[0] === "context") {
      return NextResponse.json(
        await debugFeatureContext({
          feature: url.searchParams.get("feature") || "route-generator",
          lastHours: Number(url.searchParams.get("lastHours") || 24),
          actor: auth.actor
        })
      );
    }
    if (parts[0] === "dog") {
      return NextResponse.json(
        await debugDog({
          dog: url.searchParams.get("name") || parts[1] || "",
          date: url.searchParams.get("date") || undefined,
          actor: auth.actor
        })
      );
    }
    return NextResponse.json({ error: "Unknown debug endpoint" }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Debug API error" },
      { status: 500 }
    );
  }
}
