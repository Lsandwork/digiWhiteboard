export const OPS_DOG_STATUSES = [
  "expected",
  "arrived",
  "checked_in",
  "yard",
  "break",
  "training",
  "grooming",
  "outing",
  "transportation",
  "ready_for_pickup",
  "checked_out",
  "overnight",
  "other"
] as const;

export type OpsDogStatusValue = (typeof OPS_DOG_STATUSES)[number];

export const OPS_EVENT_CATEGORIES = [
  "check_in",
  "checkout",
  "yard",
  "break",
  "walk",
  "body_check",
  "collar_check",
  "feeding",
  "medication",
  "grooming",
  "training",
  "transportation",
  "outing",
  "incident",
  "owner_communication",
  "alert",
  "task",
  "employee_note",
  "photo",
  "video",
  "important_notice",
  "status",
  "system",
  "other"
] as const;

export type OpsEventCategory = (typeof OPS_EVENT_CATEGORIES)[number];

export const OPS_PRIORITIES = ["critical", "high", "attention", "informational"] as const;
export type OpsPriority = (typeof OPS_PRIORITIES)[number];

export const OPS_TASK_STATUSES = [
  "open",
  "in_progress",
  "completed",
  "snoozed",
  "escalated",
  "cancelled"
] as const;
export type OpsTaskStatus = (typeof OPS_TASK_STATUSES)[number];

export type OpsDog = {
  id: string;
  gingrAnimalId: string | null;
  fitdogDogId: string | null;
  name: string;
  ownerName: string | null;
  ownerPhoneE164: string | null;
  photoUrl: string | null;
  breed: string | null;
  specialInstructions: string | null;
  gingrProfileUrl: string | null;
  lastGingrSyncAt: string | null;
  gingrSyncStale: boolean;
  flags: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type OpsDogStatus = {
  dogId: string;
  status: OpsDogStatusValue;
  subStatus: string | null;
  locationLabel: string | null;
  yardKey: string | null;
  gingrReservationId: string | null;
  transportationState: string | null;
  groomingState: string | null;
  trainingState: string | null;
  walkState: string | null;
  breakState: string | null;
  assignedEmployeeIds: string[];
  statusStartedAt: string | null;
  expectedCheckoutAt: string | null;
  sourceModule: string | null;
  metadata: Record<string, unknown>;
  updatedAt: string;
};

export type OpsEvent = {
  id: string;
  dogId: string | null;
  eventType: string;
  category: OpsEventCategory;
  title: string;
  summary: string | null;
  actorAdminId: string | null;
  actorName: string | null;
  actorRole: string | null;
  sourceModule: string;
  sourceRecordType: string | null;
  sourceRecordId: string | null;
  severity: OpsPriority | null;
  payload: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
};

export type OpsTask = {
  id: string;
  title: string;
  dogId: string | null;
  relatedEventId: string | null;
  assignedAdminId: string | null;
  assignedRole: string | null;
  dueAt: string | null;
  priority: OpsPriority;
  status: OpsTaskStatus;
  createdByAdminId: string | null;
  createdFrom: string | null;
  completedByAdminId: string | null;
  completedAt: string | null;
  snoozedUntil: string | null;
  notes: string | null;
  escalationNotes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type OpsNotification = {
  id: string;
  userAdminId: string | null;
  roleKey: string | null;
  dogId: string | null;
  taskId: string | null;
  eventId: string | null;
  title: string;
  body: string | null;
  priority: OpsPriority;
  readAt: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  hrefTab: string | null;
  hrefPath: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type OpsActor = {
  adminId?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
};
