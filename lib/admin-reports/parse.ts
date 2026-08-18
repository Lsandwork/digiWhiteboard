export const REPORT_KINDS_SET = new Set([
  "overview",
  "checklist",
  "photos",
  "logins",
  "walks",
  "team_log",
  "care"
]);

export function parseReportKind(value: unknown) {
  const kind = String(value ?? "overview").trim();
  return REPORT_KINDS_SET.has(kind) ? (kind as import("./types").ReportKind) : "overview";
}

function isMissingRelation(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    Boolean(error?.message?.includes("schema cache"))
  );
}

export { isMissingRelation };
