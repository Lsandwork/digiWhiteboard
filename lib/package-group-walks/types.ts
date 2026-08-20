import type { PackageGroupWalkPackageKey } from "./eligible-packages";

export type PackageGroupWalkStatus = "pending" | "completed";

/** A dog currently checked in at Gingr whose owner holds an eligible package. */
export type PackageGroupWalkEligibility = {
  /** Stable row id — Gingr animal id scoped to the business date. */
  id: string;
  gingrAnimalId: string;
  dogName: string;
  photoUrl: string | null;
  gingrOwnerId: string | null;
  ownerName: string | null;
  gingrReservationId: string | null;
  /** ISO instant of the Gingr check-in when the payload exposes one. */
  checkedInAt: string | null;
  packageKey: PackageGroupWalkPackageKey;
  packageName: string;
  gingrPackageId: string | null;
  /** Where the package came from — audit trail for eligibility disputes. */
  packageSource: string;
  businessDate: string;
};

export type PackageGroupWalkCompletion = {
  id: string;
  businessDate: string;
  gingrAnimalId: string;
  dogName: string;
  photoUrl: string | null;
  gingrOwnerId: string | null;
  ownerName: string | null;
  packageKey: PackageGroupWalkPackageKey;
  packageName: string;
  completedAt: string;
  completedByUserId: string | null;
  completedByUserName: string;
};

export type PackageGroupWalkRow = PackageGroupWalkEligibility & {
  status: PackageGroupWalkStatus;
  completion: PackageGroupWalkCompletion | null;
};

export type PackageGroupWalkSummary = {
  eligibleToday: number;
  remaining: number;
  completed: number;
};

/**
 * Explicit sync states. An empty list is only ALL CLEAR after a *successful*
 * Gingr read — a failed read must never render as "nothing to do".
 */
export type PackageGroupWalkSyncState =
  | "LOADING"
  | "LIVE"
  | "STALE"
  | "ERROR"
  | "EMPTY_VALID";

export type PackageGroupWalkMeta = {
  timezone: "America/Los_Angeles";
  businessDate: string;
  syncState: PackageGroupWalkSyncState;
  lastSuccessfulSyncAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  /** True only when Gingr answered this attempt. */
  gingrOk: boolean;
  /** True when rows come from a prior successful sync. */
  isStale: boolean;
  /**
   * False when no package source could be read from Gingr at all. Eligibility
   * cannot be asserted, so the UI must not claim "All Clear".
   */
  packageSourceAvailable: boolean;
  packageSources: string[];
  checkedInDogCount: number;
};

export type PackageGroupWalkState = {
  pending: PackageGroupWalkRow[];
  completed: PackageGroupWalkCompletion[];
  summary: PackageGroupWalkSummary;
  meta: PackageGroupWalkMeta;
  generatedAt: string;
};

/** Compact rows embedded in the TL whiteboard snapshot (display-only). */
export type TlBoardPackageGroupWalkRow = {
  id: string;
  gingrAnimalId: string;
  dogName: string;
  photoUrl: string | null;
  packageKey: PackageGroupWalkPackageKey;
  packageName: string;
  checkedInAt: string | null;
  businessDate: string;
};

export type TlBoardPackageGroupWalksSummary = {
  eligible: number;
  remaining: number;
  completed: number;
};
