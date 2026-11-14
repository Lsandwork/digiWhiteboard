/**
 * Bark Out submission rules: self-recognition, negative content, ambiguous confirmation, prohibited bypass, moderation audit.
 * Run: npx tsx scripts/test-team-engagement-bark-outs.ts
 */
import assert from "node:assert/strict";
import { EngagementError } from "@/lib/team-engagement/errors";
import {
  approveBarkOut,
  confirmBarkOut,
  createBarkOut,
  employeeFeed,
  leadershipBarkOuts,
  rejectBarkOut
} from "@/lib/team-engagement/bark-outs";
import { PEOPLE, actorFor, auditRows, seededDb, serviceContextFor } from "./team-engagement-fixtures";

async function rejects(promise: Promise<unknown>, status: number, code?: string) {
  try {
    await promise;
    assert.fail("expected error");
  } catch (error) {
    assert.ok(error instanceof EngagementError, String(error));
    assert.equal(error.status, status);
    if (code) assert.equal(error.code, code);
  }
}

async function main() {
  const db = seededDb();

  // 9. Self-recognition rejected with no row created.
  const groomerCtx = serviceContextFor(db, actorFor(PEOPLE.groomer));
  await rejects(
    createBarkOut(groomerCtx, {
      recipientUserId: PEOPLE.groomer.id,
      category: "teamwork",
      message: "I am amazing and covered every bath station today by myself."
    }),
    400,
    "self_recognition"
  );
  assert.equal(db.tables.team_engagement_bark_outs.length, 0);

  // 10. Negative / prohibited → rejected, not in public feed, notice does not echo the insult.
  const negative = await createBarkOut(groomerCtx, {
    recipientUserId: PEOPLE.groomer2.id,
    category: "teamwork",
    message: "You're useless but thanks for trying to help with the towels."
  });
  assert.equal(negative.barkOut.status, "rejected");
  assert.ok(negative.notice && !negative.notice.toLowerCase().includes("useless"));
  const feed = await employeeFeed(serviceContextFor(db, actorFor(PEOPLE.handler)), {});
  assert.ok(!feed.items.some((item) => item.message.toLowerCase().includes("useless")));

  // 11. Ambiguous → awaiting_confirmation → confirm → pending_review; second confirm fails.
  const ambiguousCtx = serviceContextFor(db, actorFor(PEOPLE.trainer));
  const ambiguous = await createBarkOut(ambiguousCtx, {
    recipientUserId: PEOPLE.frontDesk.id,
    category: "positive_attitude",
    message: "Thanks for showing up on time for once today at the front desk."
  });
  assert.equal(ambiguous.barkOut.status, "awaiting_confirmation");
  const confirmed = await confirmBarkOut(ambiguousCtx, { id: ambiguous.barkOut.id });
  assert.equal(confirmed.barkOut.status, "pending_review");
  await rejects(confirmBarkOut(ambiguousCtx, { id: ambiguous.barkOut.id }), 409, "not_confirmable");

  // 12. Prohibited cannot be confirmed; repeated submit hits duplicate / cooldown.
  const prohibited = await createBarkOut(ambiguousCtx, {
    recipientUserId: PEOPLE.frontDesk.id,
    category: "teamwork",
    message: "Nobody likes you but thanks for covering phones."
  });
  assert.equal(prohibited.barkOut.status, "rejected");
  await rejects(confirmBarkOut(ambiguousCtx, { id: prohibited.barkOut.id }), 409, "not_confirmable");
  await rejects(
    createBarkOut(ambiguousCtx, {
      recipientUserId: PEOPLE.frontDesk.id,
      category: "teamwork",
      message: "Nobody likes you but thanks for covering phones."
    }),
    409,
    "duplicate"
  );

  // Approve on rejected post fails.
  const managerCtx = serviceContextFor(db, actorFor(PEOPLE.groomingManager));
  try {
    await approveBarkOut(managerCtx, { id: prohibited.barkOut.id });
    assert.fail("approve on rejected");
  } catch (error) {
    assert.ok(error instanceof EngagementError);
    assert.ok([404, 409].includes(error.status), `approve on rejected → ${error.status}`);
  }

  // 13. Moderation decisions log events and audit rows.
  const pending = db.tables.team_engagement_bark_outs.find((row) => row.status === "pending_review");
  assert.ok(pending, "pending review row");
  const adminCtx = serviceContextFor(db, actorFor(PEOPLE.admin));
  await approveBarkOut(adminCtx, { id: pending!.id as string, note: "Looks positive to me." });
  assert.ok(db.tables.team_engagement_moderation_events.some((event) => event.bark_out_id === pending!.id));
  assert.ok(auditRows(db, "bark_out.approve").length > 0);

  const rejectRow = await createBarkOut(groomerCtx, {
    recipientUserId: PEOPLE.groomer2.id,
    category: "reliability",
    message: "Watch your back during shift change but you did fine."
  });
  if (rejectRow.barkOut.status === "pending_review" || rejectRow.barkOut.status === "published") {
    const adminCtx = serviceContextFor(db, actorFor(PEOPLE.admin));
    await rejectBarkOut(adminCtx, { id: rejectRow.barkOut.id, reason: "threat", note: "Reads like a threat." });
    assert.ok(auditRows(db, "bark_out.reject").length > 0);
  }

  console.log("team engagement bark-out tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});