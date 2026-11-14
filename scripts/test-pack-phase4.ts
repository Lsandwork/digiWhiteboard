/**
 * Pack Phase 4: goal join, team pulse, voice outcomes, WYR, events.
 * Run: npx tsx scripts/test-pack-phase4.ts
 */
import assert from "node:assert/strict";
import { publishPackGoal, savePackGoal } from "@/lib/team-engagement/pack-goals";
import {
  funZonePhase4View,
  joinPackGoal,
  publishPackEvent,
  publishWouldYouRather,
  saveVoiceOutcome,
  submitTeamPulse,
  voteWouldYouRather,
  rsvpPackEvent,
  youSaidWeDidView
} from "@/lib/team-engagement/pack-phase4";
import { actorFor, PEOPLE, seededDb, serviceContextFor } from "./team-engagement-fixtures";

async function main() {
  const db = seededDb();
  const manager = serviceContextFor(db, actorFor(PEOPLE.groomingManager));
  const groomer = serviceContextFor(db, actorFor(PEOPLE.groomer));

  const { id: goalId } = await savePackGoal(manager, {
    title: "Team spirit",
    description: "Everyone joins one Pack goal",
    goalType: "participation",
    targetValue: 1,
    unit: "members"
  });
  await publishPackGoal(manager, { id: goalId });
  await joinPackGoal(groomer, { goalId });
  assert.equal(db.tables.team_engagement_pack_goal_participants.length, 1);

  await submitTeamPulse(groomer, { workload: 4, support: 5, connection: 4, note: "Solid week" });
  assert.equal(db.tables.team_engagement_team_pulse_responses.length, 1);

  await saveVoiceOutcome(manager, {
    theme: "Break coverage",
    managementResponse: "We added a floater on busy days.",
    actionTaken: "New schedule starts Monday.",
    publish: true
  });
  const outcomes = await youSaidWeDidView(groomer);
  assert.equal(outcomes.ready, true);
  assert.equal(outcomes.items.length, 1);

  await publishWouldYouRather(manager, { optionA: "Pizza party", optionB: "Extra PTO hour" });
  let fun4 = await funZonePhase4View(groomer);
  assert.ok(fun4.wouldYouRather);
  await voteWouldYouRather(groomer, { questionId: fun4.wouldYouRather!.id, choice: "a" });
  fun4 = await funZonePhase4View(groomer);
  assert.equal(fun4.wouldYouRather!.voted, true);
  assert.equal(fun4.wouldYouRather!.votesA, 1);

  const startsAt = new Date().toISOString();
  await publishPackEvent(manager, { title: "Pack hike", description: "Trail behind the shop", location: "Griffith", startsAt });
  fun4 = await funZonePhase4View(groomer);
  assert.equal(fun4.events.length, 1);
  await rsvpPackEvent(groomer, { eventId: fun4.events[0].id, response: "going" });
  fun4 = await funZonePhase4View(groomer);
  assert.equal(fun4.events[0].myRsvp, "going");
  assert.equal(fun4.events[0].goingCount, 1);

  console.log("test-pack-phase4: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});