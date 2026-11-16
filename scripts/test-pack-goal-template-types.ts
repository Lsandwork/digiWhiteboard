/**
 * Template Library Pack Goals must map catalog categories to DB goal_type values.
 * npx tsx scripts/test-pack-goal-template-types.ts
 */
import assert from "node:assert/strict";
import { normalizePackGoalType, savePackGoal, publishPackGoal } from "@/lib/team-engagement/pack-goals";
import { publishEngagementTemplate } from "@/lib/team-engagement/template-library";
import { actorFor, PEOPLE, seededDb, serviceContextFor } from "./team-engagement-fixtures";

assert.equal(normalizePackGoalType("teamwork"), "participation");
assert.equal(normalizePackGoalType("recognition"), "participation");
assert.equal(normalizePackGoalType("learning"), "completion");
assert.equal(normalizePackGoalType("workplace"), "milestone");
assert.equal(normalizePackGoalType("wellbeing"), "timebound");
assert.equal(normalizePackGoalType("numeric"), "numeric");
assert.equal(normalizePackGoalType("Motivational"), "participation");

async function main() {
  const db = seededDb();
  const manager = serviceContextFor(db, actorFor(PEOPLE.groomingManager));

  const saved = await savePackGoal(manager, {
    title: "Cross-Department Connection",
    description: "Learn more about other departments and support each other as one team.",
    goalType: "teamwork"
  });
  const draft = db.tables.team_engagement_pack_goals.find((row) => row.id === saved.id);
  assert.equal(draft?.goal_type, "participation");

  await publishPackGoal(manager, { id: saved.id });
  const live = db.tables.team_engagement_pack_goals.find((row) => row.id === saved.id);
  assert.equal(live?.status, "active");

  await publishEngagementTemplate(manager, {
    templateId: "catalog-goal-cross-dept",
    title: "Cross-Department Connection",
    message: "Learn what other departments do and how we support each other.",
    publishMode: "live"
  });

  const rows = db.tables.team_engagement_pack_goals ?? [];
  const goal = rows.find((row) => String(row.title).includes("Cross-Department"));
  assert.ok(goal, "template publish should create a pack goal");
  assert.equal(goal.goal_type, "participation");

  console.log("test-pack-goal-template-types: ok");
}

void main();