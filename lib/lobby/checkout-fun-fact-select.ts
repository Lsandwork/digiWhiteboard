import {
  CHECKOUT_FUN_FACT_HISTORY_DAYS,
  MAX_PG13_CHECKOUT_FUN_FACTS,
  RESTRICTED_CHECKOUT_FUN_FACT_CATEGORIES,
  TARGET_CHECKOUT_FUN_FACT_CHARS,
  combinedCheckoutFunFactCatalog
} from "@/lib/lobby/checkout-fun-fact-catalog";
import type { CheckoutFunFactBank, CheckoutFunFactEntry } from "@/lib/lobby/checkout-edgy-fun-facts";
import type { CheckoutFunFactCategory } from "@/lib/lobby/checkout-spotlight-fun-facts";

export type CheckoutFunFactHistoryRow = {
  jokeId: string;
  shownAt: string;
};

export type SelectCheckoutFunFactsInput = {
  dogName: string;
  animalId?: string | null;
  breed?: string | null;
  count?: number;
  now?: Date;
  classicTemplates: Record<CheckoutFunFactCategory, Array<(name: string) => string>>;
  recent?: CheckoutFunFactHistoryRow[];
};

export type SelectedCheckoutFunFact = {
  id: string;
  bank: CheckoutFunFactBank;
  category: string;
  rating: CheckoutFunFactEntry["rating"];
  text: string;
  characterCount: number;
};

export type SelectCheckoutFunFactsResult = {
  name: string;
  texts: string[];
  selected: SelectedCheckoutFunFact[];
  usedFallbackRepeat: boolean;
};

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pacificDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const next = [...items];
  const rand = mulberry32(seed);
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
  }
  return next;
}

function cutoffIso(now: Date) {
  return new Date(now.getTime() - CHECKOUT_FUN_FACT_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function isRestrictedCategory(category: string) {
  return RESTRICTED_CHECKOUT_FUN_FACT_CATEGORIES.has(category);
}

type Relax = {
  length: boolean;
  bank: boolean;
  history: boolean;
};

function canTake(
  joke: CheckoutFunFactEntry,
  text: string,
  selected: SelectedCheckoutFunFact[],
  recentIds: Set<string>,
  maxFromBank: number,
  relax: Relax
) {
  if (selected.some((item) => item.id === joke.id)) return false;
  if (selected.some((item) => item.category === joke.category)) return false;
  if (!relax.history && recentIds.has(joke.id)) return false;
  if (isRestrictedCategory(joke.category) && selected.some((item) => item.category === joke.category)) {
    return false;
  }
  if (joke.rating === "pg13") {
    const pg13 = selected.filter((item) => item.rating === "pg13").length;
    if (pg13 >= MAX_PG13_CHECKOUT_FUN_FACTS) return false;
  }
  if (!relax.bank) {
    const bankCount = selected.filter((item) => item.bank === joke.bank).length;
    if (bankCount >= maxFromBank) return false;
  }
  if (!relax.length && text.length > TARGET_CHECKOUT_FUN_FACT_CHARS) return false;
  return true;
}

export function checkoutFunFactDogKey(input: { dogName: string; animalId?: string | null }) {
  const animalId = String(input.animalId ?? "").trim();
  if (animalId) return `animal:${animalId}`;
  const name = String(input.dogName || "This dog")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return `name:${name || "this dog"}`;
}

export function selectCheckoutFunFacts(input: SelectCheckoutFunFactsInput): SelectCheckoutFunFactsResult {
  const name = String(input.dogName || "This dog").trim() || "This dog";
  const now = input.now ?? new Date();
  const count = Math.min(6, Math.max(4, input.count ?? 5));
  const seed = hashString(`${name}|${input.animalId || ""}|${input.breed || ""}|${pacificDateKey(now)}`);
  const catalog = combinedCheckoutFunFactCatalog(input.classicTemplates);
  const cutoff = cutoffIso(now);
  const recentRows = (input.recent ?? []).filter((row) => row.shownAt >= cutoff);
  const recentIds = new Set(recentRows.map((row) => row.jokeId));
  const shownAtById = new Map(recentRows.map((row) => [row.jokeId, row.shownAt]));
  const maxFromBank = Math.ceil(count / 2);

  const shuffled = seededShuffle(catalog, seed);
  const selected: SelectedCheckoutFunFact[] = [];
  let usedFallbackRepeat = false;

  const passes: Relax[] = [
    { length: false, bank: false, history: false },
    { length: true, bank: false, history: false },
    { length: true, bank: true, history: false },
    { length: true, bank: true, history: true }
  ];

  for (const relax of passes) {
    const pool =
      relax.history
        ? [...shuffled].sort((a, b) => {
            const aAt = shownAtById.get(a.id) ?? "1970-01-01T00:00:00.000Z";
            const bAt = shownAtById.get(b.id) ?? "1970-01-01T00:00:00.000Z";
            return aAt.localeCompare(bAt);
          })
        : shuffled;

    for (const joke of pool) {
      if (selected.length >= count) break;
      const text = joke.template(name);
      if (!canTake(joke, text, selected, recentIds, maxFromBank, relax)) continue;
      if (relax.history && recentIds.has(joke.id)) usedFallbackRepeat = true;
      selected.push({
        id: joke.id,
        bank: joke.bank,
        category: joke.category,
        rating: joke.rating,
        text,
        characterCount: text.length
      });
    }
    if (selected.length >= count) break;
  }

  return {
    name,
    texts: selected.map((item) => item.text),
    selected,
    usedFallbackRepeat
  };
}
