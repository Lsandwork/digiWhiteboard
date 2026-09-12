import { cloneDocument } from "@/lib/card-studio/template-schema";
import type { CardElement, CardTemplateDocument, MemberCardContext } from "@/lib/card-studio/types";

export const MEMBER_PHOTO_SLOT_ID = "memberPhotoSlot";

export function isMemberPhotoSlot(el: CardElement) {
  return el.type === "member_photo" || String(el.properties.slotId ?? "") === MEMBER_PHOTO_SLOT_ID;
}

export function memberPhotoSlots(doc: CardTemplateDocument): CardElement[] {
  return [...doc.front.elements, ...doc.back.elements].filter(isMemberPhotoSlot);
}

export function countMemberPhotoSlots(doc: CardTemplateDocument) {
  return memberPhotoSlots(doc).length;
}

/**
 * Keep a single photo frame. Extra member_photo layers and extra uploaded images
 * are removed. The surviving slot keeps geometry and still binds {{member.photo}}.
 */
export function pruneStackedMemberPhotos(doc: CardTemplateDocument): CardTemplateDocument {
  const next = cloneDocument(doc);
  for (const side of ["front", "back"] as const) {
    const list = next[side].elements;
    const photos = list.filter(isMemberPhotoSlot);
    const keeper =
      photos.find((el) => el.id === MEMBER_PHOTO_SLOT_ID) ??
      photos.find((el) => el.id === "cs_vip_photo") ??
      photos[0] ??
      null;
    next[side].elements = list.filter((el) => {
      if (isMemberPhotoSlot(el)) return keeper != null && el.id === keeper.id;
      if (el.type === "image" && !el.properties.exactArtwork) {
        const src = String(el.properties.src ?? "");
        if (src.startsWith("data:image") || src === "{{member.photo}}") return false;
      }
      return true;
    });
    if (keeper) {
      next[side].elements = next[side].elements.map((el) => {
        if (el.id !== keeper.id) return el;
        return {
          ...el,
          id: MEMBER_PHOTO_SLOT_ID,
          type: "member_photo",
          properties: {
            ...el.properties,
            slotId: MEMBER_PHOTO_SLOT_ID,
            src: "{{member.photo}}",
            fit: el.properties.fit ?? "cover"
          }
        };
      });
    }
  }
  return next;
}

export function replaceMemberPhoto(member: MemberCardContext, photoUrl: string | null): MemberCardContext {
  return { ...member, photoUrl };
}
