type CastTvQueryTrigger =
  | "initial-load"
  | "refresh"
  | "pagination"
  | "realtime"
  | "mutation"
  | "settings"
  | "thumbnail"
  | "playlist"
  | "probe";

export type CastTvQueryLog = {
  name: string;
  rows?: number;
  durationMs: number;
  cache: "hit" | "miss" | "bypass";
  trigger: CastTvQueryTrigger;
};

export function isCastTvQueryLogEnabled() {
  if (process.env.CAST_TV_QUERY_LOG === "1") return true;
  return process.env.NODE_ENV !== "production";
}

export function logCastTvQuery(entry: CastTvQueryLog) {
  if (!isCastTvQueryLogEnabled()) return;
  console.info("[cast-tv-query]", {
    name: entry.name,
    rows: entry.rows ?? 0,
    durationMs: Math.round(entry.durationMs),
    cache: entry.cache,
    trigger: entry.trigger
  });
}

export async function withCastTvQueryLog<T>(
  entry: Omit<CastTvQueryLog, "durationMs" | "rows"> & { rows?: number },
  work: () => Promise<T>,
  rowCount?: (result: T) => number
): Promise<T> {
  const started = Date.now();
  try {
    const result = await work();
    logCastTvQuery({
      ...entry,
      rows: rowCount ? rowCount(result) : entry.rows,
      durationMs: Date.now() - started
    });
    return result;
  } catch (error) {
    logCastTvQuery({
      ...entry,
      cache: "bypass",
      durationMs: Date.now() - started
    });
    throw error;
  }
}
