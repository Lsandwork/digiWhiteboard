import type { LiveFloor, FloorDog } from "@/lib/ops-command-center/live-floor";
import { isStaffOpsStatusOpen } from "@/lib/user-interactions/lifecycle";
import type { ActiveIssue, StaffActivityLog, StaffDirectoryMember } from "@/lib/staff/admin-ops";
import type { CommandAction, OwnerActivityItem, SourceStatus } from "@/lib/ops-command-center/action-queue";
import { pacificDate } from "@/lib/ops-command-center/live-floor";

export type DashboardKpi = {
  id: string;
  label: string;
  value: number;
  detail: string;
  tone: "blue" | "green" | "purple" | "orange" | "cyan";
  hrefTab: string;
  icon: "dog" | "calendar" | "car" | "graduation";
};

export type TimelineStatus = "on_track" | "in_progress" | "pending" | "upcoming" | "late";

export type TimelineItem = {
  id: string;
  time: string | null;
  title: string;
  detail: string;
  status: TimelineStatus;
  hrefTab: string;
};

export type IssueSummary = {
  open: number;
  needsAttention: number;
  resolvedToday: number;
  overdue: number;
  items: Array<{
    id: string;
    title: string;
    detail: string;
    severity: "critical" | "attention" | "resolved";
    hrefTab: string;
  }>;
};

export type TeamMemberCard = {
  id: string;
  name: string;
  role: string;
  department: string;
  status: "active" | "inactive";
};

export type CommandDashboard = {
  health: "operational" | "degraded" | "offline";
  healthLabel: string;
  kpis: DashboardKpi[];
  timeline: TimelineItem[];
  issues: IssueSummary;
  team: TeamMemberCard[];
  teamSource: "directory";
  locationTracking: "unavailable";
};

const CLOSED_ISSUE = new Set(["resolved", "closed", "done", "archived", "completed", "check out"]);

function clock(value: string | null) {
  if (!value) return "—";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "—";
  return at.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
}

function serviceMentionsTaxi(dog: FloorDog) {
  return /taxi|transport|van|pickup route/i.test(dog.serviceType);
}

function issueOverdue(issue: ActiveIssue, now: number) {
  if (!issue.due_at) return false;
  const at = Date.parse(issue.due_at.length === 10 ? `${issue.due_at}T23:59:59` : issue.due_at);
  return !Number.isNaN(at) && at < now;
}

function isPacificTodayIso(value: string | null | undefined) {
  if (!value) return false;
  return value.slice(0, 10) === pacificDate();
}

export function buildOperationsTimeline(floor: LiveFloor): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const dog of [...floor.lateArrivals, ...floor.arrivalsExpected]) {
    const late = floor.lateArrivals.includes(dog);
    items.push({
      id: `arrival:${dog.reservationId}`,
      time: dog.startsAt,
      title: dog.category === "boarding" ? "Boarding Check-In" : `${dog.serviceType}`,
      detail: [dog.dogName, dog.ownerName].filter(Boolean).join(" · "),
      status: late ? "late" : "upcoming",
      hrefTab: "ops_command_center"
    });
  }

  for (const dog of [...floor.overduePickups, ...floor.pickupsRemaining]) {
    const late = floor.overduePickups.includes(dog);
    items.push({
      id: `pickup:${dog.reservationId}`,
      time: dog.endsAt,
      title: serviceMentionsTaxi(dog) ? "Taxi Pickup" : "Pickup",
      detail: [dog.dogName, dog.ownerName].filter(Boolean).join(" · "),
      status: late ? "late" : "pending",
      hrefTab: "ops_command_center"
    });
  }

  for (const dog of floor.onSite) {
    if (dog.category === "grooming") {
      items.push({
        id: `groom:${dog.reservationId}`,
        time: dog.checkedInAt || dog.startsAt,
        title: "Grooming Appointment",
        detail: [dog.dogName, dog.serviceType].filter(Boolean).join(" · "),
        status: "in_progress",
        hrefTab: "grooming_push"
      });
    }
    if (dog.category === "training") {
      items.push({
        id: `class:${dog.reservationId}`,
        time: dog.startsAt || dog.checkedInAt,
        title: dog.serviceType || "Training",
        detail: dog.dogName,
        status: "in_progress",
        hrefTab: "trainer_ops"
      });
    }
    if (dog.category === "outing") {
      items.push({
        id: `outing:${dog.reservationId}`,
        time: dog.startsAt || dog.checkedInAt,
        title: serviceMentionsTaxi(dog) ? "Taxi Run" : "Hike / Outing",
        detail: dog.dogName,
        status: "on_track",
        hrefTab: "walks_board"
      });
    }
    if (dog.category === "daycare") {
      items.push({
        id: `day:${dog.reservationId}`,
        time: dog.checkedInAt || dog.startsAt,
        title: "Daycare",
        detail: dog.dogName,
        status: "on_track",
        hrefTab: "ops_command_center"
      });
    }
  }

  return items
    .sort((a, b) => String(a.time ?? "9999").localeCompare(String(b.time ?? "9999")))
    .slice(0, 14)
    .map((item) => ({ ...item, title: `${clock(item.time)}  ${item.title}` }));
}

export function buildIssueSummary(issues: ActiveIssue[], now: number): IssueSummary {
  const open = issues.filter((issue) => isStaffOpsStatusOpen(issue.status) && !CLOSED_ISSUE.has(String(issue.status).toLowerCase()));
  const overdue = open.filter((issue) => issueOverdue(issue, now));
  const needsAttention = open.filter((issue) => {
    const p = String(issue.priority || "").toLowerCase();
    return p === "critical" || p === "urgent" || p === "high" || issueOverdue(issue, now);
  });
  const resolvedToday = issues.filter((issue) => isPacificTodayIso(issue.resolved_at));

  const items = [
    ...needsAttention.slice(0, 4).map((issue) => ({
      id: issue.id,
      title: issue.title,
      detail: [issue.category, issue.assigned_to, issueOverdue(issue, now) ? "Overdue" : issue.priority].filter(Boolean).join(" · "),
      severity: String(issue.priority).toLowerCase() === "critical" ? ("critical" as const) : ("attention" as const),
      hrefTab: "active_issues"
    })),
    ...resolvedToday.slice(0, 2).map((issue) => ({
      id: `resolved:${issue.id}`,
      title: issue.title,
      detail: "Resolved today",
      severity: "resolved" as const,
      hrefTab: "active_issues"
    }))
  ].slice(0, 5);

  return {
    open: open.length,
    needsAttention: needsAttention.length,
    resolvedToday: resolvedToday.length,
    overdue: overdue.length,
    items
  };
}

export function buildTeamRoster(directory: StaffDirectoryMember[]): TeamMemberCard[] {
  return directory
    .filter((member) => String(member.status || "Active") === "Active")
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 8)
    .map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role || member.dashboard_role || "Staff",
      department: member.department || "Unassigned",
      status: "active" as const
    }));
}

export function buildCommandDashboard(input: {
  floor: LiveFloor;
  issues: ActiveIssue[];
  directory: StaffDirectoryMember[];
  sources: SourceStatus[];
  actions: CommandAction[];
  now: number;
}): CommandDashboard {
  const { floor } = input;
  const taxiOnSite = floor.onSite.filter(serviceMentionsTaxi).length;
  const classesToday =
    floor.onSiteByCategory.training +
    [...floor.arrivalsExpected, ...floor.lateArrivals].filter((dog) => dog.category === "training").length;
  const totalDogsToday = floor.onSite.length + floor.leftToday + floor.arrivalsExpected.length + floor.lateArrivals.length;
  const gingrDown = input.sources.some((source) => source.key === "gingr" && !source.ok);
  const anyDown = input.sources.some((source) => !source.ok);
  const health: CommandDashboard["health"] = gingrDown ? "offline" : anyDown ? "degraded" : "operational";

  return {
    health,
    healthLabel:
      health === "operational"
        ? "All Systems Operational"
        : health === "degraded"
          ? "Some feeds delayed"
          : "Gingr feed unavailable",
    kpis: [
      {
        id: "dogs_today",
        label: "Total Dogs Today",
        value: totalDogsToday,
        detail: `${floor.onSite.length} currently on site`,
        tone: "blue",
        hrefTab: "ops_command_center",
        icon: "dog"
      },
      {
        id: "boarding",
        label: "Boarding Stays",
        value: floor.onSiteByCategory.boarding,
        detail: `${floor.tomorrow.byCategory.boarding} arriving tomorrow`,
        tone: "green",
        hrefTab: "ops_command_center",
        icon: "calendar"
      },
      {
        id: "taxi",
        label: "Taxi Runs",
        value: taxiOnSite,
        detail: taxiOnSite ? "From Gingr service type" : "None checked in as taxi",
        tone: "purple",
        hrefTab: "route_generator",
        icon: "car"
      },
      {
        id: "classes",
        label: "Classes Today",
        value: classesToday,
        detail: `${floor.onSiteByCategory.training} currently in training`,
        tone: "orange",
        hrefTab: "trainer_ops",
        icon: "graduation"
      }
    ],
    timeline: buildOperationsTimeline(floor),
    issues: buildIssueSummary(input.issues, input.now),
    team: buildTeamRoster(input.directory),
    teamSource: "directory",
    locationTracking: "unavailable"
  };
}

export function mergeActivityFeed(
  ownerActivity: OwnerActivityItem[],
  staffActivity: StaffActivityLog[]
): OwnerActivityItem[] {
  const fromStaff = staffActivity.slice(0, 12).map((row) => ({
    id: `staff:${row.id}`,
    ownerName: row.created_by || "Staff",
    dogName: null,
    summary: row.title,
    at: row.created_at
  }));
  return [...ownerActivity, ...fromStaff]
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 10);
}
