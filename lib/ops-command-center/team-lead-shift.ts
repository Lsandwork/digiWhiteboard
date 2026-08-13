import { isTeamLeadDepartmentLabel } from "@/lib/admin/team-lead-profile";
import type { ActiveIssue, CrossoverMessage, StaffDirectoryMember } from "@/lib/staff/admin-ops";
import { belongsInOpenLog, shiftLogSubmittedBy } from "@/lib/staff/front-desk-log";

export type ShiftActor = {
  name?: string | null;
  email?: string | null;
  adminUserId?: string | null;
  directoryName?: string | null;
};

export type TeamLeadShiftNote = {
  id: string;
  title: string;
  detail: string | null;
  submittedBy: string;
  createdAt: string;
  dogName?: string | null;
  status?: string | null;
};

function normalizeToken(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

export function assignmentTokensForActor(actor: ShiftActor): string[] {
  const tokens = new Set<string>();
  const name = normalizeToken(actor.directoryName || actor.name);
  const email = normalizeToken(actor.email);
  if (name) {
    tokens.add(name);
    const first = name.split(/\s+/)[0];
    if (first && first.length >= 2) tokens.add(first);
  }
  if (email) {
    tokens.add(email);
    const local = email.split("@")[0]?.replace(/[._]+/g, " ").trim();
    if (local && local.length >= 2) tokens.add(local);
  }
  return [...tokens];
}

function assignedToActorName(assignedTo: string, assignedTeam: string, actor: ShiftActor) {
  const tokens = assignmentTokensForActor(actor);
  if (!tokens.length) return false;
  const haystacks = [assignedTo, assignedTeam].filter(Boolean);
  return haystacks.some((hay) => tokens.some((token) => token.length >= 2 && (hay === token || hay.includes(token) || token.includes(hay))));
}

export function assignedToTeamLeadUser(
  assignedTo: string | null | undefined,
  assignedTeam: string | null | undefined,
  actor: ShiftActor
): boolean {
  const assigned = normalizeToken(assignedTo);
  const team = normalizeToken(assignedTeam);
  if (!assigned && !team) return false;
  if (isTeamLeadDepartmentLabel(assigned) || isTeamLeadDepartmentLabel(team)) return true;
  if (assigned === "team leaders" || team === "team leaders") return true;
  return assignedToActorName(assigned, team, actor);
}

export function isGroomingAssignmentLabel(value?: string | null) {
  const token = normalizeToken(value);
  if (!token) return false;
  return token === "grooming team" || token === "groomers" || token === "groomer" || token === "grooming";
}

export function assignedToGroomerUser(
  assignedTo: string | null | undefined,
  assignedTeam: string | null | undefined,
  actor: ShiftActor
): boolean {
  const assigned = normalizeToken(assignedTo);
  const team = normalizeToken(assignedTeam);
  if (!assigned && !team) return false;
  if (isGroomingAssignmentLabel(assigned) || isGroomingAssignmentLabel(team)) return true;
  return assignedToActorName(assigned, team, actor);
}

export function directoryMemberForUser(
  directory: StaffDirectoryMember[],
  actor: { adminUserId?: string | null; email?: string | null; name?: string | null }
): StaffDirectoryMember | null {
  const id = normalizeToken(actor.adminUserId);
  const email = normalizeToken(actor.email);
  const name = normalizeToken(actor.name);
  return (
    directory.find((member) => id && normalizeToken(member.admin_user_id) === id) ||
    directory.find((member) => email && normalizeToken(member.email) === email) ||
    directory.find((member) => name && normalizeToken(member.name) === name) ||
    null
  );
}

export function isTeamLeadSubmitter(message: CrossoverMessage, directory: StaffDirectoryMember[]): boolean {
  if (isTeamLeadDepartmentLabel(message.from_department) || isTeamLeadDepartmentLabel(message.department_area)) {
    return true;
  }
  const submitter = normalizeToken(message.submitted_by || message.created_by);
  if (!submitter) return false;
  const member =
    directory.find((entry) => normalizeToken(entry.name) === submitter) ||
    directory.find((entry) => normalizeToken(entry.email) === submitter) ||
    directory.find((entry) => normalizeToken(entry.admin_user_id) === submitter);
  if (!member) return false;
  return (
    member.dashboard_role === "team_leader" ||
    isTeamLeadDepartmentLabel(member.department) ||
    /team lead/i.test(member.role || "")
  );
}

export function isCurrentUserSubmitter(message: CrossoverMessage, actor: ShiftActor): boolean {
  const submitter = normalizeToken(message.submitted_by || message.created_by);
  if (!submitter) return false;
  const tokens = assignmentTokensForActor(actor);
  return tokens.some((token) => token.length >= 2 && (submitter === token || submitter.includes(token) || token.includes(submitter)));
}

export function previousTeamLeadShiftNotes(
  messages: CrossoverMessage[],
  actor: ShiftActor,
  directory: StaffDirectoryMember[],
  limit = 8
): { previousLeadName: string | null; notes: TeamLeadShiftNote[] } {
  const tlNotes = messages
    .filter((message) => isTeamLeadSubmitter(message, directory))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const previous = tlNotes.filter((message) => !isCurrentUserSubmitter(message, actor));
  if (!previous.length) return { previousLeadName: null, notes: [] };

  const previousLeadName = shiftLogSubmittedBy(previous[0]);
  const prevKey = previousLeadName.trim().toLowerCase();
  const notes = previous
    .filter((message) => shiftLogSubmittedBy(message).trim().toLowerCase() === prevKey)
    .slice(0, limit)
    .map((message) => ({
      id: message.id,
      title: message.subject || message.log_type || "Shift note",
      detail: String(message.details || message.message || "").trim() || null,
      submittedBy: shiftLogSubmittedBy(message),
      createdAt: message.created_at,
      dogName: message.related_dog_name,
      status: message.status
    }));

  return { previousLeadName, notes };
}

export function assignedOpenLogMessages(messages: CrossoverMessage[], actor: ShiftActor): CrossoverMessage[] {
  return messages.filter(
    (message) => belongsInOpenLog(message) && assignedToTeamLeadUser(message.assigned_to, message.assigned_team, actor)
  );
}

export function assignedActiveIssues(issues: ActiveIssue[], actor: ShiftActor): ActiveIssue[] {
  return issues.filter((issue) => assignedToTeamLeadUser(issue.assigned_to, null, actor));
}

export function assignedGroomerOpenLogMessages(messages: CrossoverMessage[], actor: ShiftActor): CrossoverMessage[] {
  return messages.filter(
    (message) => belongsInOpenLog(message) && assignedToGroomerUser(message.assigned_to, message.assigned_team, actor)
  );
}

export function assignedGroomerActiveIssues(issues: ActiveIssue[], actor: ShiftActor): ActiveIssue[] {
  return issues.filter((issue) => assignedToGroomerUser(issue.assigned_to, null, actor));
}
