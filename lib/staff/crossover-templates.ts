import { CROSSOVER_TEMPLATES } from "@/lib/staff/admin-ops";
import type { CrossoverMessage } from "@/lib/staff/admin-ops";

export type CrossoverTemplateFields = {
  dog: string;
  trafficWeatherIssue: string;
  route: string;
  assignedTo: string;
  toDepartment: string;
  fromDepartment: string;
};

export function hasBracketPlaceholders(message: string) {
  return /\[[^\]]+\]/.test(message);
}

export function findCrossoverTemplate(message?: string | null, subject?: string | null) {
  const trimmedMessage = message?.trim() ?? "";
  const trimmedSubject = subject?.trim() ?? "";
  const byMessage = CROSSOVER_TEMPLATES.find((template) => template.message === trimmedMessage);
  if (byMessage) return byMessage;
  const bySubject = CROSSOVER_TEMPLATES.find((template) => template.title === trimmedSubject);
  return bySubject ?? null;
}

function mappedValueForPlaceholder(label: string, fields: CrossoverTemplateFields): string | null {
  const key = label.trim();
  const lower = key.toLowerCase();

  if (lower === "dog" || lower === "dog list" || lower === "list" || lower === "list or none") {
    return fields.dog || null;
  }

  if (lower === "traffic/weather/issue") {
    return fields.trafficWeatherIssue || null;
  }

  if (lower === "dog/owner") {
    return fields.dog || null;
  }

  if (lower.includes("route") || lower.includes("handler")) {
    return fields.route || fields.assignedTo || null;
  }

  if (lower === "department") {
    return fields.toDepartment || null;
  }

  if (lower === "name" || lower === "who" || lower === "name/role" || lower.endsWith("/role")) {
    return fields.assignedTo || null;
  }

  return null;
}

export function valueForPlaceholder(
  label: string,
  fields: CrossoverTemplateFields,
  custom: Record<string, string> = {}
): string | null {
  const mapped = mappedValueForPlaceholder(label, fields);
  if (mapped) return mapped;
  const customValue = custom[label]?.trim();
  return customValue || null;
}

export function buildMessageFromTemplate(
  template: string,
  fields: CrossoverTemplateFields,
  custom: Record<string, string> = {}
): string {
  return template.replace(/\[([^\]]+)\]/g, (full, label: string) => {
    const value = valueForPlaceholder(label, fields, custom);
    return value ?? full;
  });
}

export function messageMatchesTemplateStructure(template: string, message: string): boolean {
  const staticParts = template.split(/\[[^\]]+\]/).filter((part) => part.length > 0);
  return staticParts.every((part) => message.includes(part));
}

export function extractCustomPlaceholdersFromEdit(
  template: string,
  message: string,
  fields: CrossoverTemplateFields
): Record<string, string> {
  const custom: Record<string, string> = {};
  const matches = [...template.matchAll(/\[([^\]]+)\]/g)];
  let cursor = 0;
  let messageIndex = 0;

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const label = match[1];
    const bracketStart = match.index ?? 0;
    const staticBefore = template.slice(cursor, bracketStart);
    const staticPos = message.indexOf(staticBefore, messageIndex);
    if (staticPos === -1) {
      cursor = bracketStart + match[0].length;
      continue;
    }

    const valueStart = staticPos + staticBefore.length;
    const nextBracketStart = bracketStart + match[0].length;
    const nextStatic = template.slice(nextBracketStart).split(/\[[^\]]+\]/)[0] ?? "";
    const valueEnd = nextStatic ? message.indexOf(nextStatic, valueStart) : message.length;
    if (valueEnd === -1) {
      cursor = nextBracketStart;
      continue;
    }

    const extracted = message.slice(valueStart, valueEnd).trim();
    messageIndex = valueEnd;
    cursor = nextBracketStart;

    if (!extracted || /^\[[^\]]+\]$/.test(extracted)) continue;
    if (mappedValueForPlaceholder(label, fields)) continue;
    custom[label] = extracted;
  }

  return custom;
}

export function crossoverFieldsFromMessage(item: Pick<
  CrossoverMessage,
  "related_dog_name" | "related_route" | "traffic_weather_issue" | "assigned_to" | "to_department" | "from_department"
>): CrossoverTemplateFields {
  return {
    dog: item.related_dog_name?.trim() ?? "",
    trafficWeatherIssue: item.traffic_weather_issue?.trim() ?? "",
    route: item.related_route?.trim() ?? "",
    assignedTo: item.assigned_to?.trim() ?? "",
    toDepartment: item.to_department,
    fromDepartment: item.from_department
  };
}

export function resolveCrossoverMessage(
  message: string,
  fields: CrossoverTemplateFields,
  subject?: string | null,
  custom: Record<string, string> = {}
) {
  if (!hasBracketPlaceholders(message)) return message;
  const template = findCrossoverTemplate(message, subject)?.message ?? message;
  return buildMessageFromTemplate(template, fields, custom);
}
