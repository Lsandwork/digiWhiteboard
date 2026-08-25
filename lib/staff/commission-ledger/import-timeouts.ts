/** CSV import is a multi-row mutation. Keep it under Vercel maxDuration (30s). */
export const COMMISSIONS_MUTATION_TIMEOUT_MS = 25_000;

/** Browser abort must outlive the server mutation so partial JSON can return. */
export const COMMISSIONS_IMPORT_CLIENT_TIMEOUT_MS = 28_000;

export const COMMISSIONS_IMPORT_SLOW_MESSAGE =
  "Import stopped because the database was too slow. Rows already saved stay in the ledger — retry the rest.";
