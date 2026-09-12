import { CR80_PX, FITDOG_APPROVED_LOGO } from "@/lib/card-studio/constants";
import { MEMBER_PHOTO_SLOT_ID } from "@/lib/card-studio/photo-slot";
import {
  SERVICE_ICONS,
  SKY,
  backWedgeMarkup,
  coastalGraphicMarkup,
  orangeSwooshMarkup,
  pawAccentMarkup,
  pawPatternMarkup,
  pinMarkup,
  skyBackBackgroundMarkup,
  skyFrontBackgroundMarkup,
  vipScriptMarkup,
  waveAccentMarkup
} from "@/lib/card-studio/sky-blue-vip-art";
import { createElement, emptyTemplateDocument } from "@/lib/card-studio/template-schema";
import type { CardElement, CardTemplateDocument } from "@/lib/card-studio/types";

export const SKY_BLUE_VIP_TEMPLATE_NAME = "Fitdog VIP — Sky Blue";
export const SKY_BLUE_VIP_BUILTIN_ID = "builtin-sky-blue-vip";
export const SKY_BLUE_VIP_VERSION = 1;
export const SKY_FRONT_BARCODE_ID = "skyFrontBarcode";
export const SKY_BACK_BARCODE_ID = "skyBackBarcode";
export const SKY_FRONT_QR_ID = "skyFrontQr";

const SANS = "Arial, Helvetica, sans-serif";
const SCRIPT = "Georgia, 'Palatino Linotype', Palatino, Times, serif";

export function isSkyBlueVipBuiltinId(id?: string | null) {
  return id === SKY_BLUE_VIP_BUILTIN_ID;
}

export function isSkyBlueVipTemplate(template: {
  id?: string | null;
  name?: string | null;
}) {
  return isSkyBlueVipBuiltinId(template.id) || String(template.name ?? "") === SKY_BLUE_VIP_TEMPLATE_NAME;
}

export function builtinSkyBlueVipTemplate() {
  return {
    id: SKY_BLUE_VIP_BUILTIN_ID,
    name: SKY_BLUE_VIP_TEMPLATE_NAME,
    description:
      "Sky blue / aqua Fitdog VIP membership card. Native editable layers. Barcode is the Member ID number typed in Card Studio (Code 128, or UPC-A when that number is a valid 12-digit UPC-A).",
    category: "vip_member" as const,
    status: "active" as const,
    builtin: true,
    current_version_id: null,
    created_by: null,
    created_at: "2026-09-12T00:00:00.000Z",
    updated_at: "2026-09-12T00:00:00.000Z",
    version: SKY_BLUE_VIP_VERSION,
    versionId: null,
    document: createSkyBlueVipTemplateDocument()
  };
}

function layer(
  type: CardElement["type"],
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  properties: Record<string, unknown>,
  extra?: Partial<CardElement>
): CardElement {
  return createElement(type, {
    id,
    name,
    x,
    y,
    width,
    height,
    locked: false,
    properties,
    ...extra
  });
}

function copy(text: string, extras: Record<string, unknown> = {}) {
  return {
    text,
    fontFamily: SANS,
    fontSize: 13,
    fontWeight: 600,
    color: SKY.ink,
    textAlign: "left",
    verticalAlign: "middle",
    ...extras
  };
}

function barcodeProps() {
  return {
    symbology: "code128",
    source: "custom",
    value: "{{member.barcode}}",
    humanReadable: true,
    quietZone: 8,
    foreground: SKY.ink,
    background: SKY.white
  };
}

/**
 * Native CR80 layers matching the Sky Blue design reference.
 * Official Fitdog logo assets only. Member values are dynamic tokens, never Bailey / FD-0001.
 */
export function createSkyBlueVipTemplateDocument(): CardTemplateDocument {
  const doc = emptyTemplateDocument();
  doc.front.background = SKY.mist;
  doc.back.background = SKY.mist;

  doc.front.elements = [
    layer("svg", "sky_front_bg", "01_BACKGROUND_SKY", 0, 0, CR80_PX.width, CR80_PX.height, {
      markup: skyFrontBackgroundMarkup()
    }),
    layer("svg", "sky_front_coast", "02_BACKGROUND_COASTAL_GRAPHIC", 300, 390, 420, 230, {
      markup: coastalGraphicMarkup()
    }),
    layer("svg", "sky_front_paws", "03_BACKGROUND_PAW_PATTERN", 760, 420, 180, 180, {
      markup: pawPatternMarkup()
    }),
    layer("svg", "sky_front_wave", "16_DECORATIVE_WAVE", 0, 500, CR80_PX.width, 160, {
      markup: waveAccentMarkup()
    }),
    layer("logo", "sky_front_logo", "04_FITDOG_LOGO", 36, 24, 100, 100, {
      src: FITDOG_APPROVED_LOGO,
      fit: "contain"
    }),
    layer("text", "sky_front_wordmark", "04_FITDOG_WORDMARK", 150, 30, 320, 44, copy("FITDOG", {
      fontSize: 34,
      fontWeight: 800,
      letterSpacing: 1.2,
      color: SKY.orange
    })),
    layer("text", "sky_front_club", "04_CLUB_LINE", 150, 76, 320, 18, copy("HEALTH & SOCIAL CLUB", {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 1.4,
      color: SKY.ink
    })),
    layer("text", "sky_front_city_line", "15_LOCATION_HEADER", 150, 94, 240, 16, copy("SANTA MONICA, CA", {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 1.1
    })),
    layer("rectangle", "sky_front_city_rule", "15_LOCATION_RULE", 150, 112, 118, 3, {
      fill: SKY.ink,
      borderWidth: 0
    }),
    layer("text", "sky_front_tagline_1", "05_TAGLINE", 560, 24, 300, 34, copy("Happy Dogs.", {
      fontFamily: SCRIPT,
      fontSize: 24,
      fontWeight: 700,
      italic: true,
      textAlign: "right"
    })),
    layer("text", "sky_front_tagline_2", "05_TAGLINE_LINE_2", 560, 56, 300, 34, copy("Healthy Lives.", {
      fontFamily: SCRIPT,
      fontSize: 24,
      fontWeight: 700,
      italic: true,
      textAlign: "right"
    })),
    layer("svg", "sky_front_tag_paw", "03_TAGLINE_PAW", 868, 22, 42, 42, { markup: pawAccentMarkup() }),
    layer("svg", "sky_front_vip", "06_VIP_LABEL", 28, 150, 250, 210, { markup: vipScriptMarkup() }),
    layer("text", "sky_front_member_word", "06_VIP_MEMBER_WORD", 48, 330, 210, 28, copy("MEMBER", {
      fontSize: 22,
      fontWeight: 800,
      letterSpacing: 4,
      color: SKY.vip
    })),
    layer("text", "sky_front_name_label", "07_MEMBER_NAME_LABEL", 278, 156, 200, 14, copy("MEMBER NAME", {
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1.1,
      color: SKY.label
    })),
    layer("dynamic_field", "sky_front_owner", "07_MEMBER_NAME", 278, 170, 210, 26, copy("{{member.name}}", {
      fontSize: 18,
      fontWeight: 800,
      color: SKY.ink
    })),
    layer("text", "sky_front_dog_label", "07_DOG_NAME_LABEL", 278, 204, 200, 14, copy("DOG NAME", {
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1.1,
      color: SKY.label
    })),
    layer("dynamic_field", "sky_front_dog", "07_DOG_NAME", 278, 218, 210, 26, copy("{{member.dog_name}}", {
      fontSize: 18,
      fontWeight: 800
    })),
    layer("text", "sky_front_id_label", "08_MEMBER_ID_LABEL", 278, 252, 200, 14, copy("MEMBER NO.", {
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1.1,
      color: SKY.label
    })),
    layer("member_number", "sky_front_id", "08_MEMBER_ID", 278, 266, 210, 24, copy("{{member.member_number}}", {
      fontSize: 16,
      fontWeight: 800
    })),
    layer("text", "sky_front_type_label", "09_MEMBERSHIP_TYPE_LABEL", 278, 298, 200, 14, copy("MEMBERSHIP TYPE", {
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1.1,
      color: SKY.label
    })),
    layer("membership_type", "sky_front_type", "09_MEMBERSHIP_TYPE", 278, 312, 210, 24, copy("{{member.membership_type}}", {
      fontSize: 16,
      fontWeight: 800
    })),
    layer("text", "sky_front_exp_label", "10_EXPIRATION_LABEL", 278, 344, 200, 14, copy("EXPIRATION", {
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1.1,
      color: SKY.label
    })),
    layer("expiration_date", "sky_front_exp", "10_EXPIRATION", 278, 358, 210, 24, copy("{{member.expiration_date}}", {
      fontSize: 16,
      fontWeight: 800
    })),
    layer("rounded_rectangle", "sky_front_photo_frame", "11_DOG_PHOTO_FRAME", 500, 118, 288, 288, {
      fill: SKY.white,
      borderRadius: 18,
      borderWidth: 0
    }),
    layer("member_photo", MEMBER_PHOTO_SLOT_ID, "11_DOG_PHOTO", 510, 128, 268, 268, {
      src: "{{member.photo}}",
      fit: "cover",
      frame: "rounded_id",
      cropX: 50,
      cropY: 50,
      zoom: 1,
      borderRadius: 14,
      slotId: MEMBER_PHOTO_SLOT_ID
    }),
    layer("rounded_rectangle", "sky_front_qr_frame", "12_QR_FRAME", 812, 128, 164, 164, {
      fill: SKY.white,
      borderRadius: 12,
      borderWidth: 0
    }),
    layer("qr_code", SKY_FRONT_QR_ID, "12_QR_CODE", 824, 140, 140, 140, {
      contentType: "verification_url",
      value: "{{member.card_uuid}}",
      errorCorrection: "M",
      foreground: SKY.ink,
      background: SKY.white
    }),
    layer("member_number", "sky_front_qr_caption", "14_BARCODE_TEXT_QR", 812, 296, 164, 20, copy("{{member.member_number}}", {
      fontSize: 13,
      fontWeight: 800,
      textAlign: "center"
    })),
    layer("text", "sky_front_scan", "12_QR_CAPTION", 800, 318, 188, 36, copy("SCAN TO VERIFY MEMBERSHIP", {
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.6,
      textAlign: "center",
      color: SKY.ink
    })),
    layer("barcode", SKY_FRONT_BARCODE_ID, "13_BARCODE", 40, 500, 380, 86, barcodeProps()),
    layer("text", "sky_front_sm", "15_LOCATION", 760, 548, 220, 52, copy("Santa Monica CA", {
      fontFamily: SCRIPT,
      fontSize: 20,
      fontWeight: 700,
      italic: true,
      textAlign: "right",
      color: SKY.ink
    }))
  ];

  const services: Array<{ id: string; name: string; label: string; markup: string; x: number }> = [
    { id: "sky_back_daycare", name: "05_DAYCARE_ICON", label: "DAYCARE", markup: SERVICE_ICONS.daycare, x: 40 },
    { id: "sky_back_boarding", name: "06_BOARDING_ICON", label: "BOARDING", markup: SERVICE_ICONS.boarding, x: 148 },
    { id: "sky_back_training", name: "07_TRAINING_ICON", label: "TRAINING", markup: SERVICE_ICONS.training, x: 256 },
    { id: "sky_back_hikes", name: "08_HIKES_ICON", label: "HIKES", markup: SERVICE_ICONS.hikes, x: 364 },
    { id: "sky_back_beach", name: "09_BEACH_SWIM_ICON", label: "BEACH & SWIM", markup: SERVICE_ICONS.beach, x: 472 },
    { id: "sky_back_grooming", name: "10_GROOMING_ICON", label: "GROOMING", markup: SERVICE_ICONS.grooming, x: 580 }
  ];

  doc.back.elements = [
    layer("svg", "sky_back_bg", "01_BACKGROUND_SKY", 0, 0, CR80_PX.width, CR80_PX.height, {
      markup: skyBackBackgroundMarkup()
    }),
    layer("svg", "sky_back_coast", "02_COASTAL_GRAPHIC", 620, 160, 280, 180, {
      markup: coastalGraphicMarkup()
    }),
    layer("svg", "sky_back_paws", "17_PAW_GRAPHIC", 780, 8, 160, 160, {
      markup: pawPatternMarkup()
    }),
    layer("svg", "sky_back_wedge", "18_ORANGE_ACCENT_WEDGE", 731, 0, 280, CR80_PX.height, {
      markup: backWedgeMarkup()
    }),
    layer("logo", "sky_back_logo", "03_FITDOG_LOGO", 36, 24, 100, 100, {
      src: FITDOG_APPROVED_LOGO,
      fit: "contain"
    }),
    layer("text", "sky_back_wordmark", "03_FITDOG_WORDMARK", 150, 30, 320, 44, copy("FITDOG", {
      fontSize: 34,
      fontWeight: 800,
      letterSpacing: 1.2,
      color: SKY.orange
    })),
    layer("text", "sky_back_club", "03_CLUB_LINE", 150, 76, 320, 18, copy("HEALTH & SOCIAL CLUB", {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 1.4
    })),
    layer("text", "sky_back_city_line", "13_LOCATION_HEADER", 150, 94, 240, 16, copy("SANTA MONICA, CA", {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 1.1
    })),
    layer("rectangle", "sky_back_city_rule", "13_LOCATION_RULE", 150, 112, 118, 3, {
      fill: SKY.ink,
      borderWidth: 0
    }),
    layer("text", "sky_back_headline_1", "04_BACK_HEADLINE", 470, 22, 250, 30, copy("More Play.", {
      fontFamily: SCRIPT,
      fontSize: 22,
      fontWeight: 700,
      italic: true,
      textAlign: "right"
    })),
    layer("text", "sky_back_headline_2", "04_BACK_HEADLINE_2", 470, 50, 250, 30, copy("More Adventures.", {
      fontFamily: SCRIPT,
      fontSize: 22,
      fontWeight: 700,
      italic: true,
      textAlign: "right"
    })),
    layer("text", "sky_back_headline_3", "04_BACK_HEADLINE_3", 470, 78, 250, 30, copy("More Good Dogs.", {
      fontFamily: SCRIPT,
      fontSize: 22,
      fontWeight: 700,
      italic: true,
      textAlign: "right"
    })),
    ...services.flatMap((svc, index) => [
      layer("icon", svc.id, svc.name, svc.x, 250, 88, 88, { markup: svc.markup }),
      layer("text", `${svc.id}_label`, "11_SERVICE_LABELS", svc.x - 10, 338, 108, 28, copy(svc.label, {
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.4,
        textAlign: "center"
      })),
      ...(index < services.length - 1
        ? [
            layer("line", `${svc.id}_rule`, "11_SERVICE_DIVIDER", svc.x + 100, 268, 3, 48, {
              fill: SKY.lagoon,
              borderColor: SKY.lagoon,
              borderWidth: 0
            })
          ]
        : [])
    ]),
    layer("text", "sky_back_club_sports", "12_MEMBERSHIP_LABEL", 40, 500, 280, 24, copy("CLUB + SPORTS MEMBER", {
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: 1.4,
      color: SKY.ink
    })),
    layer("svg", "sky_back_swoosh", "18_ORANGE_ACCENT", 40, 528, 220, 16, { markup: orangeSwooshMarkup() }),
    layer("svg", "sky_back_pin", "13_LOCATION_PIN", 300, 502, 22, 28, { markup: pinMarkup() }),
    layer("location", "sky_back_location", "13_LOCATION", 328, 504, 200, 24, copy("SANTA MONICA, CA", {
      fontSize: 12,
      fontWeight: 800
    })),
    layer("barcode", SKY_BACK_BARCODE_ID, "15_BARCODE", 500, 478, 240, 88, barcodeProps()),
    layer("text", "sky_back_verify", "14_VERIFICATION_LABEL", 790, 470, 180, 80, copy("Scan for Exclusive Perks", {
      fontFamily: SCRIPT,
      fontSize: 20,
      fontWeight: 700,
      italic: true,
      color: SKY.white,
      textAlign: "center"
    }), { rotation: -18 }),
    layer("svg", "sky_back_wedge_paw", "17_WEDGE_PAW", 868, 390, 48, 48, { markup: pawAccentMarkup(SKY.white) })
  ];

  return doc;
}
