export const REPORT_KINDS = [
  "overview",
  "checklist",
  "photos",
  "logins",
  "walks",
  "team_log",
  "care"
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

export type ReportRange = {
  from: string;
  to: string;
  timezone: "America/Los_Angeles";
};

export type NamedCountRow = {
  key: string;
  label: string;
  count: number;
};

export type UserDateCountRow = {
  userKey: string;
  userLabel: string;
  dateKey: string;
  dateLabel: string;
  count: number;
};

export type ChecklistReportRow = {
  completedAt: string;
  shiftDate: string;
  userLabel: string;
  source: string;
  title: string;
  itemKey: string;
};

export type PhotoReportRow = {
  createdAt: string;
  serviceDate: string | null;
  userLabel: string;
  filename: string;
  category: string | null;
  yard: string | null;
  status: string;
};

export type LoginDayRow = {
  userKey: string;
  userLabel: string;
  dateKey: string;
  dateLabel: string;
  count: number;
};

export type LoginWeekRow = {
  userKey: string;
  userLabel: string;
  weekKey: string;
  weekLabel: string;
  count: number;
};

export type WalksReportRow = {
  shiftDate: string;
  hourLabel: string;
  status: string;
  completedAt: string | null;
  userLabel: string;
};

export type TeamLogReportRow = {
  createdAt: string;
  subject: string;
  logType: string;
  userLabel: string;
  status: string;
  priority: string;
};

export type CareReportRow = {
  createdAt: string;
  kind: string;
  title: string;
  userLabel: string;
  status: string;
};

export type OverviewTotals = {
  checklistCompletions: number;
  photosUploaded: number;
  logins: number;
  uniqueLogins: number;
  walksCompleted: number;
  teamLogEntries: number;
  openFollowUps: number;
  openIssues: number;
  supportItems: number;
};

export type ReportsPayload = {
  kind: ReportKind;
  range: ReportRange;
  generatedAt: string;
  overview?: OverviewTotals;
  checklist?: {
    totalsByUser: NamedCountRow[];
    totalsByDate: NamedCountRow[];
    totalsBySource: NamedCountRow[];
    rows: ChecklistReportRow[];
  };
  photos?: {
    totalsByUser: NamedCountRow[];
    totalsByDate: NamedCountRow[];
    rows: PhotoReportRow[];
  };
  logins?: {
    byDay: LoginDayRow[];
    byWeek: LoginWeekRow[];
    totalsByUser: NamedCountRow[];
    lastLoginByUser: Array<{ userLabel: string; lastLoginAt: string | null }>;
  };
  walks?: {
    totalsByUser: NamedCountRow[];
    totalsByDate: NamedCountRow[];
    rows: WalksReportRow[];
  };
  teamLog?: {
    totalsByUser: NamedCountRow[];
    totalsByType: NamedCountRow[];
    rows: TeamLogReportRow[];
  };
  care?: {
    followUps: CareReportRow[];
    issues: CareReportRow[];
    support: CareReportRow[];
    totals: NamedCountRow[];
  };
};
