import { CR80_PX, FITDOG_APPROVED_LOGO, FITDOG_APPROVED_WORDMARK, FITDOG_CARD_COLORS } from "@/lib/card-studio/constants";
import { createElement, emptyTemplateDocument } from "@/lib/card-studio/template-schema";
import type { CardTemplateDocument } from "@/lib/card-studio/types";

/** Seeded Fitdog VIP CR80 template. Uses the official Fitdog logo asset — never a generated substitute. */
export function createFitdogVipTemplateDocument(): CardTemplateDocument {
  const doc = emptyTemplateDocument();
  doc.front.background = FITDOG_CARD_COLORS.navy;
  doc.back.background = "#071018";

  doc.front.elements = [
    createElement("background", {
      id: "vip_front_bg",
      x: 0,
      y: 0,
      width: CR80_PX.width,
      height: CR80_PX.height,
      properties: { fill: FITDOG_CARD_COLORS.navy, opacity: 1 }
    }),
    createElement("rectangle", {
      id: "vip_front_accent",
      x: 0,
      y: 0,
      width: 18,
      height: CR80_PX.height,
      properties: { fill: FITDOG_CARD_COLORS.cyan, borderWidth: 0, opacity: 1 }
    }),
    createElement("logo", {
      id: "vip_front_logo",
      x: 48,
      y: 28,
      width: 72,
      height: 72,
      properties: { src: FITDOG_APPROVED_LOGO, fit: "contain", opacity: 1 }
    }),
    createElement("text", {
      id: "vip_front_brand",
      x: 132,
      y: 36,
      width: 280,
      height: 28,
      properties: {
        text: "FITDOG",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 22,
        fontWeight: 800,
        letterSpacing: 3,
        color: FITDOG_CARD_COLORS.sky,
        textAlign: "left"
      }
    }),
    createElement("membership_type", {
      id: "vip_front_type",
      x: 132,
      y: 66,
      width: 280,
      height: 24,
      properties: {
        text: "{{member.membership_type}}",
        fontSize: 13,
        fontWeight: 600,
        color: FITDOG_CARD_COLORS.gold,
        letterSpacing: 1.4
      }
    }),
    createElement("member_photo", {
      id: "vip_front_photo",
      x: 48,
      y: 132,
      width: 168,
      height: 210,
      properties: {
        src: "{{member.photo}}",
        fit: "cover",
        frame: "rounded_id",
        cropX: 50,
        cropY: 42,
        zoom: 1,
        borderRadius: 18,
        opacity: 1
      }
    }),
    createElement("dynamic_field", {
      id: "vip_front_name",
      x: 240,
      y: 150,
      width: 520,
      height: 40,
      properties: {
        text: "{{member.name}}",
        fontSize: 28,
        fontWeight: 700,
        color: "#ffffff"
      }
    }),
    createElement("dynamic_field", {
      id: "vip_front_dog",
      x: 240,
      y: 196,
      width: 520,
      height: 28,
      properties: {
        text: "{{member.dog_name}}",
        fontSize: 16,
        fontWeight: 500,
        color: FITDOG_CARD_COLORS.sky
      }
    }),
    createElement("member_number", {
      id: "vip_front_number",
      x: 240,
      y: 250,
      width: 320,
      height: 24,
      properties: {
        text: "{{member.member_number}}",
        fontSize: 14,
        fontWeight: 600,
        color: "#cbd5e1"
      }
    }),
    createElement("expiration_date", {
      id: "vip_front_exp",
      x: 240,
      y: 282,
      width: 320,
      height: 24,
      properties: {
        text: "Expires {{member.expiration_date}}",
        fontSize: 13,
        color: "#94a3b8"
      }
    }),
    createElement("qr_code", {
      id: "vip_front_qr",
      x: 860,
      y: 430,
      width: 110,
      height: 110,
      properties: {
        contentType: "verification_url",
        value: "{{member.card_uuid}}",
        errorCorrection: "M",
        foreground: "#0b1b2b",
        background: "#ffffff"
      }
    })
  ];

  doc.back.elements = [
    createElement("background", {
      id: "vip_back_bg",
      x: 0,
      y: 0,
      width: CR80_PX.width,
      height: CR80_PX.height,
      properties: { fill: "#071018", opacity: 1 }
    }),
    createElement("logo", {
      id: "vip_back_logo",
      x: 40,
      y: 28,
      width: 220,
      height: 48,
      properties: { src: FITDOG_APPROVED_WORDMARK, fit: "contain", opacity: 1 }
    }),
    createElement("text", {
      id: "vip_back_info",
      x: 40,
      y: 100,
      width: 620,
      height: 140,
      properties: {
        text: "Fitdog VIP membership. This card identifies an authorized Fitdog member. Verify status with the QR code. Lost or stolen cards should be reported immediately.",
        fontSize: 14,
        fontWeight: 400,
        lineHeight: 1.4,
        color: "#e2e8f0"
      }
    }),
    createElement("text", {
      id: "vip_back_services",
      x: 40,
      y: 250,
      width: 620,
      height: 90,
      properties: {
        text: "Daycare  ·  Boarding  ·  Training  ·  Club + Sports",
        fontSize: 13,
        fontWeight: 600,
        color: FITDOG_CARD_COLORS.cyan
      }
    }),
    createElement("barcode", {
      id: "vip_back_barcode",
      x: 40,
      y: 430,
      width: 520,
      height: 72,
      properties: {
        symbology: "code128",
        value: "FD-{{member.member_number}}",
        humanReadable: true,
        quietZone: 10,
        foreground: "#0b1b2b",
        background: "#ffffff"
      }
    }),
    createElement("qr_code", {
      id: "vip_back_qr",
      x: 860,
      y: 430,
      width: 110,
      height: 110,
      properties: {
        contentType: "verification_url",
        value: "{{member.card_uuid}}",
        errorCorrection: "M",
        foreground: "#0b1b2b",
        background: "#ffffff"
      }
    }),
    createElement("microtext", {
      id: "vip_back_micro",
      x: 40,
      y: 520,
      width: 760,
      height: 16,
      properties: {
        text: "FITDOG • VERIFY {{member.card_uuid}} • UNAUTHORIZED REPRODUCTION PROHIBITED",
        fontSize: 7,
        color: "#64748b"
      }
    })
  ];

  return doc;
}
