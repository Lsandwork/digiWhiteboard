/**
 * Template publish must activate Fun Zone activities (status active), not leave drafts.
 * npx tsx scripts/test-template-fun-zone-publish-live.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { funZoneView, publishFunPoll, saveFunPoll } from "@/lib/team-engagement/pack-features";
import { publishEngagementTemplate } from "@/lib/team-engagement/template-library";
import { actorFor, PEOPLE, seededDb, serviceContextFor } from "./team-engagement-fixtures";

const templateSource = readFileSync(join(process.cwd(), "lib/team-engagement/template-library.ts"), "utf8");
assert.match(templateSource, /await publishFunPoll\(ctx/);
assert.match(templateSource, /await publishFunQuestion\(ctx/);
assert.match(templateSource, /await publishPackGoal\(ctx/);

async function main() {
  const db = seededDb();
  const manager = serviceContextFor(db, actorFor(PEOPLE.groomingManager));
  const handler = serviceContextFor(db, actorFor(PEOPLE.handler));

  const before = await funZoneView(handler);
  assert.equal(before.poll, null);

  const { id } = await saveFunPoll(manager, { prompt: "Draft-only poll should not show", options: ["A", "B"] });
  const draftView = await funZoneView(handler);
  assert.equal(draftView.poll, null, "draft poll invisible in Fun Zone");

  await publishFunPoll(manager, { id });
  const after = await funZoneView(handler);
  assert.ok(after.poll?.prompt.includes("Draft-only"), "published poll visible in Fun Zone");

  await publishEngagementTemplate(manager, {
    templateId: "catalog-poll-coffee-tea",
    title: "Coffee or Tea?",
    message: "What is your go-to morning drink?",
    publishMode: "live"
  });

  const activePolls = db.tables.team_engagement_fun_polls.filter((row) => row.status === "active");
  assert.ok(
    activePolls.some((row) => String(row.prompt).includes("go-to morning drink")),
    "template publish must set poll status active (not draft)"
  );

  const participant = await funZoneView(handler);
  assert.ok(participant.poll, "Fun Zone shows an active poll after template publish");

  console.log("template-fun-zone-publish-live: ok");
}

void main();