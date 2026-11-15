import {
  PACK_PRIORITY2_COMMIT,
  TEAM_ENGAGEMENT_MIGRATION,
  TEMPLATE_LIBRARY_COMMIT
} from "@/lib/team-engagement/constants";

export class EngagementError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EngagementError";
    this.status = status;
    this.code = code;
  }
}

export function forbiddenError() {
  return new EngagementError(403, "forbidden", "You do not have access to this part of Team Engagement.");
}

export function notFoundError(what = "That record") {
  return new EngagementError(404, "not_found", `${what} could not be found.`);
}

export function validationError(message: string) {
  return new EngagementError(400, "invalid", message);
}

export function conflictError(message = "This record changed while you were working. Refresh and try again.") {
  return new EngagementError(409, "conflict", message);
}

export function setupRequiredError() {
  return new EngagementError(
    503,
    "setup_required",
    `Team Engagement storage is not set up yet. Run ${TEAM_ENGAGEMENT_MIGRATION} in the Supabase SQL Editor.`
  );
}

type DbErrorLike = { code?: string | null; message?: string | null; details?: string | null };

/** `team_engagement_commit` rejected a table name — needs 106/112, not core migration 103. */
export function isCommitAllowlistError(error: DbErrorLike | null | undefined) {
  if (!error) return false;
  const message = String(error.message ?? "");
  return message.includes("team_engagement_commit") && message.toLowerCase().includes("not allowed");
}

export function isMissingRelationError(error: DbErrorLike | null | undefined) {
  if (!error) return false;
  if (isCommitAllowlistError(error)) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST202" ||
    code === "PGRST205" ||
    code === "PGRST204" ||
    message.includes("schema cache") ||
    message.includes("could not find the function") ||
    (message.includes("team_engagement_commit") && message.includes("does not exist")) ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

function commitAllowlistSetupMessage(error: DbErrorLike) {
  const message = String(error.message ?? "");
  const table = message.match(/table\s+(\S+)\s+is not allowed/i)?.[1] ?? "";
  const hint = table.startsWith("team_engagement_template")
    ? `Run ${TEMPLATE_LIBRARY_COMMIT} in the Supabase SQL Editor, then reload the API schema (Settings → API → Reload).`
    : `Run ${PACK_PRIORITY2_COMMIT} in the Supabase SQL Editor (after migration 105), then reload the API schema (Settings → API → Reload).`;
  return `Team Engagement commit is out of date${table ? ` for ${table}` : ""}. ${hint}`;
}

/** Maps a Postgres / PostgREST error to a safe message. Constraint names and SQL never reach the client. */
export function mapDbError(error: DbErrorLike): EngagementError {
  if (isCommitAllowlistError(error)) {
    return new EngagementError(503, "setup_required", commitAllowlistSetupMessage(error));
  }
  if (isMissingRelationError(error)) return setupRequiredError();
  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  if (message.includes("team_engagement_conflict")) return conflictError();
  if (code === "23505") return new EngagementError(409, "duplicate", "That already exists.");
  if (code === "23503") return validationError("A linked record no longer exists. Refresh and try again.");
  if (code === "23514" || code === "22P02" || code === "22023" || code === "22007" || code === "22008") {
    return validationError("Some of the details are not valid. Check the form and try again.");
  }
  if (code === "42501") return new EngagementError(403, "forbidden", "That change is not allowed.");
  if (
    code === "42703" ||
    (message.toLowerCase().includes("column") && message.toLowerCase().includes("does not exist"))
  ) {
    return new EngagementError(
      503,
      "setup_required",
      "Team Engagement schema is out of date. Redeploy the latest RuffOps build and reload the Supabase API schema (Settings → API → Reload)."
    );
  }
  return new EngagementError(500, "storage_error", "Team Engagement could not reach its storage. Try again shortly.");
}
