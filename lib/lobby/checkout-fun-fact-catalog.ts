import type { CheckoutFunFactCategory } from "@/lib/lobby/checkout-spotlight-fun-facts";
import {
  EDGY_FAMILY_FRIENDLY_ENTRIES,
  type CheckoutFunFactEntry
} from "@/lib/lobby/checkout-edgy-fun-facts";

const NAME_TOKEN = "__NAME__";

function fnv1a(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Stable IDs from joke text, not array index — reordering classic templates cannot corrupt history. */
export function classicCheckoutFunFactEntriesFromTemplates(
  templates: Record<CheckoutFunFactCategory, Array<(name: string) => string>>
): CheckoutFunFactEntry[] {
  const entries: CheckoutFunFactEntry[] = [];
  for (const category of Object.keys(templates) as CheckoutFunFactCategory[]) {
    for (const template of templates[category]) {
      const sample = template(NAME_TOKEN);
      entries.push({
        id: `classic-${category}-${fnv1a(sample)}`,
        category,
        bank: "classic_dry_humor",
        rating: "pg",
        template
      });
    }
  }
  return entries;
}

export function combinedCheckoutFunFactCatalog(
  classicTemplates: Record<CheckoutFunFactCategory, Array<(name: string) => string>>
): CheckoutFunFactEntry[] {
  return [...classicCheckoutFunFactEntriesFromTemplates(classicTemplates), ...EDGY_FAMILY_FRIENDLY_ENTRIES];
}

export function checkoutFunFactLength(text: string) {
  return text.length;
}

export const TARGET_CHECKOUT_FUN_FACT_CHARS = 140;
export const CHECKOUT_FUN_FACT_HISTORY_DAYS = 30;
export const RESTRICTED_CHECKOUT_FUN_FACT_CATEGORIES = new Set([
  "food_obsession",
  "pickup_release",
  "double_entendre"
]);
export const MAX_PG13_CHECKOUT_FUN_FACTS = 2;
