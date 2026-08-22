import type { TlGingrSourceHealth } from "./types";

/**
 * When Additional Services are fully complete in Gingr, the TL TV board
 * expands Medication Reminders full-width and hides the right-column stack.
 * Pure layout derivation from already-synced meta — no extra network calls.
 */
export function shouldUseMedicationsFocusLayout(params: {
  hasResolved: boolean;
  servicesHealth: TlGingrSourceHealth | null | undefined;
  servicesAllClear: boolean;
}): boolean {
  if (!params.hasResolved) return false;
  // servicesAllClear is only true when servicesHealth === "ok" and remaining === 0.
  return params.servicesAllClear === true && params.servicesHealth === "ok";
}

/** Standing ops copy shown above the full-width medication table. */
export const TL_MEDICATIONS_FOCUS_REMINDERS = [
  "Mark every dose in Gingr when given (Administered).",
  "Owner gave the dose → mark Owner Administered in Gingr.",
  "Medication missing, wrong, or needs an update → speak with the Front Desk Coordinator.",
  "NOT ADMINISTERED / overdue rows flash until recorded in Gingr."
] as const;
