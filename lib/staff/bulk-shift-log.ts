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

export type BulkShiftLogPublishOptions = {
  create_owner_follow_up?: boolean;
  create_active_issue?: boolean;
};

export function toCrossoverBulkPayload(
  entries: NormalizedBulkShiftLogEntry[],
  defaults: {
    log_type: string;
    priority: string;
    assigned_to: string;
    department_area: string;
    from_department?: string;
    status?: string;
  },
  publish?: BulkShiftLogPublishOptions
) {
  const department = defaults.department_area || defaults.from_department || null;
  const followUp = Boolean(publish?.create_owner_follow_up);
  const activeIssue = Boolean(publish?.create_active_issue);
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
    department_area: department,
    from_department: defaults.from_department || department,
    ...(followUp ? { create_owner_follow_up: true } : {}),
    ...(activeIssue ? { create_active_issue: true } : {})
  }));
}

export function shiftLogPublishSuccessMessage(input: {
  saved: number;
  failed: number;
  publish?: BulkShiftLogPublishOptions;
}): string {
  const { saved, failed, publish } = input;
  const followUp = Boolean(publish?.create_owner_follow_up);
  const issue = Boolean(publish?.create_active_issue);
  const destinations = ["Team Log", ...(followUp ? ["Owner Follow Up"] : []), ...(issue ? ["Active Issues"] : [])];
  const destLabel =
    destinations.length === 1
      ? "Team Log"
      : destinations.length === 2
        ? `${destinations[0]} and ${destinations[1]}`
        : `${destinations.slice(0, -1).join(", ")}, and ${destinations[destinations.length - 1]}`;

  if (failed > 0 && saved > 0) {
    return `Saved ${saved} ${saved === 1 ? "entry" : "entries"} to ${destLabel}. ${failed} could not be saved.`;
  }
  if (failed > 0 && !saved) {
    return `Unable to post to ${destLabel}.`;
  }
  if (saved === 1) {
    return `Successfully posted to ${destLabel}.`;
  }
  return `Successfully posted ${saved} entries to ${destLabel}.`;
}
