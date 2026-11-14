/**
 * Bark Out moderation rules and decision flow.
 * Run: npx tsx scripts/test-team-engagement-moderation.ts
 */
import assert from "node:assert/strict";
import { DEFAULT_AI_POLICY } from "@/lib/team-engagement/constants";
import {
  barkOutFingerprint,
  moderateBarkOut,
  parseAiClassification,
  redactNames,
  screenBarkOutText,
  type AiClassification,
  type ModerationAi
} from "@/lib/team-engagement/moderation";

const POSITIVE = [
  "Thanks for covering the lobby during the 5pm rush, you kept every pickup moving.",
  "She killed it at the front desk today and stayed calm when an owner was upset.",
  "He gave all the dogs their medication on time even with two new intakes.",
  "Handled an owner complaint like a pro and turned it into a five star review.",
  "Walked 12 dogs all the way around the loop so playgroup could reset.",
  "Max was anxious at drop-off and Jordan sat with him until he settled in.",
  "Crushed the grooming schedule and still helped bathe the overflow dogs.",
  "Thank you for training the new handler on gate safety, you were patient and clear.",
  "We had to move fast or else the dogs would have gotten wet, and you organized everyone.",
  "Killed them with kindness at checkout during a really long line.",
  "Caught a booking mistake before it became a problem for the family.",
  "Stayed late so the overnight team could start on time. Huge help!"
];

const PROHIBITED: [string, string][] = [
  ["You're useless and everyone knows it.", "personal_attack"],
  ["She is an idiot but she cleaned the yard.", "personal_attack"],
  ["Great job today, call me at 555-123-4567 sometime.", "personal_information"],
  ["Nice work, email her at riley.smith@example.com for help.", "personal_information"],
  ["Watch your back, nice shift though.", "threat"],
  ["Finally did your job, snitch.", "retaliation"],
  ["Nobody likes you but thanks for the help.", "harassment"],
  ["Everyone laughs at him but he did fine.", "bullying"],
  ["Pretty good for a girl.", "discrimination"],
  ["Looking sexy in that uniform today.", "harassment"]
];

const AMBIGUOUS = [
  "Thanks for showing up on time for once.",
  "You finally did the laundry, great.",
  "Good shift, but you should have restocked the towels.",
  "Not as bad as last week, nice work."
];

const REVIEW = [
  "So proud of her for coming back from medical leave and jumping right in.",
  "Congrats on the pregnancy and thanks for training the new team!",
  "He was so lazy at first but turned it around this afternoon."
];

for (const message of POSITIVE) {
  const result = screenBarkOutText(message);
  assert.equal(result.verdict, "clear", `expected clear: ${message} → ${JSON.stringify(result.findings)}`);
}

for (const [message, code] of PROHIBITED) {
  const result = screenBarkOutText(message);
  assert.equal(result.verdict, "prohibited", `expected prohibited: ${message} → ${JSON.stringify(result.findings)}`);
  assert.ok(result.findings.some((finding) => finding.code === code), `expected ${code}: ${message} → ${JSON.stringify(result.findings)}`);
}

for (const message of AMBIGUOUS) {
  const result = screenBarkOutText(message);
  assert.equal(result.verdict, "ambiguous", `expected ambiguous: ${message} → ${JSON.stringify(result.findings)}`);
}

for (const message of REVIEW) {
  const result = screenBarkOutText(message);
  assert.equal(result.verdict, "review", `expected review: ${message} → ${JSON.stringify(result.findings)}`);
}

assert.equal(
  barkOutFingerprint("Thanks for the HELP today!!"),
  barkOutFingerprint("thanks for the help today"),
  "fingerprint ignores case and punctuation"
);
assert.equal(redactNames("Riley helped Avery Stone and riley stayed late", ["Riley Park", "Avery Stone"]), "[Name] helped [Name] [Name] and [Name] stayed late");

function fakeAi(result: Partial<AiClassification> | Error, configured = true): ModerationAi & { calls: number } {
  const ai = {
    provider: "test",
    calls: 0,
    configured: () => configured,
    async classify() {
      ai.calls += 1;
      if (result instanceof Error) throw result;
      return {
        verdict: "positive",
        confidence: 0.95,
        reasons: [],
        authorPrompt: null,
        provider: "test",
        model: "test-model",
        ...result
      } as AiClassification;
    }
  };
  return ai;
}

async function main() {
  const policy = DEFAULT_AI_POLICY;
  const base = { context: null, category: "teamwork", policy };

  {
    const decision = await moderateBarkOut({ ...base, message: POSITIVE[0]!, ai: null });
    assert.equal(decision.status, "pending_review", "no AI provider → human review");
    assert.equal(decision.aiSkipped, "not_configured");
  }
  {
    const decision = await moderateBarkOut({ ...base, message: POSITIVE[0]!, ai: fakeAi({}, false) });
    assert.equal(decision.status, "pending_review", "AI key missing → human review");
    assert.equal(decision.aiSkipped, "not_configured");
  }
  {
    const decision = await moderateBarkOut({ ...base, message: POSITIVE[0]!, ai: fakeAi(new Error("boom")) });
    assert.equal(decision.status, "pending_review", "AI failure → human review");
    assert.equal(decision.aiSkipped, "failed");
  }
  {
    const decision = await moderateBarkOut({ ...base, policy: { ...policy, enabled: false }, message: POSITIVE[0]!, ai: fakeAi({}) });
    assert.equal(decision.status, "pending_review", "AI turned off → human review");
    assert.equal(decision.aiSkipped, "disabled");
  }
  {
    const decision = await moderateBarkOut({ ...base, message: POSITIVE[0]!, ai: fakeAi({ confidence: 0.97 }) });
    assert.equal(decision.status, "published", "clearly positive → auto-approved");
    assert.equal(decision.outcome, "ai_approved");
  }
  {
    const decision = await moderateBarkOut({ ...base, policy: { ...policy, reviewEveryBarkOut: true }, message: POSITIVE[0]!, ai: fakeAi({}) });
    assert.equal(decision.status, "pending_review", "review every Bark Out keeps a human in the loop");
  }
  {
    const decision = await moderateBarkOut({ ...base, message: POSITIVE[0]!, ai: fakeAi({ confidence: 0.6 }) });
    assert.equal(decision.status, "awaiting_confirmation", "low-confidence positive → author confirmation");
    const confirmed = await moderateBarkOut({ ...base, message: POSITIVE[0]!, ai: fakeAi({ confidence: 0.6 }), confirmed: true });
    assert.equal(confirmed.status, "pending_review", "confirmed ambiguous → human review");
  }
  {
    const decision = await moderateBarkOut({ ...base, message: POSITIVE[0]!, ai: fakeAi({ verdict: "prohibited", confidence: 0.92, reasons: ["harassment"] }) });
    assert.equal(decision.status, "rejected", "AI high-confidence violation → rejected");
    const unsure = await moderateBarkOut({ ...base, message: POSITIVE[0]!, ai: fakeAi({ verdict: "prohibited", confidence: 0.5 }) });
    assert.equal(unsure.status, "pending_review", "AI low-confidence violation → human review");
  }
  {
    const ai = fakeAi({});
    const decision = await moderateBarkOut({ ...base, message: PROHIBITED[0]![0], ai });
    assert.equal(decision.status, "rejected", "rules reject clear violations");
    assert.equal(ai.calls, 0, "AI is not consulted for clear violations");
    const again = await moderateBarkOut({ ...base, message: PROHIBITED[0]![0], ai, confirmed: true });
    assert.equal(again.status, "rejected", "confirming does not bypass a clear violation");
    assert.ok(!decision.authorNotice.toLowerCase().includes("useless"), "author notice does not echo flagged words");
  }
  {
    const decision = await moderateBarkOut({ ...base, message: AMBIGUOUS[0]!, ai: fakeAi({}) });
    assert.equal(decision.status, "awaiting_confirmation", "ambiguous wording → author confirmation");
    assert.ok(decision.authorPrompt?.includes("for once"), "prompt names the wording");
    const confirmed = await moderateBarkOut({ ...base, message: AMBIGUOUS[0]!, ai: fakeAi({}), confirmed: true });
    assert.equal(confirmed.status, "pending_review", "confirmed ambiguous wording → moderator");
  }
  {
    const decision = await moderateBarkOut({ ...base, message: REVIEW[0]!, ai: fakeAi({ confidence: 0.99 }) });
    assert.equal(decision.status, "pending_review", "sensitive details always go to a moderator");
  }

  assert.deepEqual(
    parseAiClassification('{"verdict":"ambiguous","confidence":1.7,"reasons":["backhanded_praise","made_up"],"author_prompt":"Try again"}', "gemini", "m"),
    { verdict: "ambiguous", confidence: 1, reasons: ["backhanded_praise"], authorPrompt: "Try again", provider: "gemini", model: "m" }
  );
  assert.throws(() => parseAiClassification('{"verdict":"great"}', "gemini", "m"));

  console.log("team engagement moderation tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
