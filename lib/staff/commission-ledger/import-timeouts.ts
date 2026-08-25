/** CSV import is a multi-row mutation. Keep it under Vercel maxDuration (30s). */
export const COMMISSIONS_MUTATION_TIMEOUT_MS = 25_000;

/** Browser abort must outlive the server mutation so partial JSON can return. */
export const COMMISSIONS_IMPORT_CLIENT_TIMEOUT_MS = 28_000;

export const COMMISSIONS_IMPORT_SLOW_MESSAGE =
  "Import stopped because the database was too slow. Rows already saved stay in the ledger — retry the rest.";

/** Payroll / rules / imports lists. Abort before the hung 5s GET client. */
export const COMMISSIONS_SUBTAB_QUERY_TIMEOUT_MS = 3_000;

/** Browser abort for those lists — longer than the server abort so delayed JSON can return. */
export const COMMISSIONS_SUBTAB_CLIENT_TIMEOUT_MS = 6_000;

export const COMMISSIONS_SUBTAB_SLOW_MESSAGE =
  "This list is delayed. The form still works — retry shortly.";
