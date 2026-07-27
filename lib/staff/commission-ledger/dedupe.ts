/**
 * Same-day trainer commission duplicate fingerprint.
 * Key: trainer + client + dog + package/class + sale_date
 * Amount is intentionally excluded — same dog/class/day cannot be entered twice.
 */
export type CommissionDedupeFields = {
  trainerName?: string | null;
  trainerUserId?: string | null;
  clientName: string;
  dogName: string;
  packageOrClass: string;
  saleDate: string; // YYYY-MM-DD
  /** @deprecated Ignored — kept for call-site compatibility. */
  finalCommissionCents?: number;
};

function norm(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function commissionDedupeKey(fields: CommissionDedupeFields): string {
  const trainer =
    fields.trainerUserId?.trim() ||
    norm(fields.trainerName) ||
    "unassigned";
  return [
    trainer,
    norm(fields.clientName),
    norm(fields.dogName),
    norm(fields.packageOrClass),
    String(fields.saleDate).slice(0, 10)
  ].join("|");
}

export function namesMatchCaseInsensitive(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

/** True when two rows collide on name + date + class (same trainer). */
export function isSameDayClassDuplicate(
  a: {
    trainerName?: string | null;
    trainerUserId?: string | null;
    clientName: string;
    dogName: string;
    packageOrClass: string;
    saleDate: string;
  },
  b: {
    trainerName?: string | null;
    trainerUserId?: string | null;
    clientName: string;
    dogName: string;
    packageOrClass: string;
    saleDate: string;
  }
): boolean {
  return commissionDedupeKey(a) === commissionDedupeKey(b);
}
