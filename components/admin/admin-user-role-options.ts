import { ROLE_LABELS, type DepartmentKey, type RoleKey } from "@/lib/admin/permissions";

export const PRIMARY_ROLE_OPTIONS: { value: RoleKey; description: string }[] = [
  { value: "super_admin", description: "Full system access including integrations, API, and permissions matrix." },
  { value: "admin", description: "Manage users and day-to-day admin tools (no integrations or permissions matrix)." },
  { value: "management", description: "View and assign staff operations; receive management alerts." },
  { value: "front_desk_coordinator", description: "Push Notices, Front Desk Log, Owner Follow Up, Active Issues." },
  { value: "team_leader", description: "Team Lead panel: push notices, grooming push, front desk log, and more." },
  { value: "groomer", description: "Groomer panel: grooming push, front desk log, notifications, and profile." },
  { value: "trainer", description: "Trainer panel: trainer push, shift log entry, and package commissions." },
  { value: "daycare", description: "Daycare staff board access." },
  { value: "driver", description: "Transportation staff board access." },
  { value: "hiker", description: "Hiking/transportation staff board access." },
  { value: "overnight", description: "Overnight staff board access." },
  { value: "maintenance", description: "Maintenance staff board access." },
  { value: "staff", description: "Basic staff board access." },
  { value: "viewer", description: "Read-only dashboard access." }
];

export const ADDITIONAL_ROLE_OPTIONS = PRIMARY_ROLE_OPTIONS.filter(
  (option) => !["super_admin", "admin", "viewer"].includes(option.value)
);

export const DEPARTMENT_OPTIONS = Object.entries({
  front_desk: "Front Desk",
  management: "Management",
  daycare: "Daycare",
  grooming: "Grooming",
  training: "Training",
  transportation: "Transportation",
  overnight: "Overnight",
  maintenance: "Maintenance",
  admin: "Admin"
}).map(([value, label]) => ({ value: value as DepartmentKey, label }));

export function roleOptionsForCreatableRoles(creatable: RoleKey[]) {
  const allowed = new Set(creatable);
  return PRIMARY_ROLE_OPTIONS.filter((option) => allowed.has(option.value));
}
