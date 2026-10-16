import type { StaffOpsPriority } from "@/lib/staff/admin-ops";
import { needsResolutionNoteOnComplete } from "@/lib/user-interactions/lifecycle";

export function assertResolutionNoteIfRequired(
  priority: StaffOpsPriority | string,
  urgent: boolean | undefined,
  status: string | null | undefined,
  resolutionNotes: unknown
): void {
  const closing =
    status === "Resolved" ||
    status === "Completed" ||
    status === "Check Out" ||
    status === "Archived";
  if (!closing) return;
  const needs = needsResolutionNoteOnComplete(priority as StaffOpsPriority, urgent);
  if (!needs) return;
  const note = String(resolutionNotes ?? "").trim();
  if (!note) {
    throw new Error("A resolution note is required for high-priority or urgent items.");
  }
}
