import { CR80_PX, FITDOG_PRINT_COLORS } from "@/lib/card-studio/constants";
import { MEMBER_PHOTO_SLOT_ID } from "@/lib/card-studio/photo-slot";
import { createElement, emptyTemplateDocument } from "@/lib/card-studio/template-schema";
import type { CardElement, CardTemplateDocument } from "@/lib/card-studio/types";

export const MEMBER_DOG_NAME_SLOT_ID = "memberDogNameSlot";
export const MEMBER_ID_SLOT_ID = "memberIdSlot";
export const OWNER_BARCODE_SLOT_ID = "ownerBarcodeSlot";

export const CLUB_SPORTS_VIP_TEMPLATE_NAME = "Fitdog Club + Sports VIP";
export const CLUB_SPORTS_VIP_BUILTIN_ID = "builtin-club-sports-vip";

/** Locked raster faces from Fitdog_VIP_EXACT_ARTWORK_CardStudio_v2. Do not regenerate. */
export const CLUB_SPORTS_VIP_EXACT_ARTWORK = {
  frontSrc: "/assets/fitdog/card-studio/exact-vip/FITDOG_VIP_FRONT_EXACT.png",
  backSrc: "/assets/fitdog/card-studio/exact-vip/FITDOG_VIP_BACK_EXACT.png",
  masterSrc: "/assets/fitdog/card-studio/exact-vip/FITDOG_VIP_MASTER_EXACT.png",
  frontNative: { width: 975, height: 455 },
  backNative: { width: 975, height: 418 },
  frontSha256: "d4e0426c5f6a06a82b4216376bf75fd11c2182d88f03f6f60a75dcc44956b44a",
  backSha256: "383276d828f849ea001cf7e20820c8426d530fbfc912c40bc99ddd3e8d667819",
  masterSha256: "b7402a9e0b00ba74c71711404752ace76a693d8ce34f1f358606346310eedea5"
} as const;

export function isClubSportsVipBuiltinId(id?: string | null) {
  return id === CLUB_SPORTS_VIP_BUILTIN_ID;
}

export function documentUsesExactClubSportsArtwork(doc: CardTemplateDocument | null | undefined) {
  if (!doc) return false;
  const front = doc.front.elements.some((el) => String(el.properties.src ?? "") === CLUB_SPORTS_VIP_EXACT_ARTWORK.frontSrc);
  const back = doc.back.elements.some((el) => String(el.properties.src ?? "") === CLUB_SPORTS_VIP_EXACT_ARTWORK.backSrc);
  return front && back;
}

export function containRect(
  srcW: number,
  srcH: number,
  destW: number,
  destH: number
): { x: number; y: number; width: number; height: number; scale: number } {
  const scale = Math.min(destW / srcW, destH / srcH);
  const width = srcW * scale;
  const height = srcH * scale;
  return {
    x: (destW - width) / 2,
    y: (destH - height) / 2,
    width,
    height,
    scale
  };
}

export function mapNativeBox(
  native: { x: number; y: number; width: number; height: number },
  placed: { x: number; y: number; scale: number }
) {
  return {
    x: Math.round(placed.x + native.x * placed.scale),
    y: Math.round(placed.y + native.y * placed.scale),
    width: Math.round(native.width * placed.scale),
    height: Math.round(native.height * placed.scale)
  };
}

export function clubSportsVipArtworkAspectWarning() {
  const native = CLUB_SPORTS_VIP_EXACT_ARTWORK.frontNative.width / CLUB_SPORTS_VIP_EXACT_ARTWORK.frontNative.height;
  const canvas = CR80_PX.width / CR80_PX.height;
  if (Math.abs(native - canvas) <= 0.02) return null;
  return `Exact VIP artwork is ${CLUB_SPORTS_VIP_EXACT_ARTWORK.frontNative.width}×${CLUB_SPORTS_VIP_EXACT_ARTWORK.frontNative.height} (aspect ${native.toFixed(3)}). CR80 is ${CR80_PX.width}×${CR80_PX.height} (aspect ${canvas.toFixed(3)}). The PNG is letterboxed, not stretched.`;
}

export function builtinClubSportsVipTemplate() {
  return {
    id: CLUB_SPORTS_VIP_BUILTIN_ID,
    name: CLUB_SPORTS_VIP_TEMPLATE_NAME,
    description:
      "Production Club + Sports VIP template. Type the Member ID number to print it on the card and generate the barcode.",
    category: "club_sports_vip" as const,
    status: "active" as const,
    builtin: true,
    current_version_id: null,
    created_by: null,
    created_at: "2026-09-11T00:00:00.000Z",
    updated_at: "2026-09-11T00:00:00.000Z",
    version: 1,
    versionId: null,
    document: createClubSportsVipTemplateDocument()
  };
}

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

/** Native-pixel overlay boxes on FRONT_EXACT / BACK_EXACT (not CR80). */
const FRONT_PHOTO_NATIVE = { x: 34, y: 26, width: 282, height: 292 };
const FRONT_NAME_NATIVE = { x: 36, y: 398, width: 220, height: 36 };
const FRONT_NUMBER_NATIVE = { x: 276, y: 398, width: 220, height: 36 };
const BACK_BARCODE_NATIVE = { x: 225, y: 304, width: 460, height: 95 };

/**
 * Exact supplied PNGs as locked artwork. Member overlays cover only Bailey / FD-0001 / sample barcode
 * when those fields are present. Empty overlays leave the supplied artwork untouched.
 */
export function createClubSportsVipTemplateDocument(): CardTemplateDocument {
  const doc = emptyTemplateDocument();
  doc.front.background = C.white;
  doc.back.background = C.orange;

  const frontPlace = containRect(
    CLUB_SPORTS_VIP_EXACT_ARTWORK.frontNative.width,
    CLUB_SPORTS_VIP_EXACT_ARTWORK.frontNative.height,
    CR80_PX.width,
    CR80_PX.height
  );
  const backPlace = containRect(
    CLUB_SPORTS_VIP_EXACT_ARTWORK.backNative.width,
    CLUB_SPORTS_VIP_EXACT_ARTWORK.backNative.height,
    CR80_PX.width,
    CR80_PX.height
  );
  const photo = mapNativeBox(FRONT_PHOTO_NATIVE, frontPlace);
  const name = mapNativeBox(FRONT_NAME_NATIVE, frontPlace);
  const number = mapNativeBox(FRONT_NUMBER_NATIVE, frontPlace);
  const barcode = mapNativeBox(BACK_BARCODE_NATIVE, backPlace);

  doc.front.elements = [
    locked("background", "cs_front_bg", 0, 0, CR80_PX.width, CR80_PX.height, { fill: C.white, opacity: 1 }),
    locked(
      "image",
      "cs_front_exact_art",
      Math.round(frontPlace.x),
      Math.round(frontPlace.y),
      Math.round(frontPlace.width),
      Math.round(frontPlace.height),
      {
        src: CLUB_SPORTS_VIP_EXACT_ARTWORK.frontSrc,
        fit: "contain",
        opacity: 1,
        exactArtwork: true,
        nativeWidth: CLUB_SPORTS_VIP_EXACT_ARTWORK.frontNative.width,
        nativeHeight: CLUB_SPORTS_VIP_EXACT_ARTWORK.frontNative.height
      },
      { name: "Exact front artwork" }
    ),
    locked(
      "member_photo",
      MEMBER_PHOTO_SLOT_ID,
      photo.x,
      photo.y,
      photo.width,
      photo.height,
      {
        src: "{{member.photo}}",
        slotId: MEMBER_PHOTO_SLOT_ID,
        fit: "cover",
        frame: "rounded_id",
        cropX: 50,
        cropY: 42,
        zoom: 1,
        borderRadius: Math.round(18 * frontPlace.scale),
        opacity: 1,
        keepArtworkWhenEmpty: true
      },
      { name: "Member photo slot" }
    ),
    locked(
      "dynamic_field",
      MEMBER_DOG_NAME_SLOT_ID,
      name.x,
      name.y,
      name.width,
      name.height,
      {
        text: "{{member.dog_name}}",
        fontSize: Math.round(22 * frontPlace.scale),
        fontWeight: 800,
        letterSpacing: 0.6,
        color: C.slate,
        textTransform: "uppercase",
        background: C.white,
        keepArtworkWhenEmpty: true
      },
      { name: "Dog name" }
    ),
    locked(
      "member_number",
      MEMBER_ID_SLOT_ID,
      number.x,
      number.y,
      number.width,
      number.height,
      {
        text: "{{member.member_number}}",
        fontSize: Math.round(16 * frontPlace.scale),
        fontWeight: 800,
        color: C.slate,
        background: C.white,
        keepArtworkWhenEmpty: true
      },
      { name: "Member ID" }
    )
  ];

  doc.back.elements = [
    locked("background", "cs_back_bg", 0, 0, CR80_PX.width, CR80_PX.height, { fill: C.orange, opacity: 1 }),
    locked(
      "image",
      "cs_back_exact_art",
      Math.round(backPlace.x),
      Math.round(backPlace.y),
      Math.round(backPlace.width),
      Math.round(backPlace.height),
      {
        src: CLUB_SPORTS_VIP_EXACT_ARTWORK.backSrc,
        fit: "contain",
        opacity: 1,
        exactArtwork: true,
        nativeWidth: CLUB_SPORTS_VIP_EXACT_ARTWORK.backNative.width,
        nativeHeight: CLUB_SPORTS_VIP_EXACT_ARTWORK.backNative.height
      },
      { name: "Exact back artwork" }
    ),
    locked(
      "barcode",
      OWNER_BARCODE_SLOT_ID,
      barcode.x,
      barcode.y,
      barcode.width,
      barcode.height,
      {
        symbology: "code128",
        source: "custom",
        value: "{{member.barcode}}",
        humanReadable: true,
        quietZone: 16,
        foreground: C.slate,
        background: C.white,
        keepArtworkWhenEmpty: true
      },
      { name: "Member ID barcode" }
    )
  ];

  return doc;
}

export function isClubSportsVipTemplate(template: { id?: string | null; name?: string | null; document?: CardTemplateDocument | null }) {
  return (
    isClubSportsVipBuiltinId(template.id) ||
    String(template.name ?? "") === CLUB_SPORTS_VIP_TEMPLATE_NAME ||
    String(template.name ?? "").includes("Club + Sports VIP") ||
    documentUsesExactClubSportsArtwork(template.document)
  );
}

/** Always the designed production document. Member data is bound at render time, never written into this template. */
export function productionClubSportsVipDocument(_existing?: CardTemplateDocument | null): CardTemplateDocument {
  return createClubSportsVipTemplateDocument();
}
