import { newBulkRowId } from "@/lib/ops-command-center/shift-handoff-items";

export const BULK_SHIFT_LOG_LIMIT = 25;

export type BulkShiftLogRow = {
  id: string;
  related_dog_name: string;
  subject: string;
  details: string;
};

export type NormalizedBulkShiftLogEntry = {
  subject: string;
  details: string;
  related_dog_name: string | null;
};

export function emptyBulkShiftLogRow(partial?: Partial<BulkShiftLogRow>): BulkShiftLogRow {
  return {
    id: partial?.id || newBulkRowId(),
    related_dog_name: partial?.related_dog_name ?? "",
    subject: partial?.subject ?? "",
    details: partial?.details ?? ""
  };
}

export function isBulkShiftLogRowEmpty(row: BulkShiftLogRow) {
  return !row.subject.trim() && !row.details.trim() && !row.related_dog_name.trim();
}

export function normalizeBulkShiftLogRow(row: BulkShiftLogRow): NormalizedBulkShiftLogEntry | null {
  const subject = row.subject.trim();
  const details = row.details.trim();
  const dog = row.related_dog_name.trim();
  if (!subject && !details) return null;
  const resolvedSubject = subject || (details.length > 80 ? `${details.slice(0, 77)}…` : details);
  const resolvedDetails = details || subject;
  return {
    subject: resolvedSubject,
    details: resolvedDetails,
    related_dog_name: dog || null
  };
}

export function normalizeBulkShiftLogRows(rows: BulkShiftLogRow[]) {
  return rows
    .map(normalizeBulkShiftLogRow)
    .filter((entry): entry is NormalizedBulkShiftLogEntry => Boolean(entry));
}

export function toCrossoverBulkPayload(
  entries: NormalizedBulkShiftLogEntry[],
  defaults: {
    log_type: string;
    priority: string;
    assigned_to: string;
    department_area: string;
    status?: string;
  }
) {
  return entries.map((entry) => ({
    log_type: defaults.log_type,
    subject: entry.subject,
    details: entry.details,
    message: entry.details,
    priority: defaults.priority,
    status: defaults.status ?? "Open",
    assigned_to: defaults.assigned_to || null,
    assigned_team: defaults.assigned_to || null,
    related_dog_name: entry.related_dog_name,
    department_area: defaults.department_area || null
  }));
}
