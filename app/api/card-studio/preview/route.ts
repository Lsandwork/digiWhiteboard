import { NextResponse } from "next/server";
import { requireCardStudioPermission } from "@/lib/card-studio/access";
import { getTemplate } from "@/lib/card-studio/store";
import { validateCardForPrint } from "@/lib/card-studio/validation";
import { renderSideSvg } from "@/lib/card-studio/render/svg";
import { qrPayload, renderQrSvg } from "@/lib/card-studio/codes/qr";
import { renderBarcodeSvg } from "@/lib/card-studio/codes/barcode";
import { resolveTemplateString } from "@/lib/card-studio/dynamic-fields";
import { loadCardStudioSettings } from "@/lib/card-studio/store";
import type { BarcodeSymbology, MemberCardContext, PrintMode, QrContentType } from "@/lib/card-studio/types";
import { getPrinter } from "@/lib/card-studio/store";
import { adapterForPrinter } from "@/lib/card-studio/printers/registry";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireCardStudioPermission(request, "card_studio.view");
  if (!auth.ok) return auth.response;
  const body = (await request.json()) as {
    templateId: string;
    member: MemberCardContext;
    mode?: PrintMode;
    printerId?: string;
  };
  const template = await getTemplate(body.templateId);
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
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
    template: template.document,
    sides: body.mode ?? "duplex",
    printerOnline,
    capabilities
  });

  async function codesFor(side: "front" | "back") {
    const qrSvg: Record<string, string> = {};
    const barcodeSvg: Record<string, string> = {};
    for (const el of template.document[side].elements) {
      if (el.type === "qr_code") {
        const payload = qrPayload({
          contentType: (el.properties.contentType as QrContentType) || "verification_url",
          value: String(el.properties.value ?? ""),
          member,
          verificationBaseUrl: settings.verificationBaseUrl
        });
        qrSvg[el.id] = await renderQrSvg(payload, el.width, String(el.properties.foreground ?? "#0b1b2b"), String(el.properties.background ?? "#ffffff"));
      }
      if (el.type === "barcode") {
        barcodeSvg[el.id] = await renderBarcodeSvg({
          symbology: (el.properties.symbology as BarcodeSymbology) || "code128",
          value: resolveTemplateString(String(el.properties.value ?? ""), member),
          width: el.width,
          height: el.height,
          humanReadable: Boolean(el.properties.humanReadable)
        });
      }
    }
    return { qrSvg, barcodeSvg };
  }

  const frontCodes = await codesFor("front");
  const backCodes = await codesFor("back");
  return NextResponse.json({
    ok: true,
    issues,
    capabilities,
    frontSvg: renderSideSvg(template.document.front, member, { verificationBaseUrl: settings.verificationBaseUrl, ...frontCodes }),
    backSvg: renderSideSvg(template.document.back, member, { verificationBaseUrl: settings.verificationBaseUrl, ...backCodes }),
    width: template.document.front.width,
    height: template.document.front.height,
    dpi: template.document.dpi,
    aspect: template.document.front.width / template.document.front.height
  });
}
