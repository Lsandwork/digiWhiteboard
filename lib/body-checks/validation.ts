import {
  BODY_GROOMING_FINDINGS,
  BODY_PHYSICAL_FINDINGS,
  EAR_FINDINGS,
  NAIL_FINDINGS,
  reconcileBody,
  type FindingDef,
  resolveSelection
} from "@/lib/body-checks/findings";
import {
  FOLLOW_UP_KINDS,
  NOTES_MAX,
  OTHER_MAX,
  SEVERITIES,
  type BodyCheckSeverity,
  type FindingSelection,
  type FollowUpKind,
  type ServiceCategory,
  SERVICE_CATEGORIES
} from "@/lib/body-checks/types";

export type InspectionDraft = {
  gingrAnimalId: string;
  dogName: string;
  photoUrl?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  reservationId?: string | null;
  serviceType?: string | null;
  serviceCategory?: string | null;
  locationId?: string | null;
  ears: string[];
  nails: string[];
  bodyGrooming: string[];
  bodyPhysical: string[];
  earOther?: string | null;
  nailOther?: string | null;
  bodyOther?: string | null;
  notes?: string | null;
  severity?: string | null;
  followUpKinds?: string[] | null;
  idempotencyKey: string;
};

export type ValidatedInspection = {
  gingrAnimalId: string;
  dogName: string;
  photoUrl: string | null;
  ownerId: string | null;
  ownerName: string | null;
  reservationId: string | null;
  serviceType: string | null;
  serviceCategory: ServiceCategory;
  locationId: string | null;
  ears: FindingSelection[];
  nails: FindingSelection[];
  bodyGrooming: FindingSelection[];
  bodyPhysical: FindingSelection[];
  notes: string | null;
  severity: BodyCheckSeverity;
  followUpKinds: FollowUpKind[];
  idempotencyKey: string;
};

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, max);
}

function toSelections(catalog: FindingDef[], ids: string[], detailForOther: string | null): FindingSelection[] {
  const resolved = resolveSelection(catalog, ids);
  return resolved.map((id) => {
    const def = catalog.find((item) => item.id === id)!;
    return {
      id,
      label: def.label,
      detail: def.requiresDetail ? detailForOther : null
    };
  });
}

export function validateInspection(input: InspectionDraft): { ok: true; value: ValidatedInspection } | { ok: false; error: string } {
  const gingrAnimalId = cleanText(input.gingrAnimalId, 80);
  const dogName = cleanText(input.dogName, 120);
  const idempotencyKey = cleanText(input.idempotencyKey, 80);
  if (!gingrAnimalId) return { ok: false, error: "A Gingr dog id is required." };
  if (!dogName) return { ok: false, error: "A dog name is required." };
  if (!idempotencyKey) return { ok: false, error: "A submission key is required." };

  const earOther = cleanText(input.earOther, OTHER_MAX);
  const nailOther = cleanText(input.nailOther, OTHER_MAX);
  const bodyOther = cleanText(input.bodyOther, OTHER_MAX);
  const notes = cleanText(input.notes, NOTES_MAX);
  if (typeof input.notes === "string" && input.notes.trim().length > NOTES_MAX) {
    return { ok: false, error: `Notes must be ${NOTES_MAX} characters or fewer.` };
  }

  const ears = toSelections(EAR_FINDINGS, input.ears ?? [], earOther);
  const nails = toSelections(NAIL_FINDINGS, input.nails ?? [], nailOther);
  const reconciled = reconcileBody(input.bodyGrooming ?? [], input.bodyPhysical ?? []);
  const bodyGrooming = toSelections(BODY_GROOMING_FINDINGS, reconciled.grooming, null);
  const bodyPhysical = toSelections(BODY_PHYSICAL_FINDINGS, reconciled.physical, bodyOther);

  if (ears.some((item) => item.id === "other") && !earOther) {
    return { ok: false, error: "Describe the other ear finding." };
  }
  if (nails.some((item) => item.id === "other") && !nailOther) {
    return { ok: false, error: "Describe the other nail finding." };
  }
  if (bodyPhysical.some((item) => item.id === "other") && !bodyOther) {
    return { ok: false, error: "Describe the other body finding." };
  }
  if (!ears.length || !nails.length || (!bodyGrooming.length && !bodyPhysical.length)) {
    return { ok: false, error: "Select at least one finding for ears, nails, and body." };
  }

  const severity = SEVERITIES.includes(input.severity as BodyCheckSeverity)
    ? (input.severity as BodyCheckSeverity)
    : null;
  if (!severity) return { ok: false, error: "Choose a severity." };

  const followUpKinds = [...new Set(input.followUpKinds ?? [])].filter((kind): kind is FollowUpKind =>
    (FOLLOW_UP_KINDS as readonly string[]).includes(kind)
  );
  if ((severity === "needs_follow_up" || severity === "urgent") && followUpKinds.length === 0) {
    return { ok: false, error: "Choose at least one follow-up for this severity." };
  }

  const category = SERVICE_CATEGORIES.includes(input.serviceCategory as ServiceCategory)
    ? (input.serviceCategory as ServiceCategory)
    : "other";

  return {
    ok: true,
    value: {
      gingrAnimalId,
      dogName,
      photoUrl: cleanText(input.photoUrl, 500),
      ownerId: cleanText(input.ownerId, 80),
      ownerName: cleanText(input.ownerName, 160),
      reservationId: cleanText(input.reservationId, 80),
      serviceType: cleanText(input.serviceType, 120),
      serviceCategory: category,
      locationId: cleanText(input.locationId, 40),
      ears,
      nails,
      bodyGrooming,
      bodyPhysical,
      notes,
      severity,
      followUpKinds: severity === "routine" ? followUpKinds : followUpKinds,
      idempotencyKey
    }
  };
}
