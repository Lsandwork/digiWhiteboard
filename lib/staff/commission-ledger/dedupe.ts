/**
 * Same-day trainer commission duplicate fingerprint.
 * Key: trainer + client + dog + package + sale_date + final_commission_cents
 */
export type CommissionDedupeFields = {
  trainerName?: string | null;
  trainerUserId?: string | null;
  clientName: string;
  dogName: string;
  packageOrClass: string;
  saleDate: string; // YYYY-MM-DD
  finalCommissionCents: number;
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
    String(fields.saleDate).slice(0, 10),
    String(Number(fields.finalCommissionCents) || 0)
  ].join("|");
}

export function namesMatchCaseInsensitive(a: string, b: string): boolean {
  return norm(a) === norm(b);
}
