import type { SupabaseClient } from "@supabase/supabase-js";
import { EngagementError, isMissingRelationError, mapDbError } from "@/lib/team-engagement/errors";
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

const PAGE_SIZE_CAP = 1000;

function quoteValue(value: string | number | boolean) {
  if (typeof value !== "string") return String(value);
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Serializes filters for PostgREST `or=(...)`. Values are always quoted so commas and parentheses stay literal. */
export function serializeOrFilters(filters: DbFilter[]): string {
  return filters
    .map((filter) => {
      if (filter.op === "or") return `or(${serializeOrFilters(filter.filters)})`;
      switch (filter.op) {
        case "in":
          return `${filter.column}.in.(${filter.value.map(quoteValue).join(",")})`;
        case "not_in":
          return `${filter.column}.not.in.(${filter.value.map(quoteValue).join(",")})`;
        case "ov":
        case "cs":
          return `${filter.column}.${filter.op}.{${filter.value.map(quoteValue).join(",")}}`;
        case "is_null":
          return `${filter.column}.is.null`;
        case "not_null":
          return `${filter.column}.not.is.null`;
        case "ilike":
          return `${filter.column}.ilike.${quoteValue(filter.value)}`;
        default:
          return `${filter.column}.${filter.op}.${quoteValue(filter.value)}`;
      }
    })
    .join(",");
}

function toRpcOp(op: DbOp) {
  switch (op.op) {
    case "insert":
      return { op: "insert", table: op.table, values: op.values };
    case "upsert":
      return { op: "upsert", table: op.table, values: op.values, conflict: op.conflict };
    case "update":
      return { op: "update", table: op.table, match: op.match, set: op.set, expect_rows: op.expectRows ?? null };
    case "delete":
      return { op: "delete", table: op.table, match: op.match, expect_rows: op.expectRows ?? null };
  }
}

export function createSupabaseEngagementDb(supabase: SupabaseClient): EngagementDb {
  return {
    async select<T>(table: EngagementTable, query: DbQuery = {}) {
      const columns = query.columns?.length ? query.columns.join(",") : "*";
      let builder = supabase.from(table).select(columns, query.count ? { count: "exact" } : undefined);
      for (const filter of query.filters ?? []) {
        if (filter.op === "or") {
          builder = builder.or(serializeOrFilters(filter.filters));
          continue;
        }
        switch (filter.op) {
          case "eq":
            builder = builder.eq(filter.column, filter.value);
            break;
          case "neq":
            builder = builder.neq(filter.column, filter.value);
            break;
          case "gt":
            builder = builder.gt(filter.column, filter.value);
            break;
          case "gte":
            builder = builder.gte(filter.column, filter.value);
            break;
          case "lt":
            builder = builder.lt(filter.column, filter.value);
            break;
          case "lte":
            builder = builder.lte(filter.column, filter.value);
            break;
          case "in":
            builder = builder.in(filter.column, filter.value);
            break;
          case "not_in":
            builder = builder.not(filter.column, "in", `(${filter.value.map(quoteValue).join(",")})`);
            break;
          case "ov":
            builder = builder.overlaps(filter.column, filter.value);
            break;
          case "cs":
            builder = builder.contains(filter.column, filter.value);
            break;
          case "is_null":
            builder = builder.is(filter.column, null);
            break;
          case "not_null":
            builder = builder.not(filter.column, "is", null);
            break;
          case "ilike":
            builder = builder.ilike(filter.column, filter.value);
            break;
        }
      }
      for (const order of query.order ?? []) {
        builder = builder.order(order.column, { ascending: order.ascending ?? true });
      }
      const limit = Math.min(Math.max(query.limit ?? PAGE_SIZE_CAP, 1), PAGE_SIZE_CAP);
      const offset = Math.max(query.offset ?? 0, 0);
      builder = builder.range(offset, offset + limit - 1);
      const { data, error, count } = await builder;
      if (error) throw mapDbError(error);
      return { rows: (data ?? []) as T[], total: typeof count === "number" ? count : null };
    },

    async commit(ops: DbOp[]) {
      if (ops.length === 0) return [];
      const { data, error } = await supabase.rpc("team_engagement_commit", { p_ops: ops.map(toRpcOp) });
      if (error) throw mapDbError(error);
      if (!Array.isArray(data)) {
        throw new EngagementError(500, "storage_error", "Team Engagement storage returned an unexpected response.");
      }
      return data as Record<string, unknown>[][];
    },

    async purge(plan: PurgePlan, audit: Record<string, unknown>) {
      const { data, error } = await supabase.rpc("team_engagement_purge", { p_plan: plan, p_audit: audit });
      if (error) throw mapDbError(error);
      return data as PurgeCounts;
    },

    async tableStatus() {
      const entries = await Promise.all(
        ENGAGEMENT_TABLES.map(async (table) => {
          const { error } = await supabase.from(table).select("*", { head: true, count: "exact" }).limit(1);
          if (!error) return [table, true] as const;
          if (isMissingRelationError(error)) return [table, false] as const;
          throw mapDbError(error);
        })
      );
      return Object.fromEntries(entries) as Record<EngagementTable, boolean>;
    }
  };
}

/** Reads every matching row in pages, up to `cap` rows. Returns whether the cap cut the result short. */
export async function selectAll<T>(
  db: EngagementDb,
  table: EngagementTable,
  query: Omit<DbQuery, "limit" | "offset" | "count">,
  cap = 20000
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  let offset = 0;
  while (rows.length < cap) {
    const page = await db.select<T>(table, { ...query, limit: PAGE_SIZE_CAP, offset });
    rows.push(...page.rows);
    if (page.rows.length < PAGE_SIZE_CAP) return { rows, truncated: false };
    offset += PAGE_SIZE_CAP;
  }
  return { rows: rows.slice(0, cap), truncated: true };
}
