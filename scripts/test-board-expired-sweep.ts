import assert from "node:assert/strict";
import { sweepExpiredTransitionRows } from "../lib/board-fast-checkout";
import { setCachedBackOfHouseBoard } from "../lib/gingr-request-guard";
import type { LiveDog } from "../lib/types";

const now = new Date();
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

function dog(overrides: Partial<LiveDog> & Pick<LiveDog, "id" | "display_status">): LiveDog {
  return {
    gingr_reservation_id: null,
    gingr_animal_id: null,
    animal_name: "Dog",
    owner_name: null,
    photo_url: null,
    reservation_type: "Daycare",
    current_status: overrides.display_status,
    room: null,
    notes: null,
    flags: {},
    status_started_at: minutesAgo(0),
    completed_at: null,
    display_until: null,
    last_seen_from_gingr_at: null,
    raw_payload: { source: "gingr_webhook" },
    hidden: false,
    updated_at: minutesAgo(0),
    ...overrides
  } as LiveDog;
}

const rows: LiveDog[] = [
  dog({
    id: "expired-checkout",
    display_status: "checking_out",
    gingr_reservation_id: "res-expired",
    status_started_at: minutesAgo(30)
  }),
  dog({
    id: "basket-checkout",
    display_status: "checking_out",
    gingr_reservation_id: "res-basket",
    gingr_animal_id: "animal-basket",
    status_started_at: minutesAgo(30)
  }),
  dog({
    id: "live-checkout",
    display_status: "checking_out",
    gingr_reservation_id: "res-live",
    status_started_at: minutesAgo(1)
  }),
  dog({ id: "expired-checkin", display_status: "checking_in", status_started_at: minutesAgo(30) }),
  dog({ id: "live-checkin", display_status: "checking_in", status_started_at: minutesAgo(1) })
];

// The dog still sitting in Gingr's checkout basket must survive the sweep.
setCachedBackOfHouseBoard({
  checking_in: [],
  checking_out: [{ id: "res-basket", animal_id: "animal-basket" }],
  source: "gingr_back_of_house"
});

const hiddenIds: string[] = [];

function makeSupabaseStub() {
  return {
    from() {
      let mode: "select" | "update" = "select";
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      Object.assign(builder, {
        select: chain,
        eq: chain,
        order: chain,
        limit: chain,
        update: () => {
          mode = "update";
          return builder;
        },
        in: (column: string, values: string[]) => {
          if (mode === "update" && column === "id") hiddenIds.push(...values);
          return builder;
        },
        then: (resolve: (value: unknown) => void) =>
          resolve(mode === "update" ? { error: null } : { data: rows, error: null })
      });
      return builder;
    }
  };
}

async function main() {
  const supabase = makeSupabaseStub() as unknown as Parameters<typeof sweepExpiredTransitionRows>[0];
  const result = await sweepExpiredTransitionRows(supabase, now);

  assert.deepEqual(
    [...hiddenIds].sort(),
    ["expired-checkin", "expired-checkout"],
    "sweep retires only rows whose display window already closed"
  );
  assert.equal(result.hidden_count, 2);
  assert.ok(!hiddenIds.includes("basket-checkout"), "a dog still in the Gingr basket is never swept");
  assert.ok(!hiddenIds.includes("live-checkout"), "an active checkout keeps its full display window");
  assert.ok(!hiddenIds.includes("live-checkin"), "an active check-in keeps its full display window");

  const debounced = await sweepExpiredTransitionRows(supabase, now);
  assert.equal(debounced.hidden_count, 0, "sweep is debounced so 1s board polls never hammer Supabase");

  console.log("board expired sweep checks passed");
}

void main();
