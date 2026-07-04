import { CROSSOVER_TEMPLATES } from "@/lib/staff/admin-ops";
import type { CrossoverMessage } from "@/lib/staff/admin-ops";

export type CrossoverTemplateFieldType = "text" | "select" | "staff" | "department";

export type CrossoverTemplateField = {
  key: string;
  label: string;
  placeholder: string;
  type?: CrossoverTemplateFieldType;
  options?: readonly string[];
  hint?: string;
};

export type CrossoverTemplateContext = {
  toDepartment: string;
  fromDepartment: string;
};

export const CROSSOVER_TEMPLATE_FIELD_CONFIG: Record<string, CrossoverTemplateField[]> = {
  "Route Running Late": [
    { key: "route", label: "Route / Handler", placeholder: "Route/Handler", type: "text", hint: "Route name or handler" },
    { key: "minutes", label: "Minutes behind", placeholder: "X", type: "text", hint: "e.g. 15" },
    {
      key: "delay_reason",
      label: "Cause of delay",
      placeholder: "traffic/weather/issue",
      type: "select",
      options: ["traffic", "weather", "mechanical issue", "staff delay", "route issue", "other"]
    },
    { key: "pickups_done", label: "Pickups completed", placeholder: "list or none", type: "text", hint: "Dog names or none" },
    { key: "still_out", label: "Still on route", placeholder: "list", type: "text", hint: "Dogs still out" }
  ],
  "Dog Needs Extra Eyes": [
    { key: "dog", label: "Dog", placeholder: "Dog", type: "text" },
    {
      key: "demeanor",
      label: "How they were",
      placeholder: "tense/rough/overstimulated",
      type: "select",
      options: ["tense", "rough", "overstimulated"]
    },
    { key: "time", label: "Time", placeholder: "time", type: "text", hint: "e.g. 2:30 PM" },
    { key: "trigger", label: "What happened", placeholder: "what happened", type: "text" },
    { key: "handling_tip", label: "Best approach", placeholder: "handling tip", type: "text" }
  ],
  "Pickup or Drop-off Change": [
    { key: "dog_owner", label: "Dog / Owner", placeholder: "dog/owner", type: "text" },
    { key: "new_time", label: "New pickup time", placeholder: "new time", type: "text" },
    { key: "old_time", label: "Previous time", placeholder: "old time", type: "text" },
    { key: "drop_department", label: "Drop-off to", placeholder: "department", type: "department" }
  ],
  "Health Watch": [
    { key: "dog", label: "Dog", placeholder: "dog", type: "text" },
    { key: "symptom", label: "Symptom / behavior", placeholder: "symptom/behavior", type: "text" },
    { key: "time", label: "When noticed", placeholder: "time", type: "text" },
    {
      key: "owner_status",
      label: "Owner status",
      placeholder: "aware / not called yet",
      type: "select",
      options: ["aware", "not called yet"]
    },
    { key: "escalation", label: "Escalate if", placeholder: "X", type: "text", hint: "When it becomes urgent" }
  ],
  "Shift Handoff": [
    { key: "handoff_department", label: "Passing to", placeholder: "department", type: "department" },
    { key: "summary", label: "What happened / open items", placeholder: "what happened / what's still open", type: "text" },
    { key: "action_from", label: "Action needed from", placeholder: "who", type: "staff" },
    { key: "deadline", label: "Needed before", placeholder: "time", type: "text" },
    { key: "escalate_after", label: "Escalate after", placeholder: "X", type: "text", hint: "e.g. 30 min" }
  ],
  "Yard or Facility Issue": [
    { key: "area", label: "Area / gate / equipment", placeholder: "Area/gate/equipment", type: "text" },
    {
      key: "status",
      label: "Status",
      placeholder: "down/needs attention",
      type: "select",
      options: ["down", "needs attention"]
    },
    { key: "workaround", label: "Workaround", placeholder: "workaround", type: "text" },
    { key: "restricted_area", label: "Keep dogs out of", placeholder: "area", type: "text" },
    {
      key: "maintenance",
      label: "Maintenance",
      placeholder: "notified / needs a ping",
      type: "select",
      options: ["notified", "needs a ping"]
    }
  ],
  "Coverage Gap Today": [
    { key: "staff_out", label: "Who is out", placeholder: "Name/role", type: "text" },
    { key: "short_department", label: "Department short", placeholder: "department", type: "department" },
    { key: "until_time", label: "Short until", placeholder: "time", type: "text" },
    { key: "covering", label: "Who is covering", placeholder: "Who", type: "staff" }
  ],
  "Owner Called — Needs Follow-up": [
    { key: "owner", label: "Owner", placeholder: "Owner", type: "text" },
    { key: "issue", label: "Issue", placeholder: "issue", type: "text" },
    { key: "dog", label: "Dog", placeholder: "dog", type: "text" },
    {
      key: "callback_type",
      label: "They want",
      placeholder: "callback/update",
      type: "select",
      options: ["callback", "update"]
    },
    { key: "deadline", label: "By when", placeholder: "time", type: "text" }
  ],
  "Route Back — Dogs Incoming": [
    { key: "route", label: "Route / Handler", placeholder: "Route/Handler", type: "text" },
    { key: "eta", label: "Minutes out", placeholder: "X", type: "text" },
    { key: "dog_list", label: "Dogs on van", placeholder: "dog list", type: "text" },
    { key: "staging_department", label: "Staging for", placeholder: "Department", type: "department" }
  ],
  "Good Catch — Pass It On": [
    { key: "share_department", label: "Share with", placeholder: "department", type: "department" },
    { key: "observation", label: "What you noticed", placeholder: "what you noticed / what worked", type: "text" },
    { key: "context", label: "Relevant to", placeholder: "dog/owner/process", type: "text" }
  ]
};

export function getTemplateFields(templateTitle: string | null | undefined): CrossoverTemplateField[] {
  if (!templateTitle) return [];
  return CROSSOVER_TEMPLATE_FIELD_CONFIG[templateTitle] ?? [];
}

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

function placeholderValue(
  label: string,
  templateTitle: string | null,
  fieldValues: Record<string, string>,
  context: CrossoverTemplateContext
): string | null {
  const trimmed = label.trim();
  const config = templateTitle ? CROSSOVER_TEMPLATE_FIELD_CONFIG[templateTitle] : null;
  if (config) {
    const field = config.find((entry) => entry.placeholder === trimmed);
    if (field) {
      const value = fieldValues[field.key]?.trim();
      if (value) return value;
      if (field.type === "department") {
        return context.toDepartment || null;
      }
    }
  }

  const lower = trimmed.toLowerCase();
  if (lower === "department") return fieldValues.drop_department?.trim() || fieldValues.handoff_department?.trim() || fieldValues.short_department?.trim() || fieldValues.staging_department?.trim() || fieldValues.share_department?.trim() || context.toDepartment || null;

  return fieldValues[trimmed]?.trim() || null;
}

export function valueForPlaceholder(
  label: string,
  templateTitle: string | null,
  fieldValues: Record<string, string>,
  context: CrossoverTemplateContext,
  custom: Record<string, string> = {}
): string | null {
  const mapped = placeholderValue(label, templateTitle, fieldValues, context);
  if (mapped) return mapped;
  const customValue = custom[label]?.trim();
  return customValue || null;
}

export function buildMessageFromTemplate(
  template: string,
  templateTitle: string | null,
  fieldValues: Record<string, string>,
  context: CrossoverTemplateContext,
  custom: Record<string, string> = {}
): string {
  return template.replace(/\[([^\]]+)\]/g, (full, label: string) => {
    const value = valueForPlaceholder(label, templateTitle, fieldValues, context, custom);
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
  templateTitle: string | null,
  fieldValues: Record<string, string>,
  context: CrossoverTemplateContext
): Record<string, string> {
  const custom: Record<string, string> = {};
  const matches = [...template.matchAll(/\[([^\]]+)\]/g)];
  let cursor = 0;
  let messageIndex = 0;

  for (const match of matches) {
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
    if (placeholderValue(label, templateTitle, fieldValues, context)) continue;
    custom[label] = extracted;
  }

  return custom;
}

export function deriveLegacyCrossoverFields(
  templateTitle: string | null,
  fieldValues: Record<string, string>
) {
  const dog =
    fieldValues.dog?.trim() ||
    fieldValues.dog_list?.trim() ||
    fieldValues.still_out?.trim() ||
    fieldValues.dog_owner?.split("/")[0]?.trim() ||
    null;
  const owner = fieldValues.owner?.trim() || fieldValues.dog_owner?.split("/")[1]?.trim() || null;
  const route = fieldValues.route?.trim() || null;
  const traffic_weather_issue = fieldValues.delay_reason?.trim() || null;
  const assigned_to =
    fieldValues.covering?.trim() ||
    fieldValues.action_from?.trim() ||
    fieldValues.route?.trim() ||
    null;

  return {
    related_dog_name: dog,
    related_owner_name: owner,
    related_route: route,
    traffic_weather_issue,
    assigned_to,
    template_title: templateTitle,
    template_field_values: Object.keys(fieldValues).length ? fieldValues : null
  };
}

export function legacyFieldValuesFromMessage(item: CrossoverMessage): Record<string, string> {
  const stored = item.template_field_values ?? {};
  if (Object.keys(stored).length) return { ...stored };

  const values: Record<string, string> = {};
  if (item.related_dog_name) values.dog = item.related_dog_name;
  if (item.related_route) values.route = item.related_route;
  if (item.traffic_weather_issue) values.delay_reason = item.traffic_weather_issue;
  if (item.assigned_to) values.covering = item.assigned_to;
  if (item.related_owner_name) values.owner = item.related_owner_name;
  return values;
}

export function resolveCrossoverMessage(
  message: string,
  templateTitle: string | null,
  fieldValues: Record<string, string>,
  context: CrossoverTemplateContext,
  custom: Record<string, string> = {}
) {
  if (!hasBracketPlaceholders(message)) return message;
  const template = findCrossoverTemplate(message, templateTitle)?.message ?? message;
  const title = templateTitle ?? findCrossoverTemplate(message, templateTitle)?.title ?? null;
  return buildMessageFromTemplate(template, title, fieldValues, context, custom);
}
