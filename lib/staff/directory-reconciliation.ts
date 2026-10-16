/**
 * Pure Staff Directory <-> admin_users reconciliation + validation.
 *
 * No Supabase, network, password, role, or permission side effects live here.
 * `admin_users` is the login source of truth; `staff_directory` (inside
 * `staff_admin_ops`) stays the directory-profile source of truth.
 * Matching: stable `admin_user_id` first, then unique normalized email.
 * Names are suggestions only and never auto-link.
 */
import type { StaffDirectoryMember } from "@/lib/staff/admin-ops";
import type { AdminUserRole } from "@/lib/admin/users";

export const STAFF_DIRECTORY_DEPARTMENTS = [
  "Front Desk",
  "Team Lead",
  "Daycare",
  "Hikers",
  "Grooming",
  "Training",
  "Management",
  "Marketing",
  "Maintenance",
  "Transportation"
] as const;

export const STAFF_DIRECTORY_DASHBOARD_ROLES: AdminUserRole[] = [
  "owner_admin",
  "manager_admin",
  "assistant_manager",
  "front_desk_coordinator",
  "team_leader",
  "groomer",
  "trainer",
  "daycare",
  "driver",
  "hiker",
  "marketing",
  "viewer"
];

export class StaffDirectoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffDirectoryValidationError";
  }
}

/** Minimal login shape (`AdminUserPublic`-compatible; never carries a hash). */
export type DirectoryAccountInput = {
  id: string;
  full_name: string;
  email: string;
  role: AdminUserRole;
  status: string;
};

export function normalizeDirectoryEmail(value: string | null | undefined): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return email || null;
}

export function normalizeDirectoryName(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function firstNameToken(value: string | null | undefined): string {
  return normalizeDirectoryName(value).split(" ")[0] ?? "";
}

/** Eligibility mirrors verified rules: active status + `@demo.com` demo accounts (lib/admin/auth.ts). Test domains are excluded conservatively. */
export function classifyAccountEligibility(account: DirectoryAccountInput): { eligible: boolean; reason: string | null } {
  if (account.status !== "active") return { eligible: false, reason: "account_not_active" };
  const email = normalizeDirectoryEmail(account.email);
  if (!email) return { eligible: false, reason: "account_missing_email" };
  if (email.endsWith("@demo.com") || email.startsWith("demo-") || email.startsWith("demo@")) {
    return { eligible: false, reason: "demo_account" };
  }
  const domain = email.split("@")[1] ?? "";
  if (domain === "test.com" || domain === "example.com" || domain === "example.org" || domain.endsWith(".test")) {
    return { eligible: false, reason: "test_account" };
  }
  if (!account.id?.trim()) return { eligible: false, reason: "account_missing_id" };
  return { eligible: true, reason: null };
}

export function isPlaceholderOrTeamMember(member: StaffDirectoryMember): boolean {
  return member.id.startsWith("default-staff-") || /\bteam$/i.test(member.name.trim());
}

export type ReconciliationFlag = {
  kind:
    | "duplicate_account_email"
    | "duplicate_profile_email"
    | "duplicate_profile_link"
    | "already_linked_to_other_account"
    | "placeholder_or_name_collision"
    | "linked_account_missing"
    | "linked_account_ineligible"
    | "profile_email_differs_from_account";
  message: string;
  accountId?: string;
  accountEmail?: string | null;
  memberId?: string;
  memberName?: string;
  candidateMemberIds?: string[];
};

export type ProposedAddition = {
  accountId: string;
  name: string;
  email: string;
  dashboardRole: AdminUserRole;
  department: string;
};

export type ProposedLink = {
  accountId: string;
  memberId: string;
  name: string;
  email: string;
  dashboardRole: AdminUserRole;
};

export type StaffDirectoryReconciliationReport = {
  generatedFrom: { directoryCount: number; accountCount: number; eligibleAccountCount: number };
  proposedAdditions: ProposedAddition[];
  proposedLinks: ProposedLink[];
  /** Accounts already correctly linked, plus valid login-less profiles preserved. */
  unchangedAccountIds: string[];
  preservedLoginlessMemberIds: string[];
  excludedAccounts: { accountId: string; email: string | null; reason: string }[];
  flagged: ReconciliationFlag[];
  summary: {
    proposedAdditions: number;
    proposedLinks: number;
    unchanged: number;
    flagged: number;
    excluded: number;
  };
};

function departmentForRole(role: AdminUserRole): string {
  switch (role) {
    case "team_leader": return "Team Lead";
    case "front_desk_coordinator": return "Front Desk";
    case "groomer": return "Grooming";
    case "trainer": return "Training";
    case "daycare": return "Daycare";
    case "driver": return "Transportation";
    case "hiker": return "Hikers";
    case "marketing": return "Marketing";
    case "manager_admin":
    case "assistant_manager":
    case "owner_admin": return "Management";
    default: return "Front Desk";
  }
}

export function buildStaffDirectoryReconciliationReport(
  directory: StaffDirectoryMember[],
  accounts: DirectoryAccountInput[]
): StaffDirectoryReconciliationReport {
  const flagged: ReconciliationFlag[] = [];
  const excludedAccounts: StaffDirectoryReconciliationReport["excludedAccounts"] = [];
  const eligible: DirectoryAccountInput[] = [];

  for (const account of accounts) {
    const verdict = classifyAccountEligibility(account);
    if (verdict.eligible) eligible.push(account);
    else excludedAccounts.push({ accountId: account.id, email: normalizeDirectoryEmail(account.email), reason: verdict.reason ?? "ineligible" });
  }

  // Duplicate eligible-account emails: none of them may auto-match.
  const accountsByEmail = new Map<string, DirectoryAccountInput[]>();
  for (const account of eligible) {
    const email = normalizeDirectoryEmail(account.email)!;
    accountsByEmail.set(email, [...(accountsByEmail.get(email) ?? []), account]);
  }
  const duplicateEmailAccountIds = new Set<string>();
  for (const [email, group] of accountsByEmail) {
    if (group.length < 2) continue;
    for (const account of group) {
      duplicateEmailAccountIds.add(account.id);
      flagged.push({ kind: "duplicate_account_email", message: `Multiple eligible accounts share email ${email}; no automatic match.`, accountId: account.id, accountEmail: email });
    }
  }

  const membersByAdminId = new Map<string, StaffDirectoryMember[]>();
  const membersByEmail = new Map<string, StaffDirectoryMember[]>();
  for (const member of directory) {
    if (member.admin_user_id) membersByAdminId.set(member.admin_user_id, [...(membersByAdminId.get(member.admin_user_id) ?? []), member]);
    const email = normalizeDirectoryEmail(member.email);
    if (email) membersByEmail.set(email, [...(membersByEmail.get(email) ?? []), member]);
  }
  for (const [adminId, group] of membersByAdminId) {
    if (group.length < 2) continue;
    for (const member of group) {
      flagged.push({ kind: "duplicate_profile_link", message: `Account ${adminId} is linked from ${group.length} directory profiles.`, accountId: adminId, memberId: member.id, memberName: member.name });
    }
  }

  const proposedAdditions: ProposedAddition[] = [];
  const proposedLinks: ProposedLink[] = [];
  const unchangedAccountIds: string[] = [];
  const allAccountIds = new Set(accounts.map((a) => a.id));
  const eligibleById = new Map(eligible.map((a) => [a.id, a]));

  for (const member of directory) {
    if (!member.admin_user_id) continue;
    if (!allAccountIds.has(member.admin_user_id)) {
      flagged.push({ kind: "linked_account_missing", message: `Profile "${member.name}" links to an account that no longer exists; profile preserved.`, memberId: member.id, memberName: member.name, accountId: member.admin_user_id });
    } else if (!eligibleById.has(member.admin_user_id)) {
      flagged.push({ kind: "linked_account_ineligible", message: `Profile "${member.name}" links to an ineligible/disabled account; profile preserved.`, memberId: member.id, memberName: member.name, accountId: member.admin_user_id });
    }
  }

  for (const account of [...eligible].sort((a, b) => a.full_name.localeCompare(b.full_name))) {
    const email = normalizeDirectoryEmail(account.email)!;
    const byId = membersByAdminId.get(account.id) ?? [];
    if (byId.length === 1) {
      const member = byId[0];
      const memberEmail = normalizeDirectoryEmail(member.email);
      if (memberEmail && memberEmail !== email) {
        flagged.push({ kind: "profile_email_differs_from_account", message: `Profile "${member.name}" is ID-linked but its email differs from the account email; left unchanged.`, accountId: account.id, accountEmail: email, memberId: member.id, memberName: member.name });
      }
      unchangedAccountIds.push(account.id);
      continue;
    }
    if (byId.length > 1) continue; // already flagged as duplicate link

    if (duplicateEmailAccountIds.has(account.id)) continue;

    const byEmail = membersByEmail.get(email) ?? [];
    if (byEmail.length > 1) {
      flagged.push({ kind: "duplicate_profile_email", message: `Email ${email} appears on ${byEmail.length} directory profiles; no automatic link.`, accountId: account.id, accountEmail: email, candidateMemberIds: byEmail.map((m) => m.id) });
      continue;
    }
    if (byEmail.length === 1) {
      const member = byEmail[0];
      if (member.admin_user_id && member.admin_user_id !== account.id) {
        flagged.push({ kind: "already_linked_to_other_account", message: `Profile "${member.name}" has this email but links to another account.`, accountId: account.id, accountEmail: email, memberId: member.id, memberName: member.name });
        continue;
      }
      proposedLinks.push({ accountId: account.id, memberId: member.id, name: member.name, email, dashboardRole: account.role });
      continue;
    }

    // Exact full-name match with any existing profile (linked or not) may be a duplicate account for the same person.
    const exactName = directory.filter((m) => normalizeDirectoryName(m.name) === normalizeDirectoryName(account.full_name));
    if (exactName.length) {
      flagged.push({
        kind: "placeholder_or_name_collision",
        message: `A profile named "${exactName[0].name}" already exists; ${account.full_name} (${email}) may be a duplicate account — human review required.`,
        accountId: account.id,
        accountEmail: email,
        candidateMemberIds: exactName.map((m) => m.id)
      });
      continue;
    }

    // No ID/email match. Names may only flag collisions (esp. placeholders) — never auto-link/add over them.
    const accountFirst = firstNameToken(account.full_name);
    const colliding = directory.filter((member) => {
      if (member.admin_user_id) return false;
      const memberName = normalizeDirectoryName(member.name);
      return memberName === normalizeDirectoryName(account.full_name) || memberName === accountFirst || firstNameToken(member.name) === accountFirst && memberName.split(" ").length === 1;
    });
    if (colliding.length) {
      flagged.push({
        kind: "placeholder_or_name_collision",
        message: `Unlinked profile(s) ${colliding.map((m) => `"${m.name}"`).join(", ")} may be a placeholder for ${account.full_name}; human review required — not auto-converted.`,
        accountId: account.id,
        accountEmail: email,
        candidateMemberIds: colliding.map((m) => m.id)
      });
      continue;
    }
    proposedAdditions.push({ accountId: account.id, name: account.full_name.trim(), email, dashboardRole: account.role, department: departmentForRole(account.role) });
  }

  const preservedLoginlessMemberIds = directory.filter((m) => !m.admin_user_id).map((m) => m.id);
  return {
    generatedFrom: { directoryCount: directory.length, accountCount: accounts.length, eligibleAccountCount: eligible.length },
    proposedAdditions,
    proposedLinks,
    unchangedAccountIds,
    preservedLoginlessMemberIds,
    excludedAccounts,
    flagged,
    summary: {
      proposedAdditions: proposedAdditions.length,
      proposedLinks: proposedLinks.length,
      unchanged: unchangedAccountIds.length,
      flagged: flagged.length,
      excluded: excludedAccounts.length
    }
  };
}

export function applyStaffDirectoryReconciliation(
  directory: StaffDirectoryMember[],
  report: StaffDirectoryReconciliationReport,
  accountsById: Map<string, DirectoryAccountInput>,
  options: { approvedAccountIds?: Set<string> | null; now: string; newId: () => string }
): { directory: StaffDirectoryMember[]; appliedAdditions: ProposedAddition[]; appliedLinks: ProposedLink[]; skippedAccountIds: string[] } {
  const approved = options.approvedAccountIds ?? null;
  const isApproved = (id: string) => !approved || approved.has(id);
  let next = [...directory];
  const appliedAdditions: ProposedAddition[] = [];
  const appliedLinks: ProposedLink[] = [];
  const skippedAccountIds: string[] = [];

  for (const link of report.proposedLinks) {
    if (!isApproved(link.accountId)) { skippedAccountIds.push(link.accountId); continue; }
    // Revalidate against the freshest directory (concurrency-safe rebase).
    if (next.some((m) => m.admin_user_id === link.accountId)) { skippedAccountIds.push(link.accountId); continue; }
    const member = next.find((m) => m.id === link.memberId);
    if (!member || member.admin_user_id) { skippedAccountIds.push(link.accountId); continue; }
    const account = accountsById.get(link.accountId);
    if (!account || !classifyAccountEligibility(account).eligible) { skippedAccountIds.push(link.accountId); continue; }
    next = next.map((m) => m.id === member.id ? {
      ...m,
      admin_user_id: link.accountId,
      email: m.email ?? link.email,
      dashboard_role: m.dashboard_role ?? link.dashboardRole,
      updated_at: options.now
    } : m);
    appliedLinks.push(link);
  }

  for (const addition of report.proposedAdditions) {
    if (!isApproved(addition.accountId)) { skippedAccountIds.push(addition.accountId); continue; }
    if (next.some((m) => m.admin_user_id === addition.accountId)) { skippedAccountIds.push(addition.accountId); continue; }
    if (next.some((m) => normalizeDirectoryEmail(m.email) === addition.email)) { skippedAccountIds.push(addition.accountId); continue; }
    const account = accountsById.get(addition.accountId);
    if (!account || !classifyAccountEligibility(account).eligible) { skippedAccountIds.push(addition.accountId); continue; }
    next = [...next, {
      id: options.newId(),
      name: addition.name,
      role: null,
      department: addition.department,
      email: addition.email,
      phone: null,
      status: "Active",
      notes: null,
      checklist_items: null,
      admin_user_id: addition.accountId,
      dashboard_role: addition.dashboardRole,
      created_at: options.now,
      updated_at: options.now
    }];
    appliedAdditions.push(addition);
  }

  return { directory: next, appliedAdditions, appliedLinks, skippedAccountIds };
}

/** Single field-validation boundary for directory create/update payloads. */
export function validateStaffDirectoryFields(
  input: Record<string, unknown>,
  options: { partial: boolean }
): void {
  const has = (key: string) => input[key] !== undefined;
  if (!options.partial || has("name")) {
    const name = String(input.name ?? "").trim();
    if (!name) throw new StaffDirectoryValidationError("Staff member name is required.");
    if (name.length > 120) throw new StaffDirectoryValidationError("Staff member name is too long.");
  }
  if (has("department")) {
    const department = String(input.department ?? "").trim();
    if (!(STAFF_DIRECTORY_DEPARTMENTS as readonly string[]).includes(department)) {
      throw new StaffDirectoryValidationError(`Unsupported department: ${department || "(empty)"}.`);
    }
  }
  if (has("status") && input.status !== "Active" && input.status !== "Inactive") {
    throw new StaffDirectoryValidationError("Staff member status must be Active or Inactive.");
  }
  if (has("email")) {
    const email = normalizeDirectoryEmail(String(input.email ?? ""));
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new StaffDirectoryValidationError("Staff member email is not a valid email address.");
    }
  }
  if (has("dashboard_role") && input.dashboard_role !== null && input.dashboard_role !== "") {
    if (!STAFF_DIRECTORY_DASHBOARD_ROLES.includes(input.dashboard_role as AdminUserRole)) {
      throw new StaffDirectoryValidationError("Unsupported dashboard role.");
    }
  }
  if (has("checklist_items") && input.checklist_items !== null && !Array.isArray(input.checklist_items)) {
    throw new StaffDirectoryValidationError("Checklist items must be a list.");
  }
  for (const key of ["role", "phone", "notes"] as const) {
    if (has(key) && input[key] !== null && String(input[key]).length > 1200) {
      throw new StaffDirectoryValidationError(`Staff member ${key} is too long.`);
    }
  }
}

/** Integrity guard run before any save: no duplicate ids or account links, directory must be an array. */
export function assertStaffDirectoryIntegrity(directory: unknown): asserts directory is StaffDirectoryMember[] {
  if (!Array.isArray(directory)) {
    throw new StaffDirectoryValidationError("Staff directory payload is missing or malformed; refusing to save.");
  }
  const ids = new Set<string>();
  const links = new Set<string>();
  for (const member of directory as StaffDirectoryMember[]) {
    if (!member?.id || ids.has(member.id)) {
      throw new StaffDirectoryValidationError("Staff directory contains a duplicate or missing profile id; refusing to save.");
    }
    ids.add(member.id);
    if (member.admin_user_id) {
      if (links.has(member.admin_user_id)) {
        throw new StaffDirectoryValidationError("Staff directory would link one login account to multiple profiles; refusing to save.");
      }
      links.add(member.admin_user_id);
    }
  }
}
