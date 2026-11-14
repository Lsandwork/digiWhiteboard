/**
 * Central community content moderation: profanity cannot ship via direct API paths.
 * Run: npx tsx scripts/test-community-content.ts
 */
import assert from "node:assert/strict";
import { screenCommunityText, normalizeCommunityText } from "@/lib/team-engagement/community-content";
import { screenBarkOutText } from "@/lib/team-engagement/moderation";
import { createBarkOutComment } from "@/lib/team-engagement/pack-features";
import { createBarkOut } from "@/lib/team-engagement/bark-outs";
import { submitFeedback } from "@/lib/team-engagement/records";
import { EngagementError } from "@/lib/team-engagement/errors";
import { actorFor, PEOPLE, seededDb, serviceContextFor } from "./team-engagement-fixtures";

function profanityBlocked(text: string) {
  const screen = screenCommunityText(text, "bark_out");
  if (!screen.allowed) return true;
  return screenBarkOutText(text).verdict === "prohibited";
}

async function main() {
  assert.ok(profanityBlocked("what the f**k"), "asterisk obfuscation");
  assert.ok(profanityBlocked("sh1t show"), "leet");
  assert.ok(profanityBlocked("what the shit"), "plain profanity");

  const respectful = screenCommunityText(
    "I think we need clearer shift handoff notes because nights get busy.",
    "voice"
  );
  assert.equal(respectful.allowed, true, "constructive criticism without profanity");

  const groomer = serviceContextFor(seededDb(), actorFor(PEOPLE.groomer));

  const prohibited = await createBarkOut(groomer, {
    recipientUserId: PEOPLE.handler.id,
    category: "teamwork",
    message: "You are a fucking legend today"
  });
  assert.equal(prohibited.barkOut.status, "rejected", "bark out profanity via API");

  const db = seededDb();
  const { rows: barkRows } = await db.select("team_engagement_bark_outs", {
    filters: [{ column: "status", op: "eq", value: "published" }],
    limit: 1
  });
  if (barkRows[0]) {
    await assert.rejects(
      () =>
        createBarkOutComment(groomer, {
          barkOutId: (barkRows[0] as { id: string }).id,
          body: "this is bullshit"
        }),
      (error: unknown) => error instanceof EngagementError && error.code === "content_blocked",
      "comment profanity"
    );
  }

  await assert.rejects(
    () =>
      submitFeedback(groomer, {
        category: "team_culture",
        subject: "Handoff idea",
        details: "We could improve things but this damn process is shit"
      }),
    (error: unknown) => error instanceof EngagementError && error.code === "content_blocked",
    "idea profanity"
  );

  console.log("test-community-content: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});