import { NextResponse } from "next/server";
import { requireCardStudioPermission, cardStudioActor } from "@/lib/card-studio/access";
import { archiveTemplate, createTemplate, duplicateTemplate, ensureDefaultTemplates, getTemplate, listTemplates, saveTemplateVersion } from "@/lib/card-studio/store";
import { emptyTemplateDocument } from "@/lib/card-studio/template-schema";
import { writeCardStudioAudit } from "@/lib/card-studio/audit";
import { blockDemoWrite } from "@/lib/admin/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.view");
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  try {
    if (id) {
      const template = await getTemplate(id);
      if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
      return NextResponse.json({ ok: true, template });
    }
    await ensureDefaultTemplates(cardStudioActor(auth.session, auth.role));
    const status = url.searchParams.get("status") as "draft" | "active" | "archived" | "all" | null;
    const templates = await listTemplates({ status: status ?? "all" });
    return NextResponse.json({ ok: true, templates });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load templates." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.design");
  if (!auth.ok) return auth.response;
  const demo = blockDemoWrite(request);
  if (demo) return demo;
  const actor = cardStudioActor(auth.session, auth.role);
  const body = (await request.json()) as {
    name?: string;
    description?: string;
    category?: string;
    document?: unknown;
    duplicateOf?: string;
  };
  try {
    const template = body.duplicateOf
      ? await duplicateTemplate(body.duplicateOf, actor)
      : await createTemplate(
          {
            name: body.name?.trim() || "Untitled template",
            description: body.description ?? "",
            category: body.category ?? "standard_member",
            status: "draft",
            document: (body.document as never) ?? emptyTemplateDocument()
          },
          actor
        );
    await writeCardStudioAudit({
      actorAdminId: actor.adminUserId,
      actorEmail: actor.email,
      role: actor.role,
      action: body.duplicateOf ? "template.duplicated" : "template.created",
      resourceType: "template",
      resourceId: template.id
    });
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create template." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.design");
  if (!auth.ok) return auth.response;
  const demo = blockDemoWrite(request);
  if (demo) return demo;
  const actor = cardStudioActor(auth.session, auth.role);
  const body = (await request.json()) as {
    id: string;
    document?: unknown;
    name?: string;
    description?: string;
    status?: "draft" | "active" | "archived";
    bumpVersion?: boolean;
  };
  if (!body.id) return NextResponse.json({ error: "Template id is required." }, { status: 400 });
  try {
    const template = await saveTemplateVersion(body.id, body.document as never, actor, {
      name: body.name,
      description: body.description,
      status: body.status,
      bumpVersion: body.bumpVersion
    });
    await writeCardStudioAudit({
      actorAdminId: actor.adminUserId,
      actorEmail: actor.email,
      role: actor.role,
      action: body.bumpVersion === false ? "template.saved" : "template.versioned",
      resourceType: "template",
      resourceId: body.id
    });
    return NextResponse.json({ ok: true, template });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save template." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.delete_templates");
  if (!auth.ok) return auth.response;
  const demo = blockDemoWrite(request);
  if (demo) return demo;
  const actor = cardStudioActor(auth.session, auth.role);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Template id is required." }, { status: 400 });
  try {
    await archiveTemplate(id, actor);
    await writeCardStudioAudit({
      actorAdminId: actor.adminUserId,
      actorEmail: actor.email,
      role: actor.role,
      action: "template.archived",
      resourceType: "template",
      resourceId: id
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to archive template." }, { status: 500 });
  }
}
