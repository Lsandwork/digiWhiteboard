export type FindingDef = {
  id: string;
  label: string;
  /** Normal and abnormal findings in the same section cannot stay selected together. */
  tone: "normal" | "concern";
  requiresDetail?: boolean;
};

export const EAR_FINDINGS: FindingDef[] = [
  { id: "clean_normal", label: "Clean / Normal", tone: "normal" },
  { id: "redness", label: "Redness / Irritation", tone: "concern" },
  { id: "discharge", label: "Discharge / Odor", tone: "concern" },
  { id: "ticks", label: "Ticks", tone: "concern" },
  { id: "needs_cleaning", label: "Needs Cleaning", tone: "concern" },
  { id: "other", label: "Other", tone: "concern", requiresDetail: true }
];

export const NAIL_FINDINGS: FindingDef[] = [
  { id: "good_length", label: "Good Length", tone: "normal" },
  { id: "too_long", label: "Too Long", tone: "concern" },
  { id: "chipped", label: "Chipped / Broken", tone: "concern" },
  { id: "needs_trim", label: "Needs Trim", tone: "concern" },
  { id: "other", label: "Other", tone: "concern", requiresDetail: true }
];

export const BODY_GROOMING_FINDINGS: FindingDef[] = [
  { id: "no_issues", label: "No Issues", tone: "normal" },
  { id: "needs_bath", label: "Needs Bath", tone: "concern" },
  { id: "matted", label: "Matted Hair", tone: "concern" },
  { id: "shedding", label: "Excessive Shedding", tone: "concern" },
  { id: "skin_concern", label: "Skin / Coat Concern", tone: "concern" }
];

export const BODY_PHYSICAL_FINDINGS: FindingDef[] = [
  { id: "puncture", label: "Puncture Wound", tone: "concern" },
  { id: "cut", label: "Cut / Abrasion", tone: "concern" },
  { id: "redness", label: "Redness / Irritation", tone: "concern" },
  { id: "lump", label: "Lump / Bump", tone: "concern" },
  { id: "swelling", label: "Swelling", tone: "concern" },
  { id: "limping", label: "Limping / Mobility Concern", tone: "concern" },
  { id: "tick_flea", label: "Tick / Flea Observed", tone: "concern" },
  { id: "other", label: "Other", tone: "concern", requiresDetail: true }
];

export function findingById(catalog: FindingDef[], id: string): FindingDef | null {
  return catalog.find((item) => item.id === id) ?? null;
}

/**
 * Selecting a normal finding clears concerns. Selecting a concern clears the normal finding.
 * Compatible concerns (Needs Bath + Matted Hair) stay selected together.
 */
export function toggleFinding(catalog: FindingDef[], selected: string[], id: string): string[] {
  const def = findingById(catalog, id);
  if (!def) return selected;
  const isOn = selected.includes(id);
  if (isOn) return selected.filter((item) => item !== id);
  if (def.tone === "normal") return [id];
  const withoutNormal = selected.filter((item) => findingById(catalog, item)?.tone !== "normal");
  return [...withoutNormal, id];
}

/** No Issues cannot stay selected with a grooming or physical concern. */
export function reconcileBody(groomingIds: string[], physicalIds: string[]): { grooming: string[]; physical: string[] } {
  const grooming = resolveSelection(BODY_GROOMING_FINDINGS, groomingIds);
  const physical = resolveSelection(BODY_PHYSICAL_FINDINGS, physicalIds);
  const groomingConcern = grooming.some((id) => id !== "no_issues");
  if (grooming.includes("no_issues") && (groomingConcern || physical.length > 0)) {
    return { grooming: grooming.filter((id) => id !== "no_issues"), physical };
  }
  return { grooming, physical };
}

export function resolveSelection(catalog: FindingDef[], ids: string[]): string[] {
  const known = ids.filter((id) => findingById(catalog, id));
  const unique = [...new Set(known)];
  const hasConcern = unique.some((id) => findingById(catalog, id)?.tone === "concern");
  if (!hasConcern) return unique;
  return unique.filter((id) => findingById(catalog, id)?.tone !== "normal");
}
