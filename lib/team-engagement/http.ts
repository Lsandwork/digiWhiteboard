import { NextResponse } from "next/server";
import { isParticipantView, paramsFromUrl, runLeadershipAction, runLeadershipView, runParticipantAction, runParticipantView } from "@/lib/team-engagement/api";
import {
  checkLeadershipAction,
  checkLeadershipRule,
  checkLeadershipView,
  checkParticipantAction,
  checkParticipantRead,
  denialResponse,
  engagementErrorResponse,
  loadEngagementContext,
  logAccessDenial,
  type AccessDenial,
  type EngagementContext
} from "@/lib/team-engagement/authorize";
import type { ServiceContext } from "@/lib/team-engagement/context";
import { buildExport, canExport, isExportType } from "@/lib/team-engagement/insights";
import { LEADERSHIP_VIEW_RULES, isLeadershipAction, isLeadershipView, isParticipantAction } from "@/lib/team-engagement/permissions";
import { createServiceContext } from "@/lib/team-engagement/service";

export type EngagementHandlerDeps = {
  loadContext: (request: Request) => Promise<{ ok: true; context: EngagementContext } | { ok: false; response: Response }>;
  serviceContext: (context: EngagementContext) => ServiceContext;
};

const DEFAULT_DEPS: EngagementHandlerDeps = {
  loadContext: loadEngagementContext,
  serviceContext: createServiceContext
};

const NO_STORE = { "Cache-Control": "no-store" };

function invalid(message: string) {
  return NextResponse.json({ error: message, code: "invalid" }, { status: 400, headers: NO_STORE });
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Manage Team Engagement screens. Management, Admin, and Super Admin only, checked on every request. */
export async function handleLeadershipGet(request: Request, deps: EngagementHandlerDeps = DEFAULT_DEPS) {
  const loaded = await deps.loadContext(request);
  if (!loaded.ok) return loaded.response;
  const { context } = loaded;
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "context";

  if (!isLeadershipView(view)) {
    const denied = checkLeadershipRule(context.actor, LEADERSHIP_VIEW_RULES.context);
    if (denied) return denialResponse(denied);
    return invalid("Unknown Team Engagement view.");
  }
  const denied = checkLeadershipView(context.actor, view);
  if (denied) {
    logAccessDenial(context, `view:${view}`, denied);
    return denialResponse(denied);
  }

  try {
    const data = await runLeadershipView(deps.serviceContext(context), view, paramsFromUrl(url));
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (error) {
    return engagementErrorResponse(error);
  }
}

export async function handleLeadershipPost(request: Request, deps: EngagementHandlerDeps = DEFAULT_DEPS) {
  const loaded = await deps.loadContext(request);
  if (!loaded.ok) return loaded.response;
  const { context } = loaded;

  const body = await readJsonObject(request);
  const action = typeof body?.action === "string" ? body.action : "";
  if (!body || !isLeadershipAction(action)) {
    const denied = checkLeadershipRule(context.actor, LEADERSHIP_VIEW_RULES.context);
    if (denied) return denialResponse(denied);
    return invalid(body ? "Unknown Team Engagement action." : "Send the request as a JSON object.");
  }
  const denied = checkLeadershipAction(context.actor, action);
  if (denied) {
    logAccessDenial(context, `action:${action}`, denied);
    return denialResponse(denied);
  }

  try {
    const data = await runLeadershipAction(deps.serviceContext(context), action, body);
    return NextResponse.json(data ?? { ok: true }, { headers: NO_STORE });
  } catch (error) {
    return engagementErrorResponse(error);
  }
}

/** CSV exports from Reports & Exports. Each export needs `engagement.export` plus the permission for its data. */
export async function handleExport(request: Request, deps: EngagementHandlerDeps = DEFAULT_DEPS) {
  const loaded = await deps.loadContext(request);
  if (!loaded.ok) return loaded.response;
  const { context } = loaded;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "";

  const denied = checkLeadershipView(context.actor, "reports");
  if (denied) {
    logAccessDenial(context, `export:${type.slice(0, 40)}`, denied);
    return denialResponse(denied);
  }
  if (!isExportType(type)) {
    return NextResponse.json({ error: "Choose a report to export.", code: "invalid" }, { status: 400, headers: NO_STORE });
  }
  if (!canExport(context.actor.permissions, type)) {
    const refusal: AccessDenial = {
      status: 403,
      code: "forbidden",
      reason: "missing_export_permission",
      message: "You do not have access to this part of Team Engagement."
    };
    logAccessDenial(context, `export:${type}`, refusal);
    return denialResponse(refusal);
  }

  try {
    const result = await buildExport(deps.serviceContext(context), { ...paramsFromUrl(url), type });
    return new Response(result.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return engagementErrorResponse(error);
  }
}

/** The employee Bark Out feed and suggestion box. Leadership screens live at /api/admin/team-engagement. */
export async function handleParticipantGet(request: Request, deps: EngagementHandlerDeps = DEFAULT_DEPS) {
  const loaded = await deps.loadContext(request);
  if (!loaded.ok) return loaded.response;
  const { context } = loaded;
  const denied = checkParticipantRead(context.actor);
  if (denied) return denialResponse(denied);

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "home";
  if (!isParticipantView(view)) {
    return NextResponse.json({ error: "Unknown Bark Out view.", code: "invalid" }, { status: 400, headers: NO_STORE });
  }
  try {
    const data = await runParticipantView(deps.serviceContext(context), view, paramsFromUrl(url));
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (error) {
    return engagementErrorResponse(error);
  }
}

export async function handleParticipantPost(request: Request, deps: EngagementHandlerDeps = DEFAULT_DEPS) {
  const loaded = await deps.loadContext(request);
  if (!loaded.ok) return loaded.response;
  const { context } = loaded;

  const body = await readJsonObject(request);
  if (!body) return invalid("Send the request as a JSON object.");
  const action = typeof body.action === "string" ? body.action : "";
  if (!isParticipantAction(action)) return invalid("Unknown Bark Out action.");
  const denied = checkParticipantAction(context.actor, action);
  if (denied) {
    logAccessDenial(context, `bark_outs:${action}`, denied);
    return denialResponse(denied);
  }
  try {
    const data = await runParticipantAction(deps.serviceContext(context), action, body);
    return NextResponse.json(data ?? { ok: true }, { headers: NO_STORE });
  } catch (error) {
    return engagementErrorResponse(error);
  }
}
