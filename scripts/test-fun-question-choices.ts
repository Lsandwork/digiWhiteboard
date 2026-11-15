/**
 * Multiple-choice Question of the day (migration 114+).
 */
import assert from "node:assert/strict";
import { EngagementError } from "@/lib/team-engagement/errors";
import {
  answerFunQuestion,
  funZoneView,
  publishFunQuestion,
  saveFunQuestion
} from "@/lib/team-engagement/pack-features";
import { actorFor, PEOPLE, seededDb, serviceContextFor } from "./team-engagement-fixtures";

async function rejects(promise: Promise<unknown>, status: number) {
  try {
    await promise;
    assert.fail("expected error");
  } catch (error) {
    assert.ok(error instanceof EngagementError);
    assert.equal(error.status, status);
  }
}

async function main() {
  const db = seededDb();
  const manager = serviceContextFor(db, actorFor(PEOPLE.groomingManager));
  const handler = serviceContextFor(db, actorFor(PEOPLE.handler));

  const { id: choiceId } = await saveFunQuestion(manager, {
    prompt: "Pick today's team energy level",
    options: ["Calm and steady", "High octane", "Need coffee"]
  });
  await publishFunQuestion(manager, { id: choiceId });

  const zone = await funZoneView(handler);
  assert.ok(zone.question);
  assert.equal(zone.question.responseKind, "choice");
  assert.equal(zone.question.options?.length, 3);

  const optionId = zone.question.options![0].id;
  const afterVote = await answerFunQuestion(handler, { questionId: choiceId, optionId });
  assert.ok(afterVote.question?.responded);
  assert.equal(afterVote.question?.options?.find((row) => row.id === optionId)?.votes, 1);

  await rejects(answerFunQuestion(handler, { questionId: choiceId, optionId }), 409);

  console.log("test-fun-question-choices: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});