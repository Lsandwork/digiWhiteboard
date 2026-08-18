export const RUFFOPS_CHECKLIST_SOURCES = ["gingr", "reminder", "walks", "alert"] as const;
export type RuffopsChecklistSource = (typeof RUFFOPS_CHECKLIST_SOURCES)[number];

export const RUFFOPS_CHECKLIST_BUCKETS = ["overdue", "due", "upcoming", "completed"] as const;
export type RuffopsChecklistBucket = (typeof RUFFOPS_CHECKLIST_BUCKETS)[number];

export type RuffopsChecklistCompletedSource = "gingr" | "ruffops" | "walks" | null;

export type RuffopsChecklistCompletion = {
  item_key: string;
  source: RuffopsChecklistSource;
  source_id: string;
  shift_date: string;
  completed_at: string;
  completed_by: string | null;
  completed_by_name: string | null;
  undone_at: string | null;
  metadata: Record<string, unknown>;
};

export type RuffopsChecklistItem = {
  key: string;
  source: RuffopsChecklistSource;
  sourceId: string;
  title: string;
  detail: string | null;
  dogName: string | null;
  lodgingLabel: string | null;
  dueAt: string | null;
  dueLabel: string | null;
  bucket: RuffopsChecklistBucket;
  completed: boolean;
  completedAt: string | null;
  completedByName: string | null;
  completedSource: RuffopsChecklistCompletedSource;
  checkboxLocked: boolean;
  canToggle: boolean;
  gingrUrl: string | null;
  actionHint: string | null;
  photoUrl: string | null;
};

export type RuffopsChecklistSummary = {
  overdue: number;
  due: number;
  upcoming: number;
  completed: number;
  total: number;
};

export type RuffopsChecklistState = {
  shiftDate: string;
  timezone: string;
  generatedAt: string;
  summary: RuffopsChecklistSummary;
  items: RuffopsChecklistItem[];
  gingrSync: {
    health: string;
    lastSuccessfulSyncAt: string | null;
    isStale: boolean;
  } | null;
};
