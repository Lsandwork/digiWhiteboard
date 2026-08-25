import assert from "node:assert/strict";
import { buildOverviewPayload, emptyOverviewPayload, OVERVIEW_QUERY_TIMEOUT_MS } from "../lib/admin/overview";

function hangingQuery() {
  const hang = () => new Promise(() => undefined);
  const query: Record<string, unknown> = {};
  const self = () => query;
  query.select = self;
  query.eq = self;
  query.order = self;
  query.limit = self;
  query.maybeSingle = hang;
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    hang().then(resolve, reject);
  return query;
}

function hangingSupabase() {
  return {
    from() {
      return hangingQuery();
    }
  };
}

async function main() {
  const empty = emptyOverviewPayload();
  assert.equal(empty.degraded, true);
  assert.equal(empty.metrics.length, 6);
  assert.equal(empty.alerts.length, 0);

  const started = Date.now();
  const payload = await buildOverviewPayload(hangingSupabase() as never);
  const elapsed = Date.now() - started;

  assert.equal(payload.degraded, true);
  assert.ok(payload.metrics.length >= 6);
  assert.ok(
    elapsed < OVERVIEW_QUERY_TIMEOUT_MS + 1500,
    `overview fail-soft took ${elapsed}ms, expected under ${OVERVIEW_QUERY_TIMEOUT_MS + 1500}`
  );
  assert.ok(elapsed >= 50, `overview returned too fast (${elapsed}ms) — timeouts may not have run`);
  console.log(`admin overview fail-soft returned in ${elapsed}ms`);
  console.log("admin overview load tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
