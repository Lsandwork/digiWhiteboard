import { renderSideSvg } from "@/lib/card-studio/render/svg";
import { qrPayload, renderQrSvg } from "@/lib/card-studio/codes/qr";
import { renderBarcodeSvg } from "@/lib/card-studio/codes/barcode";
import { gingrBarcodeValue, normalizeGingrAnimalId } from "@/lib/card-studio/gingr-barcode";
import { resolveTemplateString } from "@/lib/card-studio/dynamic-fields";
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
        const raw = resolveTemplateString(String(el.properties.value ?? "{{member.barcode}}"), member);
        const value = gingrBarcodeValue(member) || normalizeGingrAnimalId(raw);
        if (!value) {
          throw new Error("Cannot encode a Gingr barcode without a Gingr animal ID.");
        }
        barcodeSvg[el.id] = await renderBarcodeSvg({
          symbology: "code128",
          value,
          width: el.width,
          height: el.height,
          humanReadable: el.properties.humanReadable !== false
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
