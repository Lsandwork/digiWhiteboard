import assert from "node:assert/strict";
import {
  isCommissionQuestion,
  parseCommissionDateRange,
  parseCommissionQuestion,
  parseCommissionTrainerQuery
} from "../lib/ai/fitdogAiCommissionAnswer";
import { isGlitchAiReply, FITDOG_AI_GLITCH_REPLY } from "../lib/ai/fitdogAiLocalFallback";
import { normalizeActionIntent } from "../lib/ai/fitdogActionLinks";

const sample =
  "Show me how much commissions Amanda made for the last two weeks";

assert.equal(isCommissionQuestion(sample), true);
assert.equal(isCommissionQuestion("push a notice about clean yards"), false);

const trainer = parseCommissionTrainerQuery(sample);
assert.equal(trainer.trainerQuery, "Amanda");
assert.equal(trainer.self, false);

const now = new Date(2026, 6, 25); // Jul 25, 2026 local
const range = parseCommissionDateRange(sample, now);
assert.equal(range.dateFrom, "2026-07-12");
assert.equal(range.dateTo, "2026-07-25");
assert.equal(range.rangeLabel, "the last two weeks");

const parsed = parseCommissionQuestion(sample, now);
assert.ok(parsed);
assert.equal(parsed?.trainerQuery, "Amanda");
assert.equal(parsed?.dateFrom, "2026-07-12");
assert.equal(parsed?.dateTo, "2026-07-25");

const myCommissions = parseCommissionQuestion("How much did I make in commissions this month?", now);
assert.ok(myCommissions);
assert.equal(myCommissions?.self, true);
assert.equal(myCommissions?.dateFrom, "2026-07-01");

assert.equal(normalizeActionIntent("package_commissions"), "package_commissions");
assert.equal(normalizeActionIntent("commissions"), "package_commissions");
assert.equal(isGlitchAiReply(FITDOG_AI_GLITCH_REPLY), true);
assert.equal(isGlitchAiReply("Amanda made $120 last week."), false);

console.log("fitdog ai commission answer parsing: ok");
