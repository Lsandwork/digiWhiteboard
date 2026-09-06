import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EDGY_FAMILY_FRIENDLY_ENTRIES, EDGY_FAMILY_FRIENDLY_TEMPLATES } from "../lib/lobby/checkout-edgy-fun-facts";
import {
  TARGET_CHECKOUT_FUN_FACT_CHARS,
  classicCheckoutFunFactEntriesFromTemplates,
  combinedCheckoutFunFactCatalog
} from "../lib/lobby/checkout-fun-fact-catalog";
import { checkoutFunFactDogKey, selectCheckoutFunFacts } from "../lib/lobby/checkout-fun-fact-select";
import {
  buildCheckoutFunFacts,
  getClassicCheckoutFunFactTemplates
} from "../lib/lobby/checkout-spotlight-fun-facts";

const classic = getClassicCheckoutFunFactTemplates();
const now = new Date("2026-09-06T20:00:00.000Z");

function select(partial: {
  dogName?: string;
  animalId?: string | null;
  count?: number;
  recent?: { jokeId: string; shownAt: string }[];
  now?: Date;
}) {
  return selectCheckoutFunFacts({
    dogName: partial.dogName ?? "Cash",
    animalId: partial.animalId ?? "99",
    breed: "Mix",
    count: partial.count ?? 5,
    now: partial.now ?? now,
    classicTemplates: classic,
    recent: partial.recent
  });
}

const classicSource = readFileSync(join(process.cwd(), "lib/lobby/checkout-spotlight-fun-facts.ts"), "utf8");
assert.match(classicSource, /Regional Manager of Whatever Everyone Else Is Doing/);
assert.match(classicSource, /Interim Chief of Looking Busy/);
assert.match(classicSource, /Director of Vibes/);
assert.match(classicSource, /corporate_promotion/);
assert.match(classicSource, /unofficial_job_title/);
assert.doesNotMatch(classicSource, /chaos_personality/);
assert.doesNotMatch(classicSource, /EDGY_FAMILY_FRIENDLY/);

assert.ok(classic.corporate_promotion.length >= 3);
assert.equal(Object.keys(classic).length, 10);
assert.equal(
  Object.values(classic).reduce((sum, templates) => sum + templates.length, 0),
  30
);
assert.equal(Object.keys(EDGY_FAMILY_FRIENDLY_TEMPLATES).includes("chaos_personality"), true);
assert.equal(Object.keys(EDGY_FAMILY_FRIENDLY_TEMPLATES).includes("confidence_attitude"), true);
assert.ok(EDGY_FAMILY_FRIENDLY_ENTRIES.length >= 190);
assert.ok(
  EDGY_FAMILY_FRIENDLY_ENTRIES.every((item) => item.template("Maple").includes("Maple"))
);

const classicEntries = classicCheckoutFunFactEntriesFromTemplates(classic);
const catalog = combinedCheckoutFunFactCatalog(classic);
const ids = catalog.map((item) => item.id);
assert.equal(new Set(ids).size, ids.length);
assert.ok(classicEntries.every((item) => item.bank === "classic_dry_humor"));
assert.ok(EDGY_FAMILY_FRIENDLY_ENTRIES.every((item) => item.bank === "edgy_family_friendly"));
assert.equal(
  classicEntries.map((item) => item.id).join(","),
  classicCheckoutFunFactEntriesFromTemplates(classic)
    .map((item) => item.id)
    .join(",")
);

{
  const result = select({});
  assert.equal(result.texts.length, 5);
  const categories = result.selected.map((item) => item.category);
  assert.equal(new Set(categories).size, categories.length);
  const banks = new Set(result.selected.map((item) => item.bank));
  assert.equal(banks.has("classic_dry_humor"), true);
  assert.equal(banks.has("edgy_family_friendly"), true);
  assert.ok(result.selected.filter((item) => item.category === "food_obsession").length <= 1);
  assert.ok(result.selected.filter((item) => item.category === "pickup_release").length <= 1);
  assert.ok(result.selected.filter((item) => item.category === "double_entendre").length <= 1);
  assert.ok(result.selected.filter((item) => item.rating === "pg13").length <= 2);
  for (const fact of result.texts) {
    assert.match(fact, /Cash/);
    assert.doesNotMatch(fact, /paw-some|ruff day|fur real/i);
  }
}

{
  let shortPreferred = 0;
  let mixedBanks = 0;
  for (let i = 0; i < 20; i += 1) {
    const result = select({ animalId: `id-${i}` });
    const over = result.selected.filter((item) => item.characterCount > TARGET_CHECKOUT_FUN_FACT_CHARS).length;
    if (over === 0) shortPreferred += 1;
    const banks = new Set(result.selected.map((item) => item.bank));
    if (banks.size === 2) mixedBanks += 1;
    assert.ok(result.selected.filter((item) => item.category === "food_obsession").length <= 1);
    assert.ok(result.selected.filter((item) => item.category === "pickup_release").length <= 1);
    assert.ok(result.selected.filter((item) => item.category === "double_entendre").length <= 1);
    assert.equal(new Set(result.selected.map((item) => item.category)).size, result.selected.length);
  }
  assert.ok(shortPreferred >= 14);
  assert.ok(mixedBanks >= 18);
}

{
  const first = select({});
  const recent = first.selected.map((item) => ({ jokeId: item.id, shownAt: now.toISOString() }));
  const second = select({ now: new Date("2026-09-07T20:00:00.000Z"), recent });
  for (const id of first.selected.map((item) => item.id)) {
    assert.equal(second.selected.some((item) => item.id === id), false);
  }

  const old = first.selected.map((item) => ({
    jokeId: item.id,
    shownAt: new Date("2026-07-01T20:00:00.000Z").toISOString()
  }));
  const revived = select({ now: new Date("2026-09-07T20:00:00.000Z"), recent: old });
  assert.equal(revived.texts.length, 5);
}

{
  const sharedId = EDGY_FAMILY_FRIENDLY_ENTRIES[0]!.id;
  const allButShared = catalog
    .filter((item) => item.id !== sharedId)
    .map((item) => ({ jokeId: item.id, shownAt: now.toISOString() }));
  const cashForced = select({ dogName: "Cash", animalId: "1", recent: allButShared });
  const mapleForced = select({ dogName: "Maple", animalId: "2", recent: allButShared });
  assert.ok(cashForced.selected.some((item) => item.id === sharedId));
  assert.ok(mapleForced.selected.some((item) => item.id === sharedId));
  assert.notEqual(
    checkoutFunFactDogKey({ dogName: "Cash", animalId: "1" }),
    checkoutFunFactDogKey({ dogName: "Maple", animalId: "2" })
  );
}

{
  const allRecent = catalog.map((item) => ({ jokeId: item.id, shownAt: now.toISOString() }));
  const exhausted = select({ recent: allRecent });
  assert.equal(exhausted.texts.length, 5);
  assert.equal(exhausted.usedFallbackRepeat, true);
  const categories = exhausted.selected.map((item) => item.category);
  assert.equal(new Set(categories).size, categories.length);
}

{
  const sync = buildCheckoutFunFacts({ dogName: "Cash", animalId: "99", count: 5, now });
  const again = buildCheckoutFunFacts({ dogName: "Cash", animalId: "99", count: 5, now });
  assert.deepEqual(sync, again);
  assert.equal(sync.length, 5);
}

{
  const route = readFileSync(join(process.cwd(), "app/api/lobby/checkout-fun-facts/route.ts"), "utf8");
  assert.match(route, /history lookup failed/);
  assert.match(route, /fallback/);
  const panel = readFileSync(join(process.cwd(), "components/lobby/LobbyCheckoutSpotlight.tsx"), "utf8");
  assert.match(panel, /\/api\/lobby\/checkout-fun-facts/);
  assert.match(panel, /buildCheckoutFunFacts/);
  const original = readFileSync(join(process.cwd(), "lib/lobby/checkout-spotlight-fun-facts.ts"), "utf8");
  assert.match(original, /const TEMPLATES: Record<CheckoutFunFactCategory/);
  assert.match(original, /const SUMMARY_POOLS = \{/);
}

console.log("lobby checkout fun fact banks tests passed");
