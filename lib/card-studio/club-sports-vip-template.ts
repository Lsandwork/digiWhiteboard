import { CR80_PX, FITDOG_APPROVED_LOGO, FITDOG_PRINT_COLORS } from "@/lib/card-studio/constants";
import { createElement, emptyTemplateDocument } from "@/lib/card-studio/template-schema";
import type { CardElement, CardTemplateDocument } from "@/lib/card-studio/types";

export const CLUB_SPORTS_VIP_TEMPLATE_NAME = "Fitdog Club + Sports VIP";

const C = FITDOG_PRINT_COLORS;

function locked(
  type: CardElement["type"],
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  properties: Record<string, unknown>,
  extra?: Partial<CardElement>
): CardElement {
  return createElement(type, {
    id,
    x,
    y,
    width,
    height,
    locked: true,
    name: extra?.name,
    properties,
    ...extra
  });
}

function editable(
  type: CardElement["type"],
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  properties: Record<string, unknown>,
  extra?: Partial<CardElement>
): CardElement {
  return createElement(type, {
    id,
    x,
    y,
    width,
    height,
    locked: false,
    name: extra?.name,
    properties,
    ...extra
  });
}

function paw(cx: number, cy: number, scale: number, opacity = 0.22) {
  const s = scale;
  return `<g fill="#ffffff" opacity="${opacity}" transform="translate(${cx} ${cy}) scale(${s})">
    <ellipse cx="0" cy="6" rx="10" ry="8"/>
    <ellipse cx="-12" cy="-6" rx="5" ry="6"/>
    <ellipse cx="-4" cy="-11" rx="5" ry="6"/>
    <ellipse cx="5" cy="-11" rx="5" ry="6"/>
    <ellipse cx="13" cy="-5" rx="5" ry="6"/>
  </g>`;
}

function palms() {
  return `<g fill="#c74e12" opacity="0.38">
    <ellipse cx="860" cy="430" rx="18" ry="70"/>
    <ellipse cx="890" cy="400" rx="16" ry="64"/>
    <ellipse cx="930" cy="420" rx="14" ry="58"/>
    <path d="M820 360 C860 300 900 280 980 250 C940 330 900 350 860 390 Z"/>
    <path d="M840 300 C900 240 960 210 1010 190 C980 280 920 310 870 340 Z"/>
    <rect x="868" y="470" width="10" height="120" rx="4"/>
    <rect x="896" y="450" width="9" height="140" rx="4"/>
    <rect x="934" y="460" width="8" height="130" rx="4"/>
  </g>`;
}

function frontPanelMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CR80_PX.width}" height="${CR80_PX.height}" viewBox="0 0 ${CR80_PX.width} ${CR80_PX.height}">
    <polygon points="640,0 1011,0 1011,638 498,638" fill="${C.orange}"/>
    <polygon points="760,0 1011,0 1011,280 880,160" fill="#e05f12" opacity="0.28"/>
    ${palms()}
    ${paw(910, 48, 1.15, 0.2)}
    ${paw(780, 210, 0.72, 0.16)}
    ${paw(940, 300, 0.55, 0.18)}
    <g fill="#ffffff" font-family="Arial Black, Impact, Arial, sans-serif" font-size="17" font-weight="800" letter-spacing="1.6">
      <text transform="rotate(-56 868 168)" x="790" y="150">MORE PLAY.</text>
      <text transform="rotate(-56 888 230)" x="786" y="212">MORE ADVENTURE.</text>
      <text transform="rotate(-56 908 292)" x="800" y="274">MORE TOGETHER.</text>
    </g>
  </svg>`;
}

function crownMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="54" height="36" viewBox="0 0 54 36">
    <path d="M6 28 L10 10 L20 20 L27 6 L34 20 L44 10 L48 28 Z" fill="${C.orange}"/>
    <rect x="8" y="26" width="38" height="6" rx="2" fill="${C.orange}"/>
  </svg>`;
}

function backDecorMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CR80_PX.width}" height="${CR80_PX.height}" viewBox="0 0 ${CR80_PX.width} ${CR80_PX.height}">
    <rect width="${CR80_PX.width}" height="${CR80_PX.height}" fill="${C.orange}"/>
    <g fill="#c74e12" opacity="0.28">
      <ellipse cx="900" cy="420" rx="20" ry="80"/>
      <ellipse cx="940" cy="390" rx="16" ry="70"/>
      <path d="M820 300 C900 220 980 180 1011 160 C980 280 920 320 860 360 Z"/>
    </g>
    ${paw(960, 40, 1.3, 0.16)}
  </svg>`;
}

function serviceIconsMarkup() {
  const items: Array<{ x: number; title: string; sub: string; icon: string }> = [
    {
      x: 70,
      title: "DAYCARE",
      sub: "PLAY. MAKE FRIENDS.\nBE HAPPY.",
      icon: `<path d="M16 26 V14 L28 6 L40 14 V26 H16 Z" fill="none" stroke="${C.white}" stroke-width="2.2"/><rect x="24" y="18" width="8" height="8" fill="none" stroke="${C.white}" stroke-width="2"/>`
    },
    {
      x: 230,
      title: "BOARDING",
      sub: "SAFE. COMFY.\nLOVED.",
      icon: `<rect x="12" y="18" width="32" height="16" rx="3" fill="none" stroke="${C.white}" stroke-width="2.2"/><path d="M16 18 C16 10 40 10 40 18" fill="none" stroke="${C.white}" stroke-width="2.2"/>`
    },
    {
      x: 390,
      title: "TRAINING",
      sub: "BUILD SKILLS.\nGAIN CONFIDENCE.",
      icon: `<rect x="14" y="12" width="10" height="24" rx="2" fill="none" stroke="${C.white}" stroke-width="2.2"/><circle cx="36" cy="18" r="8" fill="none" stroke="${C.white}" stroke-width="2.2"/>`
    },
    {
      x: 550,
      title: "HIKES",
      sub: "EXPLORE. BREATHE.\nBE A DOG.",
      icon: `<path d="M8 34 L20 14 L28 24 L38 10 L48 34 Z" fill="none" stroke="${C.white}" stroke-width="2.2"/>`
    },
    {
      x: 710,
      title: "BEACH & SWIM",
      sub: "SAND. SURF.\nSMILES.",
      icon: `<path d="M10 28 C16 22 22 34 28 28 C34 22 40 34 46 28" fill="none" stroke="${C.white}" stroke-width="2.2"/><circle cx="38" cy="16" r="6" fill="none" stroke="${C.white}" stroke-width="2.2"/>`
    },
    {
      x: 870,
      title: "SPORTS",
      sub: "TRAIN. PLAY.\nTHRIVE.",
      icon: `<circle cx="28" cy="22" r="12" fill="none" stroke="${C.white}" stroke-width="2.2"/><path d="M28 10 V34 M16 22 H40" stroke="${C.white}" stroke-width="2"/>`
    }
  ];
  const parts = items.map((item) => {
    const lines = item.sub.split("\n");
    return `<g transform="translate(${item.x} 0)">
      <circle cx="36" cy="36" r="34" fill="none" stroke="${C.white}" stroke-width="2.4"/>
      <g transform="translate(8 8)">${item.icon}</g>
      <text x="36" y="92" text-anchor="middle" fill="${C.white}" font-size="11" font-weight="800" font-family="Arial, Helvetica, sans-serif" letter-spacing="0.8">${item.title}</text>
      <text x="36" y="108" text-anchor="middle" fill="${C.white}" font-size="8" font-weight="600" font-family="Arial, Helvetica, sans-serif">${lines[0]}</text>
      <text x="36" y="120" text-anchor="middle" fill="${C.white}" font-size="8" font-weight="600" font-family="Arial, Helvetica, sans-serif">${lines[1] ?? ""}</text>
    </g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CR80_PX.width}" height="140" viewBox="0 0 ${CR80_PX.width} 140">${parts.join("")}</svg>`;
}

/** Print-ready Club + Sports VIP CR80. Official Fitdog badge only — never a generated logo. */
export function createClubSportsVipTemplateDocument(): CardTemplateDocument {
  const doc = emptyTemplateDocument();
  doc.front.background = C.white;
  doc.back.background = C.orange;

  doc.front.elements = [
    locked("background", "cs_front_bg", 0, 0, CR80_PX.width, CR80_PX.height, { fill: C.white, opacity: 1 }),
    locked("svg", "cs_front_panel", 0, 0, CR80_PX.width, CR80_PX.height, { markup: frontPanelMarkup(), opacity: 1 }, { name: "Orange panel" }),
    editable(
      "member_photo",
      "cs_vip_photo",
      28,
      28,
      268,
      336,
      {
        src: "{{member.photo}}",
        fit: "cover",
        frame: "rounded_id",
        cropX: 50,
        cropY: 42,
        zoom: 1,
        borderRadius: 22,
        opacity: 1
      },
      { name: "Member photo" }
    ),
    locked("logo", "cs_front_logo", 318, 28, 58, 58, { src: FITDOG_APPROVED_LOGO, fit: "contain", opacity: 1 }, { name: "Fitdog logo" }),
    locked("text", "cs_front_wordmark", 384, 30, 250, 34, {
      text: "fitdog",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: 28,
      fontWeight: 800,
      color: C.blue,
      textAlign: "left",
      letterSpacing: -0.4
    }),
    locked("text", "cs_front_tagline", 384, 64, 260, 18, {
      text: "HEALTH & SOCIAL CLUB",
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1.4,
      color: C.slate
    }),
    locked("location", "cs_front_city_brand", 384, 80, 260, 16, {
      text: "{{member.location}}",
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1.2,
      color: C.slate
    }),
    locked("svg", "cs_front_crown", 430, 108, 54, 36, { markup: crownMarkup(), opacity: 1 }, { name: "VIP crown" }),
    locked("text", "cs_front_vip", 318, 132, 340, 78, {
      text: "VIP",
      fontFamily: "Arial Black, Impact, Arial, sans-serif",
      fontSize: 64,
      fontWeight: 800,
      color: C.orange,
      letterSpacing: 2
    }),
    locked("membership_type", "cs_front_type", 318, 214, 340, 24, {
      text: "CLUB + SPORTS MEMBER",
      fontSize: 14,
      fontWeight: 800,
      letterSpacing: 1.1,
      color: C.slate
    }),
    locked("text", "cs_front_services", 318, 242, 360, 22, {
      text: "Daycare. Boarding. Training. Hikes. Beach. Sports.",
      fontSize: 12,
      fontWeight: 500,
      italic: true,
      color: C.blue
    }),
    locked("text", "cs_front_name_label", 28, 384, 220, 16, {
      text: "NAME:",
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: 1,
      color: C.orange
    }),
    editable(
      "dynamic_field",
      "cs_vip_dog_name",
      28,
      404,
      250,
      36,
      {
        text: "{{member.dog_name}}",
        fontSize: 22,
        fontWeight: 800,
        letterSpacing: 0.6,
        color: C.slate,
        textTransform: "uppercase"
      },
      { name: "Dog name" }
    ),
    locked("text", "cs_front_num_label", 292, 384, 200, 16, {
      text: "MEMBER NO.:",
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: 1,
      color: C.orange
    }),
    editable(
      "member_number",
      "cs_vip_member_number",
      292,
      404,
      200,
      32,
      {
        text: "{{member.member_number}}",
        fontSize: 16,
        fontWeight: 800,
        color: C.slate
      },
      { name: "Member number" }
    ),
    locked("text", "cs_front_loc_label", 500, 384, 240, 16, {
      text: "CLUB LOCATION:",
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: 1,
      color: C.orange
    }),
    editable(
      "location",
      "cs_vip_location",
      500,
      404,
      240,
      32,
      {
        text: "{{member.location}}",
        fontSize: 14,
        fontWeight: 800,
        color: C.slate
      },
      { name: "Club location" }
    )
  ];

  doc.back.elements = [
    locked("svg", "cs_back_decor", 0, 0, CR80_PX.width, CR80_PX.height, { markup: backDecorMarkup(), opacity: 1 }, { name: "Back field" }),
    locked("logo", "cs_back_logo", 36, 28, 64, 64, { src: FITDOG_APPROVED_LOGO, fit: "contain", opacity: 1 }, { name: "Fitdog logo" }),
    locked("text", "cs_back_wordmark", 110, 32, 280, 32, {
      text: "fitdog",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: 26,
      fontWeight: 800,
      color: C.white
    }),
    locked("text", "cs_back_tagline", 110, 64, 300, 16, {
      text: "HEALTH & SOCIAL CLUB",
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1.3,
      color: C.white
    }),
    locked("location", "cs_back_city", 110, 80, 300, 16, {
      text: "{{member.location}}",
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: 1.1,
      color: C.white
    }),
    locked("text", "cs_back_happy", 520, 36, 460, 36, {
      text: "Happy Dogs.",
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontSize: 28,
      fontWeight: 700,
      italic: true,
      color: C.white,
      textAlign: "right"
    }),
    locked("text", "cs_back_healthy", 520, 74, 460, 36, {
      text: "Healthy Lives.",
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontSize: 28,
      fontWeight: 700,
      italic: true,
      color: C.white,
      textAlign: "right"
    }),
    locked("svg", "cs_back_icons", 0, 150, CR80_PX.width, 140, { markup: serviceIconsMarkup(), opacity: 1 }, { name: "Services" }),
    locked("text", "cs_back_script", 40, 430, 420, 40, {
      text: "Club + Sports Member",
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontSize: 22,
      fontWeight: 700,
      italic: true,
      color: C.white
    }),
    editable(
      "barcode",
      "cs_vip_barcode",
      300,
      500,
      410,
      72,
      {
        symbology: "code128",
        value: "{{member.member_number}}",
        humanReadable: true,
        quietZone: 8,
        foreground: C.slate,
        background: C.white
      },
      { name: "Barcode" }
    ),
    locked("location", "cs_back_pin", 740, 536, 240, 24, {
      text: "{{member.location}}",
      fontSize: 11,
      fontWeight: 700,
      color: C.white,
      textAlign: "right"
    })
  ];

  return doc;
}
