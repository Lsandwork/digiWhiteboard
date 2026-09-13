import { CR80_PX } from "@/lib/card-studio/constants";
import { containRect, mapNativeBox } from "@/lib/card-studio/club-sports-vip-template";
import { MEMBER_PHOTO_SLOT_ID } from "@/lib/card-studio/photo-slot";
import { createElement, emptyTemplateDocument } from "@/lib/card-studio/template-schema";
import type { CardElement, CardTemplateDocument } from "@/lib/card-studio/types";

export const SKY_BLUE_VIP_TEMPLATE_NAME = "Fitdog VIP — Sky Blue";
export const SKY_BLUE_VIP_BUILTIN_ID = "builtin-sky-blue-vip";
export const SKY_BLUE_VIP_VERSION = 2;
export const SKY_FRONT_BARCODE_ID = "skyFrontBarcode";
export const SKY_BACK_BARCODE_ID = "skyBackBarcode";
export const SKY_FRONT_QR_ID = "skyFrontQr";
export const SKY_FRONT_NAME_ID = "skyFrontOwnerName";
export const SKY_FRONT_DOG_ID = "skyFrontDogName";
export const SKY_FRONT_ID_ID = "skyFrontMemberId";
export const SKY_FRONT_TYPE_ID = "skyFrontMembershipType";
export const SKY_FRONT_EXP_ID = "skyFrontExpiration";

/** Locked raster faces from Fitdog_VIP_Sky_Blue_Graphics_Assets. Do not regenerate. */
export const SKY_BLUE_VIP_EXACT_ARTWORK = {
  frontSrc: "/assets/fitdog/card-studio/sky-blue-vip/FITDOG_VIP_SKY_BLUE_FRONT.png",
  backSrc: "/assets/fitdog/card-studio/sky-blue-vip/FITDOG_VIP_SKY_BLUE_BACK.png",
  frontNative: { width: 1025, height: 500 },
  backNative: { width: 1025, height: 440 },
  frontSha256: "5f9813bdd2cb3a270bd23cd51a53c6ef96e5d337315ee9924980d7daf2e5fe1d",
  backSha256: "e9a41c6bd4493f5a1d38444fad3b263013bdc9eb7d8d41a1624ecb7a6b519b45"
} as const;

const INK = "#1C4E76";
const WHITE = "#FFFFFF";
const BAR = "#111111";

export function isSkyBlueVipBuiltinId(id?: string | null) {
  return id === SKY_BLUE_VIP_BUILTIN_ID;
}

export function documentUsesExactSkyBlueArtwork(doc: CardTemplateDocument | null | undefined) {
  if (!doc) return false;
  const front = doc.front.elements.some((el) => String(el.properties.src ?? "") === SKY_BLUE_VIP_EXACT_ARTWORK.frontSrc);
  const back = doc.back.elements.some((el) => String(el.properties.src ?? "") === SKY_BLUE_VIP_EXACT_ARTWORK.backSrc);
  return front && back;
}

export function isSkyBlueVipTemplate(template: {
  id?: string | null;
  name?: string | null;
  document?: CardTemplateDocument | null;
}) {
  return (
    isSkyBlueVipBuiltinId(template.id) ||
    String(template.name ?? "") === SKY_BLUE_VIP_TEMPLATE_NAME ||
    documentUsesExactSkyBlueArtwork(template.document)
  );
}

export function builtinSkyBlueVipTemplate() {
  return {
    id: SKY_BLUE_VIP_BUILTIN_ID,
    name: SKY_BLUE_VIP_TEMPLATE_NAME,
    description:
      "Production Sky Blue VIP card using the supplied Fitdog artwork. Type the Member ID number to print it and generate the barcode. Replace photo fills the ID window.",
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

/**
 * Native-pixel overlay boxes on the supplied Sky Blue PNGs (not CR80).
 * Value boxes cover Bailey / FD-0001 / sample VIP / date only so labels stay in the art.
 * Photo covers the dog window so the sample retriever never prints through.
 */
export const SKY_BLUE_VIP_NATIVE_SLOTS = {
  photo: { x: 538, y: 106, width: 304, height: 318 },
  ownerValue: { x: 336, y: 172, width: 198, height: 20 },
  dogValue: { x: 336, y: 220, width: 198, height: 20 },
  memberValue: { x: 336, y: 284, width: 198, height: 20 },
  typeValue: { x: 336, y: 332, width: 198, height: 18 },
  expValue: { x: 336, y: 376, width: 198, height: 18 },
  qr: { x: 858, y: 144, width: 120, height: 114 },
  qrCaption: { x: 850, y: 262, width: 140, height: 22 },
  frontBarcode: { x: 56, y: 400, width: 328, height: 78 },
  backBarcode: { x: 599, y: 327, width: 283, height: 80 }
} as const;

function fieldProps(text: string, fontSize: number) {
  return {
    text,
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize,
    fontWeight: 800,
    color: INK,
    textAlign: "left" as const,
    verticalAlign: "middle" as const,
    background: WHITE,
    keepArtworkWhenEmpty: true
  };
}

function barcodeProps() {
  return {
    symbology: "code128",
    source: "custom",
    value: "{{member.barcode}}",
    humanReadable: true,
    quietZone: 8,
    foreground: BAR,
    background: WHITE,
    keepArtworkWhenEmpty: true
  };
}

/**
 * Exact supplied Sky Blue PNGs as locked artwork. Dynamic overlays cover sample
 * Bailey / FD-0001 / photo / QR / barcode when member data is present.
 */
export function createSkyBlueVipTemplateDocument(): CardTemplateDocument {
  const doc = emptyTemplateDocument();
  doc.front.background = "#C8EDF8";
  doc.back.background = "#C8EDF8";

  const frontPlace = containRect(
    SKY_BLUE_VIP_EXACT_ARTWORK.frontNative.width,
    SKY_BLUE_VIP_EXACT_ARTWORK.frontNative.height,
    CR80_PX.width,
    CR80_PX.height
  );
  const backPlace = containRect(
    SKY_BLUE_VIP_EXACT_ARTWORK.backNative.width,
    SKY_BLUE_VIP_EXACT_ARTWORK.backNative.height,
    CR80_PX.width,
    CR80_PX.height
  );
  const S = SKY_BLUE_VIP_NATIVE_SLOTS;
  const photo = mapNativeBox(S.photo, frontPlace);
  const owner = mapNativeBox(S.ownerValue, frontPlace);
  const dog = mapNativeBox(S.dogValue, frontPlace);
  const member = mapNativeBox(S.memberValue, frontPlace);
  const type = mapNativeBox(S.typeValue, frontPlace);
  const exp = mapNativeBox(S.expValue, frontPlace);
  const qr = mapNativeBox(S.qr, frontPlace);
  const qrCaption = mapNativeBox(S.qrCaption, frontPlace);
  const frontBarcode = mapNativeBox(S.frontBarcode, frontPlace);
  const backBarcode = mapNativeBox(S.backBarcode, backPlace);
  const typeSize = Math.max(12, Math.round(15 * frontPlace.scale));

  doc.front.elements = [
    locked("background", "sky_front_bg", 0, 0, CR80_PX.width, CR80_PX.height, {
      fill: "#C8EDF8",
      opacity: 1,
      borderWidth: 0,
      borderColor: "none"
    }),
    locked(
      "image",
      "sky_front_exact_art",
      Math.round(frontPlace.x),
      Math.round(frontPlace.y),
      Math.round(frontPlace.width),
      Math.round(frontPlace.height),
      {
        src: SKY_BLUE_VIP_EXACT_ARTWORK.frontSrc,
        fit: "contain",
        opacity: 1,
        exactArtwork: true,
        nativeWidth: SKY_BLUE_VIP_EXACT_ARTWORK.frontNative.width,
        nativeHeight: SKY_BLUE_VIP_EXACT_ARTWORK.frontNative.height
      },
      { name: "01_BACKGROUND_SKY" }
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
        cropY: 50,
        zoom: 1,
        borderRadius: Math.round(16 * frontPlace.scale),
        opacity: 1,
        keepArtworkWhenEmpty: true
      },
      { name: "11_DOG_PHOTO" }
    ),
    locked("dynamic_field", SKY_FRONT_NAME_ID, owner.x, owner.y, owner.width, owner.height, fieldProps("{{member.name}}", typeSize), {
      name: "07_MEMBER_NAME"
    }),
    locked("dynamic_field", SKY_FRONT_DOG_ID, dog.x, dog.y, dog.width, dog.height, fieldProps("{{member.dog_name}}", typeSize), {
      name: "07_DOG_NAME"
    }),
    locked("member_number", SKY_FRONT_ID_ID, member.x, member.y, member.width, member.height, fieldProps("{{member.member_number}}", typeSize), {
      name: "08_MEMBER_ID"
    }),
    locked(
      "membership_type",
      SKY_FRONT_TYPE_ID,
      type.x,
      type.y,
      type.width,
      type.height,
      fieldProps("{{member.membership_type}}", typeSize),
      { name: "09_MEMBERSHIP_TYPE" }
    ),
    locked(
      "expiration_date",
      SKY_FRONT_EXP_ID,
      exp.x,
      exp.y,
      exp.width,
      exp.height,
      fieldProps("{{member.expiration_date}}", typeSize),
      { name: "10_EXPIRATION" }
    ),
    locked(
      "qr_code",
      SKY_FRONT_QR_ID,
      qr.x,
      qr.y,
      qr.width,
      qr.height,
      {
        contentType: "verification_url",
        value: "{{member.card_uuid}}",
        errorCorrection: "M",
        foreground: BAR,
        background: WHITE,
        keepArtworkWhenEmpty: true
      },
      { name: "12_QR_CODE" }
    ),
    locked(
      "member_number",
      "skyFrontQrCaption",
      qrCaption.x,
      qrCaption.y,
      qrCaption.width,
      qrCaption.height,
      {
        ...fieldProps("{{member.member_number}}", Math.max(11, Math.round(13 * frontPlace.scale))),
        textAlign: "center"
      },
      { name: "14_BARCODE_TEXT_QR" }
    ),
    locked(
      "barcode",
      SKY_FRONT_BARCODE_ID,
      frontBarcode.x,
      frontBarcode.y,
      frontBarcode.width,
      frontBarcode.height,
      barcodeProps(),
      { name: "13_BARCODE" }
    )
  ];

  doc.back.elements = [
    locked("background", "sky_back_bg", 0, 0, CR80_PX.width, CR80_PX.height, {
      fill: "#C8EDF8",
      opacity: 1,
      borderWidth: 0,
      borderColor: "none"
    }),
    locked(
      "image",
      "sky_back_exact_art",
      Math.round(backPlace.x),
      Math.round(backPlace.y),
      Math.round(backPlace.width),
      Math.round(backPlace.height),
      {
        src: SKY_BLUE_VIP_EXACT_ARTWORK.backSrc,
        fit: "contain",
        opacity: 1,
        exactArtwork: true,
        nativeWidth: SKY_BLUE_VIP_EXACT_ARTWORK.backNative.width,
        nativeHeight: SKY_BLUE_VIP_EXACT_ARTWORK.backNative.height
      },
      { name: "01_BACKGROUND_SKY" }
    ),
    locked(
      "barcode",
      SKY_BACK_BARCODE_ID,
      backBarcode.x,
      backBarcode.y,
      backBarcode.width,
      backBarcode.height,
      barcodeProps(),
      { name: "15_BARCODE" }
    )
  ];

  return doc;
}

export function productionSkyBlueVipDocument(_existing?: CardTemplateDocument | null): CardTemplateDocument {
  return createSkyBlueVipTemplateDocument();
}
