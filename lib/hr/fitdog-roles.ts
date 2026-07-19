/**
 * Canonical Fitdog role language for HR / PIP AI and role inference from records.
 * Keep this accurate — models otherwise invent “front desk booking” PIPs for handlers.
 */

export const FITDOG_ROLE_GLOSSARY = `
Fitdog role glossary (use exactly — do not invent other titles unless the manager names them):

Dog Handler / Handler / Pack Handler:
- Cares for and monitors dogs in Fitdog’s care.
- Watches dogs on the yard, manages play groups, prevents and breaks up dog altercations safely.
- Walks dogs in/out of the building, handles leash transitions, and supports safe movement between spaces.
- Follows yard safety, hygiene, water, enrichment, and dog-reading standards.
- NOT a front-desk or booking role. Handlers do not own Gingr reservations, vaccine check-in admin, or client email/phone queues.

Front Desk / Client Relations / Reception / Booking Coordinator:
- Client check-in/out, Gingr booking accuracy, vaccines/notes verification at desk, phones/emails, shift handoff notes for the lobby desk.
- Distinct from Dog Handler. Never substitute this role when the person is a handler.

Team Lead / Pack Leader (yard leadership):
- Leads handlers on the floor/yard, coaches dog handling standards, escalation for safety, and shift flow.

Groomer:
- Grooming suite work — baths, cuts, dryers, breed-specific handling, grooming safety and client finish standards.

Trainer:
- Training sessions, behavior notes, client coaching on training plans — not general yard monitoring unless also scheduled as a handler.

Other support roles (only if named by the manager): management, admin, facilities, etc.
`.trim();

export function inferEmployeeRoleFromHrSignals(input: {
  report_type?: string | null;
  department?: string | null;
  subject_name?: string | null;
  title?: string | null;
  summary?: string | null;
  dog_handler_name?: string | null;
  employee_department?: string | null;
}): string | null {
  const reportType = String(input.report_type || "").toLowerCase();
  const dept = String(input.employee_department || input.department || "").trim();
  const blob = [input.title, input.summary, input.subject_name, dept, input.dog_handler_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Owner complaints about a dog handler are always handler-role, even if department is "Front Desk"
  // (that department reflects who filed/routed the complaint, not the subject's job).
  if (reportType === "owner_complaint_dog_handler" || Boolean(input.dog_handler_name)) {
    return "Dog Handler";
  }

  if (/\b(dog\s*)?handler\b|\bpack\s*handler\b|\byard\b|\bplay\s*group\b/.test(blob)) {
    return "Dog Handler";
  }
  if (/\bpack\s*leader\b|\bteam\s*lead\b/.test(blob)) {
    return "Team Lead";
  }
  if (/\bgroomer\b|\bgrooming\b/.test(blob) || reportType.includes("groomer")) {
    return "Groomer";
  }
  if (/\btrainer\b|\btraining\b/.test(blob) || reportType.includes("trainer")) {
    return "Trainer";
  }
  if (
    /\bfront\s*desk\b|\bclient\s*relations\b|\breception\b|\bbooking\b|\bcrc\b/.test(blob) ||
    dept === "Front Desk"
  ) {
    // Only treat Front Desk as the employee role when this is NOT a handler complaint.
    if (!/\bhandler\b/.test(blob)) return "Front Desk";
  }

  if (dept && dept !== "Front Desk" && dept !== "Other") return dept;
  return null;
}
