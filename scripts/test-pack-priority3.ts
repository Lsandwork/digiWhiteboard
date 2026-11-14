/**
 * Pack Priority 3: goals, anonymous voice, leadership overview.
 * Run: npx tsx scripts/test-pack-priority3.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { employeeVoiceCatalog, publishVoiceSurvey, saveVoiceSurvey, submitVoiceSurvey, voiceSurveyResults } from "@/lib/team-engagement/employee-voice";
import { listPackGoalsLeadership, packGoalsEmployeeView, publishPackGoal, savePackGoal, updatePackGoalProgress } from "@/lib/team-engagement/pack-goals";
import { packEngagementOverview } from "@/lib/team-engagement/pack-leadership";
import { syncPackMilestonesCore } from "@/lib/team-engagement/pack-features";
import { actorFor, buildDirectory, PEOPLE, seededDb, serviceContextFor } from "./team-engagement-fixtures";

async function main() {
  const db = seededDb();
  const manager = serviceContextFor(db, actorFor(PEOPLE.groomingManager));
  const groomer = serviceContextFor(db, actorFor(PEOPLE.groomer));

  const { id: goalId } = await savePackGoal(manager, {
    title: "500 great check-ins",
    description: "As a team, complete five hundred excellent dog check-ins this month.",
    goalType: "numeric",
    targetValue: 500,
    unit: "check-ins"
  });
  await publishPackGoal(manager, { id: goalId });
  await updatePackGoalProgress(manager, { id: goalId, currentValue: 500, complete: true });

  const employeeGoals = await packGoalsEmployeeView(groomer);
  assert.equal(employeeGoals.ready, true);
  assert.equal(employeeGoals.active.length, 0);
  assert.ok(employeeGoals.completed.some((g) => g.id === goalId));

  const leadershipGoals = await listPackGoalsLeadership(manager);
  assert.ok(leadershipGoals.items.some((g) => g.status === "completed"));

  const { id: surveyId } = await saveVoiceSurvey(manager, {
    title: "Team pulse",
    anonymityMode: "anonymous",
    minAggregateResponses: 1,
    questions: [{ prompt: "How are you?", questionType: "rating", required: true }]
  });
  await publishVoiceSurvey(manager, { id: surveyId });
  assert.equal(db.tables.team_engagement_voice_surveys[0]?.min_aggregate_responses, 1);
  const catalog = await employeeVoiceCatalog(groomer);
  assert.equal(catalog.ready, true);
  assert.ok(catalog.items.some((s) => s.id === surveyId));
  await submitVoiceSurvey(groomer, { surveyId, answers: { [catalog.items[0].questions[0].id]: 4 } });

  const results = await voiceSurveyResults(manager, { id: surveyId });
  const first = results.questions[0] as { responseCount: number; suppressed?: boolean };
  assert.equal(first.responseCount, 1);
  assert.equal(first.suppressed, false);

  const raw = db.tables.team_engagement_voice_anonymous_responses;
  assert.equal(raw.length, 1);
  assert.ok(!("responder_user_id" in (raw[0] as object)));

  const hash = createHash("sha256")
    .update(`team_engagement_voice:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? "development-only-pepper"}:${PEOPLE.groomer.id}:${surveyId}`)
    .digest("hex");
  assert.ok(db.tables.team_engagement_voice_anonymous_completions.some((row) => row.participant_hash === hash));

  const overview = await packEngagementOverview(manager);
  assert.ok(overview.goals.completed >= 1);

  const synced = await syncPackMilestonesCore({
    db,
    staff: [{ admin_user_id: PEOPLE.groomer.id, name: PEOPLE.groomer.name, hire_date: "2023-01-15", birthday_month: null, birthday_day: null, show_birthday: false }],
    directory: buildDirectory()
  });
  assert.ok(synced.generated >= 1);

  console.log("test-pack-priority3: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});