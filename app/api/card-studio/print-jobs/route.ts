import { NextResponse } from "next/server";
import { requireCardStudioPermission, cardStudioActor } from "@/lib/card-studio/access";
import { listPrintJobs, retryPrintJob, submitPrintJob, updatePrintJobStatus, confirmOsPrint } from "@/lib/card-studio/store";
import { writeCardStudioAudit } from "@/lib/card-studio/audit";
import { blockDemoWrite } from "@/lib/admin/api-auth";
import type { MemberCardContext, PrintMode } from "@/lib/card-studio/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.view");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  try {
    const jobs = await listPrintJobs({ status: url.searchParams.get("status") ?? undefined });
    return NextResponse.json({ ok: true, jobs });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load print jobs." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.print");
  if (!auth.ok) return auth.response;
  const demo = blockDemoWrite(request);
  if (demo) return demo;
  const actor = cardStudioActor(auth.session, auth.role);
  const body = (await request.json()) as {
    member: MemberCardContext;
    templateId: string;
    printerId: string;
    mode?: PrintMode;
    overrideWarnings?: boolean;
    members?: MemberCardContext[];
    expirationAt?: string | null;
  };
  try {
    if (Array.isArray(body.members) && body.members.length) {
      const batchId = crypto.randomUUID();
      const results = [];
      for (const member of body.members) {
        results.push(
          await submitPrintJob(
            {
              member,
              templateId: body.templateId,
              printerId: body.printerId,
              mode: body.mode ?? "duplex",
              overrideWarnings: body.overrideWarnings,
              expirationAt: body.expirationAt,
              batchId
            },
            actor
          )
        );
      }
      await writeCardStudioAudit({
        actorAdminId: actor.adminUserId,
        actorEmail: actor.email,
        role: actor.role,
        action: "print.batch",
        resourceType: "print_job",
        resourceId: batchId,
        details: { count: body.members.length }
      });
      return NextResponse.json({ ok: true, batchId, results });
    }
    const result = await submitPrintJob(
      {
        member: body.member,
        templateId: body.templateId,
        printerId: body.printerId,
        mode: body.mode ?? "duplex",
        overrideWarnings: body.overrideWarnings,
        expirationAt: body.expirationAt
      },
      actor
    );
    await writeCardStudioAudit({
      actorAdminId: actor.adminUserId,
      actorEmail: actor.email,
      role: actor.role,
      action: result.ok ? "card.printed" : "print.blocked",
      resourceType: "print_job",
      resourceId: result.ok && "job" in result ? String(result.job.job_id) : undefined,
      result: result.ok ? "ok" : "blocked",
      details: { issues: "issues" in result ? result.issues : [] }
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "RuffOps couldn't submit the print job. The card was NOT marked as printed."
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.print");
  if (!auth.ok) return auth.response;
  const demo = blockDemoWrite(request);
  if (demo) return demo;
  const actor = cardStudioActor(auth.session, auth.role);
  const body = (await request.json()) as { id: string; action: "pause" | "resume" | "cancel" | "retry" | "confirm-os-print"; confirmDuplicate?: boolean; printed?: boolean };
  if (!body.id) return NextResponse.json({ error: "Job id is required." }, { status: 400 });
  try {
    if (body.action === "confirm-os-print") {
      const result = await confirmOsPrint(body.id, Boolean(body.printed), actor);
      await writeCardStudioAudit({
        actorAdminId: actor.adminUserId,
        actorEmail: actor.email,
        role: actor.role,
        action: body.printed ? "print.os_confirmed" : "print.os_not_printed",
        resourceType: "print_job",
        resourceId: body.id
      });
      return NextResponse.json(result);
    }
    if (body.action === "retry") {
      const result = await retryPrintJob(body.id, Boolean(body.confirmDuplicate), actor);
      return NextResponse.json(result);
    }
    const status = body.action === "pause" ? "paused" : body.action === "resume" ? "queued" : "cancelled";
    await updatePrintJobStatus(body.id, status);
    await writeCardStudioAudit({
      actorAdminId: actor.adminUserId,
      actorEmail: actor.email,
      role: actor.role,
      action: `print.${body.action}`,
      resourceType: "print_job",
      resourceId: body.id
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Job update failed." }, { status: 500 });
  }
}
