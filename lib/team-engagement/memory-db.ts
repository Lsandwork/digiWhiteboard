import { randomUUID } from "node:crypto";
import { EngagementError } from "@/lib/team-engagement/errors";
import {
  ENGAGEMENT_TABLES,
  type DbFilter,
  type DbOp,
  type DbQuery,
  type EngagementDb,
  type EngagementTable,
  type PurgeCounts,
  type PurgePlan
} from "@/lib/team-engagement/types";

type Row = Record<string, unknown>;

const PRIMARY_KEYS: Partial<Record<EngagementTable, string[]>> = {
  team_engagement_department_profiles: ["department_key"],
  team_engagement_department_managers: ["department_key", "manager_user_id"],
  team_engagement_settings: ["setting_key"],
  team_engagement_preferences: ["user_id"]
};

const UNIQUE_KEYS: Partial<Record<EngagementTable, { columns: string[]; where?: (row: Row) => boolean }[]>> = {
  team_engagement_reactions: [{ columns: ["bark_out_id", "user_id", "reaction"] }],
  team_engagement_reports: [{ columns: ["bark_out_id", "reporter_user_id"], where: (row) => row.status === "open" }],
  team_engagement_nominations: [
    { columns: ["program_id", "nominee_user_id", "period_label"], where: (row) => row.status !== "withdrawn" }
  ]
};

const CASCADES: { parent: EngagementTable; child: EngagementTable; column: string }[] = [
  { parent: "team_engagement_bark_outs", child: "team_engagement_moderation_events", column: "bark_out_id" },
  { parent: "team_engagement_bark_outs", child: "team_engagement_reactions", column: "bark_out_id" },
  { parent: "team_engagement_bark_outs", child: "team_engagement_reports", column: "bark_out_id" },
  { parent: "team_engagement_feedback", child: "team_engagement_feedback_events", column: "feedback_id" },
  { parent: "team_engagement_programs", child: "team_engagement_nominations", column: "program_id" }
];

function primaryKey(table: EngagementTable) {
  return PRIMARY_KEYS[table] ?? ["id"];
}

function sameValue(a: unknown, b: unknown) {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  return (a ?? null) === (b ?? null);
}

function compare(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function likeToRegExp(pattern: string) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

export function rowMatchesFilter(row: Row, filter: DbFilter): boolean {
  if (filter.op === "or") return filter.filters.some((inner) => rowMatchesFilter(row, inner));
  const value = row[filter.column];
  switch (filter.op) {
    case "eq":
      return sameValue(value, filter.value);
    case "neq":
      return value !== null && value !== undefined && !sameValue(value, filter.value);
    case "gt":
      return value !== null && value !== undefined && compare(value, filter.value) > 0;
    case "gte":
      return value !== null && value !== undefined && compare(value, filter.value) >= 0;
    case "lt":
      return value !== null && value !== undefined && compare(value, filter.value) < 0;
    case "lte":
      return value !== null && value !== undefined && compare(value, filter.value) <= 0;
    case "in":
      return filter.value.some((candidate) => sameValue(value, candidate));
    case "not_in":
      return value !== null && value !== undefined && !filter.value.some((candidate) => sameValue(value, candidate));
    case "ov":
      return Array.isArray(value) && value.some((item) => filter.value.includes(String(item)));
    case "cs":
      return Array.isArray(value) && filter.value.every((item) => value.map(String).includes(item));
    case "is_null":
      return value === null || value === undefined;
    case "not_null":
      return value !== null && value !== undefined;
    case "ilike":
      return typeof value === "string" && likeToRegExp(filter.value).test(value);
  }
}

function matchesAll(row: Row, match: Row) {
  return Object.entries(match).every(([column, expected]) => sameValue(row[column], expected));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export type MemoryEngagementDb = EngagementDb & {
  tables: Record<EngagementTable, Row[]>;
  missingTables: Set<EngagementTable>;
  commits: DbOp[][];
};

/** In-memory EngagementDb with the same transaction, uniqueness, and append-only rules as the SQL migration. */
export function createMemoryEngagementDb(seed: Partial<Record<EngagementTable, Row[]>> = {}): MemoryEngagementDb {
  let tables = Object.fromEntries(ENGAGEMENT_TABLES.map((table) => [table, clone(seed[table] ?? [])])) as Record<
    EngagementTable,
    Row[]
  >;
  const missingTables = new Set<EngagementTable>();
  const commits: DbOp[][] = [];

  function assertAvailable(table: EngagementTable) {
    if (missingTables.has(table)) {
      throw new EngagementError(503, "setup_required", "Team Engagement storage is not set up yet.");
    }
  }

  function assertConstraints(table: EngagementTable, rows: Row[], row: Row) {
    const keyColumns = primaryKey(table);
    const duplicates = rows.filter((other) => other !== row && keyColumns.every((column) => sameValue(other[column], row[column])));
    if (duplicates.length > 0) throw new EngagementError(409, "duplicate", "That already exists.");
    for (const unique of UNIQUE_KEYS[table] ?? []) {
      if (unique.where && !unique.where(row)) continue;
      const clash = rows.some(
        (other) =>
          other !== row &&
          (!unique.where || unique.where(other)) &&
          unique.columns.every((column) => sameValue(other[column], row[column]))
      );
      if (clash) throw new EngagementError(409, "duplicate", "That already exists.");
    }
    if (
      table === "team_engagement_bark_outs" &&
      row.author_user_id &&
      row.recipient_user_id &&
      row.author_user_id === row.recipient_user_id
    ) {
      throw new EngagementError(400, "invalid", "Some of the details are not valid. Check the form and try again.");
    }
    if (
      table === "team_engagement_nominations" &&
      row.nominated_by_user_id &&
      row.nominated_by_user_id === row.nominee_user_id
    ) {
      throw new EngagementError(400, "invalid", "Some of the details are not valid. Check the form and try again.");
    }
  }

  function withDefaults(table: EngagementTable, values: Row): Row {
    const now = new Date().toISOString();
    const row: Row = { ...values };
    if (primaryKey(table).includes("id") && !row.id) row.id = randomUUID();
    if (table === "team_engagement_audit_events" && !row.occurred_at) row.occurred_at = now;
    if (!("created_at" in row) && table !== "team_engagement_settings" && table !== "team_engagement_department_profiles" && table !== "team_engagement_preferences") {
      row.created_at = now;
    }
    return row;
  }

  function cascadeDelete(state: Record<EngagementTable, Row[]>, table: EngagementTable, removed: Row[]) {
    for (const cascade of CASCADES.filter((entry) => entry.parent === table)) {
      const ids = new Set(removed.map((row) => row.id));
      const children = state[cascade.child].filter((child) => ids.has(child[cascade.column]));
      state[cascade.child] = state[cascade.child].filter((child) => !ids.has(child[cascade.column]));
      cascadeDelete(state, cascade.child, children);
    }
  }

  function applyOp(state: Record<EngagementTable, Row[]>, op: DbOp, index: number): Row[] {
    assertAvailable(op.table);
    if (op.table === "team_engagement_audit_events" && op.op !== "insert") {
      throw new EngagementError(403, "forbidden", "That change is not allowed.");
    }
    const rows = state[op.table];
    if (op.op === "insert") {
      const row = withDefaults(op.table, op.values);
      rows.push(row);
      assertConstraints(op.table, rows, row);
      return [clone(row)];
    }
    if (op.op === "upsert") {
      const existing = rows.find((row) => op.conflict.every((column) => sameValue(row[column], op.values[column])));
      if (existing) {
        Object.assign(existing, op.values);
        assertConstraints(op.table, rows, existing);
        return [clone(existing)];
      }
      const row = withDefaults(op.table, op.values);
      rows.push(row);
      assertConstraints(op.table, rows, row);
      return [clone(row)];
    }
    if (op.op === "update") {
      const targets = rows.filter((row) => matchesAll(row, op.match));
      if (op.expectRows !== undefined && targets.length !== op.expectRows) {
        throw new EngagementError(409, "conflict", `team_engagement_conflict: op ${index} changed ${targets.length} rows`);
      }
      for (const row of targets) {
        Object.assign(row, op.set);
        assertConstraints(op.table, rows, row);
      }
      return targets.map((row) => clone(row));
    }
    const targets = rows.filter((row) => matchesAll(row, op.match));
    if (op.expectRows !== undefined && targets.length !== op.expectRows) {
      throw new EngagementError(409, "conflict", `team_engagement_conflict: op ${index} changed ${targets.length} rows`);
    }
    state[op.table] = rows.filter((row) => !targets.includes(row));
    cascadeDelete(state, op.table, targets);
    return targets.map((row) => clone(row));
  }

  const db: MemoryEngagementDb = {
    get tables() {
      return tables;
    },
    missingTables,
    commits,

    async select<T>(table: EngagementTable, query: DbQuery = {}) {
      assertAvailable(table);
      let rows = tables[table].filter((row) => (query.filters ?? []).every((filter) => rowMatchesFilter(row, filter)));
      const total = rows.length;
      for (const order of [...(query.order ?? [])].reverse()) {
        rows = [...rows].sort((a, b) => {
          const result = compare(a[order.column], b[order.column]);
          return order.ascending === false ? -result : result;
        });
      }
      const offset = Math.max(query.offset ?? 0, 0);
      const limit = Math.min(Math.max(query.limit ?? 1000, 1), 1000);
      const page = clone(rows.slice(offset, offset + limit));
      const columns = query.columns;
      const projected = columns?.length
        ? page.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null])))
        : page;
      return { rows: projected as T[], total: query.count ? total : null };
    },

    async commit(ops: DbOp[]) {
      const draft = clone(tables);
      const results = ops.map((op, index) => applyOp(draft, op, index));
      tables = draft;
      commits.push(clone(ops));
      return results;
    },

    async purge(plan: PurgePlan, audit: Row): Promise<PurgeCounts> {
      const draft = clone(tables);
      const counts: PurgeCounts = {
        rejected_bark_outs: 0,
        withdrawn_bark_outs: 0,
        removed_bark_outs: 0,
        closed_feedback: 0,
        audit_events: 0
      };
      const purgeBarkOuts = (status: string, before: string | undefined, column: string, key: keyof PurgeCounts) => {
        if (!before) return;
        const removed = draft.team_engagement_bark_outs.filter(
          (row) => row.status === status && String(row[column]) < before
        );
        draft.team_engagement_bark_outs = draft.team_engagement_bark_outs.filter((row) => !removed.includes(row));
        cascadeDelete(draft, "team_engagement_bark_outs", removed);
        counts[key] = removed.length;
      };
      purgeBarkOuts("rejected", plan.rejected_before, "created_at", "rejected_bark_outs");
      purgeBarkOuts("withdrawn", plan.withdrawn_before, "updated_at", "withdrawn_bark_outs");
      purgeBarkOuts("removed", plan.removed_before, "updated_at", "removed_bark_outs");
      if (plan.closed_feedback_before) {
        const removed = draft.team_engagement_feedback.filter(
          (row) =>
            (row.status === "resolved" || row.status === "declined") && String(row.updated_at) < plan.closed_feedback_before!
        );
        draft.team_engagement_feedback = draft.team_engagement_feedback.filter((row) => !removed.includes(row));
        cascadeDelete(draft, "team_engagement_feedback", removed);
        counts.closed_feedback = removed.length;
      }
      if (plan.audit_before) {
        const floor = new Date(Date.now() - 365 * 86_400_000).toISOString();
        if (plan.audit_before > floor) {
          throw new EngagementError(400, "invalid", "Audit history younger than 365 days cannot be purged.");
        }
        const before = draft.team_engagement_audit_events.length;
        draft.team_engagement_audit_events = draft.team_engagement_audit_events.filter(
          (row) => String(row.occurred_at) >= plan.audit_before!
        );
        counts.audit_events = before - draft.team_engagement_audit_events.length;
      }
      draft.team_engagement_audit_events.push(withDefaults("team_engagement_audit_events", { ...audit, new_value: counts }));
      tables = draft;
      return counts;
    },

    async tableStatus() {
      return Object.fromEntries(ENGAGEMENT_TABLES.map((table) => [table, !missingTables.has(table)])) as Record<
        EngagementTable,
        boolean
      >;
    }
  };
  return db;
}
