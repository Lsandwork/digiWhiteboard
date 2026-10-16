export const SERVICE_CATEGORIES = [
  "daycare",
  "boarding",
  "grooming",
  "training",
  "outing",
  "hike",
  "other"
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SEVERITIES = ["routine", "needs_follow_up", "urgent"] as const;
export type BodyCheckSeverity = (typeof SEVERITIES)[number];

export const FOLLOW_UP_STATUSES = ["none", "required", "scheduled", "completed", "owner_contacted"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const FOLLOW_UP_KINDS = [
  "bath",
  "nail_trim",
  "grooming",
  "supervisor_review",
  "owner_communication",
  "other"
] as const;
export type FollowUpKind = (typeof FOLLOW_UP_KINDS)[number];

export const ROSTER_FILTERS = [
  "all",
  "checked_in",
  "arriving",
  "went_home",
  "upcoming",
  "appointments",
  "follow_up"
] as const;
export type RosterFilter = (typeof ROSTER_FILTERS)[number];

export type FindingSelection = {
  id: string;
  label: string;
  detail?: string | null;
};

export type BodyCheckRosterRow = {
  key: string;
  gingrAnimalId: string;
  dogName: string;
  photoUrl: string | null;
  ownerId: string | null;
  ownerName: string | null;
  reservationId: string | null;
  serviceType: string | null;
  serviceCategory: ServiceCategory;
  startsAt: string | null;
  checkedIn: boolean;
  checkedInAt: string | null;
  /** Gingr recorded a check-out for this visit on the roster date; the dog has gone home. */
  wentHomeToday: boolean;
  checkedOutAt: string | null;
  isArrivalToday: boolean;
  isUpcoming: boolean;
  isAppointment: boolean;
};

export type RosterCounts = {
  dogs: number;
  checkedIn: number;
  arrivals: number;
  wentHome: number;
  upcoming: number;
  appointments: number;
  submittedToday: number;
  unresolvedFollowUps: number;
};

export type BodyCheckReport = {
  id: string;
  idempotencyKey: string;
  gingrAnimalId: string;
  dogName: string;
  photoUrl: string | null;
  ownerId: string | null;
  ownerName: string | null;
  reservationId: string | null;
  serviceType: string | null;
  serviceCategory: ServiceCategory;
  locationId: string | null;
  staffUserId: string | null;
  staffName: string;
  inspectedAt: string;
  ears: FindingSelection[];
  nails: FindingSelection[];
  bodyGrooming: FindingSelection[];
  bodyPhysical: FindingSelection[];
  notes: string | null;
  severity: BodyCheckSeverity;
  followUpStatus: FollowUpStatus;
  followUpKinds: FollowUpKind[];
  createdAt: string;
  updatedAt: string;
};

export type FollowUpEvent = {
  id: string;
  reportId: string;
  fromStatus: string | null;
  toStatus: FollowUpStatus;
  note: string | null;
  changedByName: string;
  createdAt: string;
};

export const NOTES_MAX = 2000;
export const OTHER_MAX = 240;
