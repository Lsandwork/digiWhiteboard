import { renderSideSvg } from "@/lib/card-studio/render/svg";
import { qrPayload, renderQrSvg } from "@/lib/card-studio/codes/qr";
import { renderBarcodeSvg } from "@/lib/card-studio/codes/barcode";
import { resolveTemplateString } from "@/lib/card-studio/dynamic-fields";
import type { BarcodeSymbology, CardTemplateDocument, MemberCardContext, QrContentType } from "@/lib/card-studio/types";

export async function renderPopulatedArtwork(
  template: CardTemplateDocument,
  member: MemberCardContext,
  verificationBaseUrl: string
) {

  async function codesFor(side: "front" | "back") {
    const qrSvg: Record<string, string> = {};
    const barcodeSvg: Record<string, string> = {};
    for (const el of template[side].elements) {
      if (el.type === "qr_code") {
        const payload = qrPayload({
          contentType: (el.properties.contentType as QrContentType) || "verification_url",
          value: String(el.properties.value ?? ""),
          member,
          verificationBaseUrl
        });
        qrSvg[el.id] = await renderQrSvg(
          payload,
          el.width,
          String(el.properties.foreground ?? "#0b1b2b"),
          String(el.properties.background ?? "#ffffff")
        );
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
  return {
    frontSvg: renderSideSvg(template.front, member, { verificationBaseUrl, ...frontCodes }),
    backSvg: renderSideSvg(template.back, member, { verificationBaseUrl, ...backCodes }),
    width: template.front.width,
    height: template.front.height,
    dpi: template.dpi
  };
}
