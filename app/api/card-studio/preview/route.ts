import { NextResponse } from "next/server";
import { requireCardStudioPermission } from "@/lib/card-studio/access";
import { getPrinter, getTemplate, loadCardStudioSettings } from "@/lib/card-studio/store";
import { validateCardForPrint } from "@/lib/card-studio/validation";
import { renderPopulatedArtwork } from "@/lib/card-studio/render/artwork";
import { parseTemplateDocument } from "@/lib/card-studio/template-schema";
import type { CardTemplateDocument, MemberCardContext, PrintMode } from "@/lib/card-studio/types";
import { adapterForPrinter } from "@/lib/card-studio/printers/registry";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.view");
  if (!auth.ok) return auth.response;
  const body = (await request.json()) as {
    templateId?: string;
    document?: CardTemplateDocument;
    member: MemberCardContext;
    mode?: PrintMode;
    printerId?: string;
  };
  let document: CardTemplateDocument | null = null;
  if (body.document) {
    document = parseTemplateDocument(body.document);
  } else if (body.templateId) {
    const template = await getTemplate(body.templateId);
    if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    document = template.document;
  }
  if (!document) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  const settings = await loadCardStudioSettings();
  let printerOnline = true;
  let capabilities = null;
  if (body.printerId) {
    const printer = await getPrinter(body.printerId);
    if (printer) {
      const adapter = adapterForPrinter(printer);
      const info = {
        id: printer.id,
        name: printer.name,
        manufacturer: printer.manufacturer,
        model: printer.model,
        connection: printer.connection,
        adapterId: printer.adapter_id,
        nativeIntegration: printer.native_integration
      };
      const status = await adapter.getStatus(info);
      printerOnline = status.code === "online";
      capabilities = await adapter.getCapabilities(info);
    }
  }
  const member = {
    ...body.member,
    cardUuid: body.member.cardUuid || "preview-token",
    membershipType: body.member.membershipType || "VIP Member"
  };
  const issues = validateCardForPrint({
    member,
    template: document,
    sides: body.mode ?? "duplex",
    printerOnline,
    capabilities
  });
  try {
    const artwork = await renderPopulatedArtwork(document, member, settings.verificationBaseUrl);
    return NextResponse.json({
      ok: issues.every((item) => item.severity !== "critical"),
      issues,
      capabilities,
      ...artwork,
      aspect: artwork.width / artwork.height
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not encode a Gingr barcode.";
    issues.push({
      severity: "critical",
      code: "BARCODE_ENCODE",
      message,
      overrideable: false
    });
    return NextResponse.json({
      ok: false,
      issues,
      capabilities,
      error: message
    });
  }
}
