/**
 * Pack Priority 2: comments, polls, milestones, spotlight.
 * Run: npx tsx scripts/test-pack-priority2.ts
 */
import assert from "node:assert/strict";
import { approveBarkOut, createBarkOut, employeeFeed } from "@/lib/team-engagement/bark-outs";
import { EngagementError } from "@/lib/team-engagement/errors";
import {
  createBarkOutComment,
  deleteBarkOutComment,
  editBarkOutComment,
  featureSpotlight,
  publishFunPoll,
  publishFunQuestion,
  resolvePackSpotlight,
  saveFunPoll,
  saveFunQuestion,
  syncPackMilestones,
  voteFunPoll
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
  const groomer = serviceContextFor(db, actorFor(PEOPLE.groomer));
  const manager = serviceContextFor(db, actorFor(PEOPLE.groomingManager));
  const handler = serviceContextFor(db, actorFor(PEOPLE.handler));

  const created = await createBarkOut(groomer, {
    recipientUserId: PEOPLE.groomer2.id,
    category: "teamwork",
    message: "Thanks for jumping in on the late bath lineup today — the whole floor felt calmer."
  });
  await approveBarkOut(manager, { id: created.barkOut.id });

  const feed = await employeeFeed(handler, {});
  const barkOutId = feed.items[0]?.id;
  assert.ok(barkOutId);

  const thread = await createBarkOutComment(handler, { barkOutId, body: "This made my whole shift better to read." });
  assert.equal(thread.items.length, 1);

  const reply = await createBarkOutComment(groomer, {
    barkOutId,
    body: "Happy to help!",
    parentCommentId: thread.items[0].id
  });
  assert.equal(reply.items.length, 2);

  await editBarkOutComment(handler, { id: thread.items[0].id, body: "This made my whole shift better." });
  await rejects(editBarkOutComment(groomer, { id: thread.items[0].id, body: "nope" }), 403);

  await deleteBarkOutComment(handler, { id: thread.items[0].id });
  const afterDelete = await createBarkOutComment(handler, { barkOutId, body: "Reposting after delete." });
  assert.equal(afterDelete.items.length, 2);

  const notifs = handler.notifications.filter((n) => n.dedupeKey.includes("bark_out_comment"));
  assert.ok(notifs.length >= 1);

  const generated = await syncPackMilestones(manager, [
    {
      admin_user_id: PEOPLE.groomer2.id,
      name: PEOPLE.groomer2.name,
      hire_date: "2024-05-01",
      birthday_month: null,
      birthday_day: null,
      show_birthday: false
    }
  ]);
  assert.ok(generated.generated >= 1);

  const { id: questionId } = await saveFunQuestion(manager, { prompt: "Which dog breed matches your mood today?" });
  await publishFunQuestion(manager, { id: questionId });

  const { id: pollId } = await saveFunPoll(manager, {
    prompt: "Best team outing?",
    options: ["Beach day", "Mountain hike"]
  });
  await publishFunPoll(manager, { id: pollId });
  const pollAfterVote = await voteFunPoll(handler, {
    pollId,
    optionIds: [db.tables.team_engagement_fun_poll_options.find((row) => row.poll_id === pollId)?.id as string]
  });
  assert.ok(pollAfterVote.poll?.voted);

  await rejects(
    voteFunPoll(handler, {
      pollId,
      optionIds: [db.tables.team_engagement_fun_poll_options.find((row) => row.poll_id === pollId)?.id as string]
    }),
    409
  );

  await featureSpotlight(manager, { barkOutId, category: "team_player", caption: "Floor hero" });
  const spotlight = await resolvePackSpotlight(handler, feed.items[0]);
  assert.equal(spotlight.barkOut?.id, barkOutId);
  assert.ok(spotlight.curated?.caption);

  console.log("test-pack-priority2: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});