import { DYNAMIC_FIELD_KEYS } from "@/lib/card-studio/constants";
import { gingrBarcodeValue, normalizeGingrNumericId } from "@/lib/card-studio/gingr-identity";
import type { MemberCardContext } from "@/lib/card-studio/types";

const TOKEN_RE = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;

export function emptyMemberContext(): MemberCardContext {
  return {
    fitdogOwnerId: null,
    fitdogDogId: null,
    gingrAnimalId: null,
    gingrOwnerId: null,
    gingrOwnerBarcode: null,
    opsDogId: null,
    name: "",
    firstName: "",
    lastName: "",
    email: null,
    phone: null,
    memberNumber: null,
    membershipType: null,
    location: "Fitdog",
    status: "active",
    dogName: null,
    dogBreed: null,
    photoUrl: null,
    issueDate: null,
    expirationDate: null,
    cardUuid: null,
    cardNumber: null,
    customField: null,
    barcodeSource: "gingr_animal_id",
    barcodeValue: null
  };
}

export function contextToFieldMap(member: MemberCardContext, extras?: Record<string, string | null | undefined>) {
  const animalId = normalizeGingrNumericId(member.gingrAnimalId);
  const barcode = gingrBarcodeValue(member);
  const map: Record<string, string> = {
    "member.name": member.name,
    "member.first_name": member.firstName,
    "member.last_name": member.lastName,
    "member.member_number": animalId || "",
    "member.membership_type": member.membershipType ?? "",
    "member.location": member.location ?? "",
    "member.issue_date": member.issueDate ?? "",
    "member.expiration_date": member.expirationDate ?? "",
    "member.photo": member.photoUrl ?? "",
    "member.qr_code": member.cardUuid ?? "",
    "member.barcode": barcode ?? "",
    "member.gingr_animal_id": animalId ?? "",
    "member.gingr_owner_id": normalizeGingrNumericId(member.gingrOwnerId) ?? "",
    "member.phone": member.phone ?? "",
    "member.card_uuid": member.cardUuid ?? "",
    "member.status": member.status,
    "member.dog_name": member.dogName ?? "",
    "member.dog_breed": member.dogBreed ?? "",
    "member.email": member.email ?? "",
    "member.custom_field": member.customField ?? ""
  };
  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      map[key] = value ?? "";
    }
  }
  return map;
}

export function resolveTemplateString(input: string, member: MemberCardContext, extras?: Record<string, string | null | undefined>) {
  const map = contextToFieldMap(member, extras);
  return input.replace(TOKEN_RE, (_, key: string) => map[key] ?? "");
}

export function extractDynamicKeys(input: string) {
  const keys = new Set<string>();
  input.replace(TOKEN_RE, (_, key: string) => {
    keys.add(key);
    return "";
  });
  return [...keys];
}

export function isKnownDynamicField(key: string) {
  return (DYNAMIC_FIELD_KEYS as readonly string[]).includes(key);
}

export function unresolvedDynamicFields(input: string, member: MemberCardContext) {
  const map = contextToFieldMap(member);
  return extractDynamicKeys(input).filter((key) => !map[key]);
}

export function splitPersonName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}
