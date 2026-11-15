/**
 * Manage Fun Zone must not order trivia by updated_at (column does not exist on team_engagement_fun_trivia).
 */
import assert from "node:assert/strict";
import { funZoneManagementView } from "@/lib/team-engagement/pack-leadership";
import { actorFor, PEOPLE, seededDb, serviceContextFor } from "./team-engagement-fixtures";

async function main() {
  const db = seededDb();
  const ctx = serviceContextFor(db, actorFor(PEOPLE.admin), { now: new Date("2026-11-13T19:00:00.000Z") });
  const now = ctx.now().toISOString();
  await db.commit([
    {
      op: "insert",
      table: "team_engagement_fun_trivia",
      values: {
        id: "bbbbbbbb-0000-4000-8000-000000000099",
        title: "Quick quiz",
        prompt: "How many paws does a dog have?",
        answer_key: "four",
        status: "draft",
        created_at: now
      }
    }
  ]);
  const view = await funZoneManagementView(ctx);
  assert.equal(view.ready, true, "fun_zone_admin should load when Fun Zone tables are present");
  assert.equal(view.trivia.length, 1);
  console.log("team-engagement-fun-zone-admin: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});