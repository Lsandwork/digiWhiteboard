import { renderSideSvg } from "@/lib/card-studio/render/svg";
import { qrPayload, renderQrSvg } from "@/lib/card-studio/codes/qr";
import { renderBarcodeSvg } from "@/lib/card-studio/codes/barcode";
import { gingrBarcodeValue, barcodeSymbologyForValue } from "@/lib/card-studio/gingr-barcode";
import type { CardTemplateDocument, MemberCardContext, QrContentType } from "@/lib/card-studio/types";

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
        const value = gingrBarcodeValue(member);
        if (!value) {
          if (el.properties.keepArtworkWhenEmpty) continue;
          throw new Error("Type a Member ID number to generate the barcode.");
        }
        const symbology = barcodeSymbologyForValue(value);
        barcodeSvg[el.id] = await renderBarcodeSvg({
          symbology,
          value,
          width: el.width,
          height: el.height,
          humanReadable: el.properties.humanReadable !== false,
          quietZone: Number(el.properties.quietZone ?? 16),
          foreground: String(el.properties.foreground ?? "#1F2D3D"),
          background: String(el.properties.background ?? "#ffffff")
        });
      }
    }
    return { qrSvg, barcodeSvg };
  }

  const frontCodes = await codesFor("front");
  const backCodes = await codesFor("back");
  return {
    frontSvg: renderSideSvg(template.front, member, { verificationBaseUrl, trimToExactArt: true, ...frontCodes }),
    backSvg: renderSideSvg(template.back, member, { verificationBaseUrl, trimToExactArt: true, ...backCodes }),
    width: template.front.width,
    height: template.front.height,
    dpi: template.dpi
  };
}
