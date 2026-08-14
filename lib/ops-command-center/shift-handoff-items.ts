export const SHIFT_HANDOFF_CATEGORIES = [
  { id: "unresolvedIncidents", label: "Unresolved incident", field: "unresolvedIncidents" },
  { id: "importantDogs", label: "Important dog", field: "importantDogs" },
  { id: "medication", label: "Medication", field: "medication" },
  { id: "feeding", label: "Feeding", field: "feeding" },
  { id: "behaviorConcerns", label: "Behavior concern", field: "behaviorConcerns" },
  { id: "latePickups", label: "Late pickup", field: "latePickups" },
  { id: "transportationIssues", label: "Transportation", field: "transportationIssues" },
  { id: "ownerFollowUps", label: "Owner follow-up", field: "ownerFollowUps" },
  { id: "groomingPending", label: "Grooming pending", field: "groomingPending" },
  { id: "trainingPending", label: "Training pending", field: "trainingPending" },
  { id: "openTasks", label: "Open task", field: "openTasks" },
  { id: "systemIssues", label: "System issue", field: "systemIssues" },
  { id: "other", label: "General note", field: null }
] as const;

export type ShiftHandoffCategoryId = (typeof SHIFT_HANDOFF_CATEGORIES)[number]["id"];

export type ShiftHandoffItem = {
  id: string;
  category: ShiftHandoffCategoryId;
  note: string;
};

const CATEGORY_IDS = new Set<string>(SHIFT_HANDOFF_CATEGORIES.map((item) => item.id));

export function newBulkRowId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyShiftHandoffItem(partial?: Partial<ShiftHandoffItem>): ShiftHandoffItem {
  const category = partial?.category && CATEGORY_IDS.has(partial.category) ? partial.category : "other";
  return {
    id: partial?.id || newBulkRowId(),
    category,
    note: partial?.note ?? ""
  };
}

export function isShiftHandoffItemEmpty(item: ShiftHandoffItem) {
  return !item.note.trim();
}

export function parseShiftHandoffItems(value: unknown): ShiftHandoffItem[] {
  if (!Array.isArray(value)) return [emptyShiftHandoffItem()];
  const items = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const note = String(row.note ?? row.summary ?? "").trim();
      const categoryRaw = String(row.category ?? "other");
      const category = (CATEGORY_IDS.has(categoryRaw) ? categoryRaw : "other") as ShiftHandoffCategoryId;
      if (!note && !row.id) return null;
      return emptyShiftHandoffItem({
        id: String(row.id ?? newBulkRowId()),
        category,
        note: String(row.note ?? row.summary ?? "")
      });
    })
    .filter((item): item is ShiftHandoffItem => Boolean(item));
  return items.length ? items : [emptyShiftHandoffItem()];
}

export function compileShiftHandoff(items: ShiftHandoffItem[]) {
  const filled = items.filter((item) => !isShiftHandoffItemEmpty(item));
  const fields: Record<string, string | null | undefined> = {};

  for (const item of filled) {
    const category = SHIFT_HANDOFF_CATEGORIES.find((entry) => entry.id === item.category);
    if (!category?.field) continue;
    const note = item.note.trim();
    const previous = fields[category.field];
    fields[category.field] = previous ? `${previous}\n${note}` : note;
  }

  const summary = filled
    .map((item, index) => {
      const category = SHIFT_HANDOFF_CATEGORIES.find((entry) => entry.id === item.category);
      return `${index + 1}. [${category?.label ?? "Note"}] ${item.note.trim()}`;
    })
    .join("\n");

  return {
    summary,
    fields,
    count: filled.length
  };
}
