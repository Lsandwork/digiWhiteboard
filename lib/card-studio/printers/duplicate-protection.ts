import type { PrintAdapterResult, PrintJobState } from "@/lib/card-studio/types";

export type DuplicateRisk = "none" | "possible_duplicate";

export function classifyPrintOutcome(result: PrintAdapterResult): {
  jobState: PrintJobState;
  cardIssued: boolean;
  duplicateRisk: DuplicateRisk;
  message: string;
} {
  if (result.status === "success") {
    return {
      jobState: "completed",
      cardIssued: true,
      duplicateRisk: "none",
      message: result.message
    };
  }
  if (result.status === "unknown") {
    return {
      jobState: "unknown",
      cardIssued: false,
      duplicateRisk: "possible_duplicate",
      message:
        result.message ||
        "The printer result is unknown. The card was NOT marked as printed. Confirm the physical output before reprinting."
    };
  }
  return {
    jobState: "failed",
    cardIssued: false,
    duplicateRisk: "none",
    message: result.message
  };
}

export function retryWouldDuplicate(previousState: PrintJobState) {
  return previousState === "unknown" || previousState === "sending" || previousState === "printing";
}
