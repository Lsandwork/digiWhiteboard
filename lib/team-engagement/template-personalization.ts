import { EngagementError, validationError } from "@/lib/team-engagement/errors";
import { TEMPLATE_PLACEHOLDER_PATTERN } from "@/lib/team-engagement/template-types";

const PLACEHOLDER_LABELS = [
  "Employee Name",
  "Department",
  "Milestone",
  "Date",
  "Goal",
  "Team Name",
  "Activity",
  "Deadline",
  "Recognition Category",
  "Manager Name"
] as const;

export type TemplateFieldMap = Partial<Record<(typeof PLACEHOLDER_LABELS)[number], string>>;

export function applyTemplateFields(text: string, fields: TemplateFieldMap): string {
  return text.replace(TEMPLATE_PLACEHOLDER_PATTERN, (_, label: string) => {
    const key = PLACEHOLDER_LABELS.find((entry) => entry.toLowerCase() === String(label).toLowerCase());
    if (!key) return `[${label}]`;
    const value = fields[key]?.trim();
    return value && value.length > 0 ? value : `[${label}]`;
  });
}

export function listUnresolvedPlaceholders(...parts: string[]): string[] {
  const found = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    for (const match of part.matchAll(TEMPLATE_PLACEHOLDER_PATTERN)) {
      found.add(match[0]);
    }
  }
  return [...found];
}

export function assertTemplateResolvable(title: string, message: string, instructions: string | null | undefined, asDraft: boolean): void {
  if (asDraft) return;
  const unresolved = listUnresolvedPlaceholders(title, message, instructions ?? "");
  if (unresolved.length) {
    throw validationError(`Resolve dynamic fields before publishing: ${unresolved.join(", ")}`);
  }
}

export function assertTemplateToneAllowed(tone: string): void {
  const blocked = /sarcasm|humiliat|hostile|passive-aggressive/i;
  if (blocked.test(tone)) {
    throw new EngagementError(400, "invalid", "That tone option is not allowed for Team Engagement templates.");
  }
}