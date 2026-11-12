import type { RoleKey } from "@/lib/admin/permissions";
import type { ActionCategory, ActionPriority, CommandAction } from "@/lib/ops-command-center/action-queue";

export type StaffQuickTool = {
  tab: string;
  label: string;
  hint: string;
};

export type StaffMissionPulse = {
  onSite: number;
  pickupsDue: number;
  arrivalsExpected: number;
  medicalWatch: number;
  openActions: number;
  criticalCount: number;
};

export type StaffMissionContext = {
  greetingName: string;
  roleKey: string;
  roleLabel: string;
  headline: string;
  subhead: string;
  shiftStatus: "clear" | "busy" | "critical";
  pulse: StaffMissionPulse;
  yourQueue: CommandAction[];
  quickTools: StaffQuickTool[];
  coachingTip: string | null;
};

const PRIORITY_RANK: Record<ActionPriority, number> = { critical: 0, high: 1, attention: 2 };

const CATEGORY_WEIGHT: Record<RoleKey, Partial<Record<ActionCategory, number>>> = {
  super_admin: {},
  admin: {},
  management: {},
  front_desk_coordinator: {
    pickup: 0,
    arrival: 1,
    payment: 2,
    follow_up: 3,
    team_log: 4,
    issue: 5,
    body_check: 6,
    system: 7,
    notification: 8
  },
  team_leader: {
    issue: 0,
    body_check: 1,
    team_log: 2,
    pickup: 3,
    arrival: 4,
    follow_up: 5,
    payment: 6,
    system: 7,
    notification: 8
  },
  groomer: {
    body_check: 0,
    issue: 1,
    team_log: 2,
    pickup: 3,
    arrival: 4,
    follow_up: 5,
    payment: 6,
    system: 7,
    notification: 8
  },
  trainer: {
    body_check: 0,
    issue: 1,
    team_log: 2,
    follow_up: 3,
    pickup: 4,
    arrival: 5,
    payment: 6,
    system: 7,
    notification: 8
  },
  daycare: {
    body_check: 0,
    issue: 1,
    team_log: 2,
    pickup: 3,
    arrival: 4,
    follow_up: 5,
    payment: 6,
    system: 7,
    notification: 8
  },
  driver: { pickup: 0, arrival: 1, follow_up: 2, team_log: 3, issue: 4, body_check: 5, payment: 6, system: 7, notification: 8 },
  hiker: { pickup: 0, arrival: 1, follow_up: 2, team_log: 3, issue: 4, body_check: 5, payment: 6, system: 7, notification: 8 },
  overnight: { issue: 0, team_log: 1, body_check: 2, pickup: 3, arrival: 4, follow_up: 5, payment: 6, system: 7, notification: 8 },
  maintenance: {},
  staff: {},
  marketing: {},
  viewer: {}
};

const QUICK_TOOLS: Record<RoleKey, StaffQuickTool[]> = {
  super_admin: [
    { tab: "my_shift", label: "My Shift", hint: "Log notes and clear your queue" },
    { tab: "user_interactions", label: "Team Log", hint: "Shared shift thread" },
    { tab: "active_issues", label: "Active Issues", hint: "Floor problems to resolve" }
  ],
  admin: [
    { tab: "my_shift", label: "My Shift", hint: "Your queue and shift log" },
    { tab: "user_interactions", label: "Team Log", hint: "Cross-department notes" },
    { tab: "ms_hub", label: "Support CC", hint: "Staff cases and PIPs" }
  ],
  management: [
    { tab: "my_shift", label: "My Shift", hint: "Your queue and shift log" },
    { tab: "user_interactions", label: "Team Log", hint: "Cross-department notes" },
    { tab: "ms_hub", label: "Support CC", hint: "Staff cases and PIPs" }
  ],
  front_desk_coordinator: [
    { tab: "my_shift", label: "My Shift", hint: "Leaving & arriving lanes" },
    { tab: "owner_follow_up", label: "Owner follow-up", hint: "Calls and callbacks" },
    { tab: "user_interactions", label: "Team Log", hint: "Hand off to the next desk" }
  ],
  team_leader: [
    { tab: "my_shift", label: "My Shift", hint: "Your assignments first" },
    { tab: "yard_command", label: "Yard command", hint: "Who is where on the floor" },
    { tab: "active_issues", label: "Active issues", hint: "Fix before they escalate" },
    { tab: "ruffops_checklist", label: "Checklist", hint: "Daily yard ops rhythm" }
  ],
  groomer: [
    { tab: "my_shift", label: "My Shift", hint: "Add-on services today" },
    { tab: "grooming_push", label: "Grooming push", hint: "Dogs ready for you" },
    { tab: "body_checks", label: "Body checks", hint: "Follow-ups after inspection" }
  ],
  trainer: [
    { tab: "my_shift", label: "My Shift", hint: "Training day snapshot" },
    { tab: "trainer_ops", label: "Trainer ops", hint: "Session notes that stick" },
    { tab: "trainer_push", label: "Trainer push", hint: "Dogs in training today" }
  ],
  daycare: [
    { tab: "my_shift", label: "My Shift", hint: "What needs you now" },
    { tab: "walks_board", label: "Walks board", hint: "Pack walks and groups" },
    { tab: "body_checks", label: "Body checks", hint: "Dog health follow-ups" }
  ],
  driver: [
    { tab: "my_shift", label: "My Shift", hint: "Ops snapshot" },
    { tab: "route_generator", label: "Route generator", hint: "Today’s van plan" }
  ],
  hiker: [
    { tab: "my_shift", label: "My Shift", hint: "Ops snapshot" },
    { tab: "walks_board", label: "Walks board", hint: "Outings on the board" }
  ],
  overnight: [
    { tab: "body_checks", label: "Body checks", hint: "Wellness follow-ups on rounds" },
    { tab: "crossover_communication", label: "Team Log", hint: "Hand off to the next shift" },
    { tab: "notifications", label: "Notifications", hint: "Rounds and escalations" }
  ],
  maintenance: [{ tab: "my_shift", label: "My Shift", hint: "Facility snapshot" }],
  staff: [{ tab: "my_shift", label: "My Shift", hint: "Start here every shift" }],
  marketing: [{ tab: "my_shift", label: "My Shift", hint: "Team visibility" }],
  viewer: [{ tab: "my_shift", label: "My Shift", hint: "Read-only floor pulse" }]
};

const COACHING: Partial<Record<RoleKey, string>> = {
  front_desk_coordinator:
    "Pickups and arrivals first — owners feel the whole club through your desk. Clear payment alerts before they stack up.",
  team_leader:
    "Your team sees what you clear. Knock down assigned Team Log and issues before new dogs hit the yard.",
  groomer: "Check allergy/med flags before every dog touches the tub — Gingr notes are the source of truth.",
  daycare: "Body-check follow-ups protect the pack. Log anything odd in Team Log so the next shift inherits context.",
  trainer: "Session notes in Trainer Ops save the next handler fifteen minutes of guessing."
};

function categoryWeight(roleKey: string, category: ActionCategory): number {
  const weights = CATEGORY_WEIGHT[roleKey as RoleKey] ?? CATEGORY_WEIGHT.staff;
  return weights[category] ?? 50;
}

export function prioritizeActionsForRole(actions: CommandAction[], roleKey: string): CommandAction[] {
  return [...actions].sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    const cw = categoryWeight(roleKey, a.category) - categoryWeight(roleKey, b.category);
    if (cw !== 0) return cw;
    return String(a.at ?? "~").localeCompare(String(b.at ?? "~"));
  });
}

export function staffQuickTools(roleKey: string): StaffQuickTool[] {
  return QUICK_TOOLS[roleKey as RoleKey] ?? QUICK_TOOLS.staff;
}

function firstName(displayName: string | null | undefined, email: string | null | undefined) {
  const fromDisplay = (displayName || "").trim().split(/\s+/)[0];
  if (fromDisplay) return fromDisplay;
  const local = (email || "").split("@")[0] || "";
  if (!local) return "there";
  return local.replace(/[._-]+/g, " ").split(/\s+/)[0] || "there";
}

export function buildStaffMissionContext(input: {
  roleKey: string;
  roleLabel: string;
  displayName?: string | null;
  email?: string | null;
  actions: CommandAction[];
  pulse: StaffMissionPulse;
}): StaffMissionContext {
  const greetingName = firstName(input.displayName, input.email);
  const yourQueue = prioritizeActionsForRole(input.actions, input.roleKey).slice(0, 8);
  const criticalCount = input.actions.filter((a) => a.priority === "critical").length;
  const shiftStatus: StaffMissionContext["shiftStatus"] =
    criticalCount > 0 ? "critical" : input.actions.length > 0 ? "busy" : "clear";

  const headlines: Record<StaffMissionContext["shiftStatus"], string> = {
    clear: `${greetingName}, the floor is in good shape.`,
    busy: `${greetingName}, here's what keeps the shift smooth.`,
    critical: `${greetingName}, a few things need you now.`
  };

  const subheads: Record<StaffMissionContext["shiftStatus"], string> = {
    clear: "Use the time to prep tomorrow and log anything the next team should know.",
    busy: `${yourQueue.length} prioritized moves for ${input.roleLabel}.`,
    critical: `${criticalCount} urgent item${criticalCount === 1 ? "" : "s"} — start at the top of your queue.`
  };

  return {
    greetingName,
    roleKey: input.roleKey,
    roleLabel: input.roleLabel,
    headline: headlines[shiftStatus],
    subhead: subheads[shiftStatus],
    shiftStatus,
    pulse: input.pulse,
    yourQueue,
    quickTools: staffQuickTools(input.roleKey),
    coachingTip: COACHING[input.roleKey as RoleKey] ?? null
  };
}
