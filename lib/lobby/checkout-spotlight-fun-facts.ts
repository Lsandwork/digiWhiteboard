/**
 * Deterministic, dry-humor "Today's Fun Facts" for checkout spotlight dogs.
 * Rotates by dog name + Pacific day so the same dog isn't stuck with one set forever.
 */

export type CheckoutFunFactCategory =
  | "corporate_promotion"
  | "breaking_news"
  | "hr_complaint"
  | "witness_statement"
  | "performance_review"
  | "suspicious_activity"
  | "lunch_investigation"
  | "workplace_behavior"
  | "management_notes"
  | "unofficial_job_title";

export type CheckoutDaySummary = {
  attitude: string;
  energyLevel: string;
  friendship: string;
  zoomies: string;
  napTime: string;
  overallDay: string;
};

const TEMPLATES: Record<CheckoutFunFactCategory, Array<(name: string) => string>> = {
  corporate_promotion: [
    (n) => `${n} has officially been promoted to Regional Manager of Whatever Everyone Else Is Doing.`,
    (n) => `${n} accepted a lateral move into Unsolicited Yard Supervision.`,
    (n) => `Internal memo: ${n} is now Interim Chief of Looking Busy.`
  ],
  breaking_news: [
    (n) => `Breaking: ${n} has filed a formal complaint that lunch happened only once.`,
    (n) => `Update: ${n} clocked in, caused a small amount of chaos, refused to elaborate, and is now requesting pickup.`,
    (n) => `Live report: ${n} would like everyone to know they worked very hard today. No evidence has been provided.`
  ],
  hr_complaint: [
    (n) => `HR received an anonymous tip that ${n} stared at a closed treat cabinet “with intent.”`,
    (n) => `${n} is appealing a write-up for excessive enthusiasm near the front door.`,
    (n) => `HR notes ${n} attempted to renegotiate nap policy mid-afternoon.`
  ],
  witness_statement: [
    (n) => `Witnesses say ${n} heard a treat bag open from three zip codes away.`,
    (n) => `Multiple staff confirm ${n} spent 47 minutes supervising a tennis ball that nobody threw.`,
    (n) => `A reliable source claims ${n} held an emergency meeting with a leaf.`
  ],
  performance_review: [
    (n) => `Performance review: ${n} exceeded expectations in Making Friends and Under-Delivered on Sitting Still.`,
    (n) => `${n}'s KPI dashboard shows strong results in Charm, Zoomies, and Selective Hearing.`,
    (n) => `Quarterly review: ${n} is “a high-impact collaborator with occasional rogue initiatives.”`
  ],
  suspicious_activity: [
    (n) => `Security footage shows ${n} investigating a water bowl as if it owed them money.`,
    (n) => `${n} was briefly detained for unauthorized inspection of every human's pockets.`,
    (n) => `Case file open: ${n} vs. The Mysterious Crinkle Sound.`
  ],
  lunch_investigation: [
    (n) => `${n} led a full lunch audit and concluded “more is required.”`,
    (n) => `Investigators found ${n} emotionally prepared for a second breakfast that never came.`,
    (n) => `${n}'s official lunch position remains: strongly in favor.`
  ],
  workplace_behavior: [
    (n) => `${n} practiced professional barking at a delivery truck and considers the matter closed.`,
    (n) => `Coworkers report ${n} improved team morale by approximately one entire personality.`,
    (n) => `${n} maintained eye contact with a squirrel for a duration HR described as “committed.”`
  ],
  management_notes: [
    (n) => `Manager note: ${n} is cleared for pickup pending final ear scratches.`,
    (n) => `Ops log: ${n} completed today's agenda of Play, Plot, and Pretend to Nap.`,
    (n) => `Shift summary: ${n} left the building more popular than when they arrived.`
  ],
  unofficial_job_title: [
    (n) => `Unofficial title assigned: ${n}, Director of Vibes.`,
    (n) => `${n} is now on record as Senior Analyst of Treat Probability.`,
    (n) => `Business cards pending for ${n}, VP of Greeting Everyone Twice.`
  ]
};

const SUMMARY_POOLS = {
  attitude: ["10/10", "UNREASONABLY CONFIDENT", "POLITE MENACE", "BOARDROOM READY"],
  energyLevel: ["QUESTIONABLE", "SUSTAINABLE CHAOS", "PEAK AFTERNOON", "STRATEGIC BURSTS"],
  friendship: ["MADE EVERYONE A FAN", "NETWORKED AGGRESSIVELY", "DIPLOMATIC SUCCESS", "ALLIES SECURED"],
  zoomies: ["UNDER INVESTIGATION", "CLASSIFIED", "BRIEF BUT HISTORIC", "CONTAINED… MOSTLY"],
  napTime: ["SHORT BUT POWERFUL", "TACTICAL", "OPTIONAL", "HIGHLY NEGOTIATED"],
  overallDay: ["LEGENDARY", "CERTIFIED EXCELLENT", "WOULD HIRE AGAIN", "MAIN CHARACTER ENERGY"]
} as const;

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

function pickIndexed<T>(items: readonly T[], seed: number, salt: number): T {
  const index = Math.abs((seed + salt * 97) % items.length);
  return items[index]!;
}

export function buildCheckoutFunFacts(input: {
  dogName: string;
  animalId?: string | null;
  breed?: string | null;
  count?: number;
  now?: Date;
}): string[] {
  const name = String(input.dogName || "This dog").trim() || "This dog";
  const seed = hashString(
    `${name}|${input.animalId || ""}|${input.breed || ""}|${pacificDateKey(input.now)}`
  );
  const categories = Object.keys(TEMPLATES) as CheckoutFunFactCategory[];
  const count = Math.min(6, Math.max(4, input.count ?? 5));
  const facts: string[] = [];
  const usedCategories = new Set<CheckoutFunFactCategory>();

  for (let i = 0; i < count; i += 1) {
    let category = pickIndexed(categories, seed, i + 1);
    let guard = 0;
    while (usedCategories.has(category) && guard < categories.length) {
      category = pickIndexed(categories, seed, i + 1 + guard * 3);
      guard += 1;
    }
    usedCategories.add(category);
    const templates = TEMPLATES[category];
    const template = pickIndexed(templates, seed, i * 11 + 5);
    facts.push(template(name));
  }

  return facts;
}

export function buildCheckoutDaySummary(input: {
  dogName: string;
  animalId?: string | null;
  now?: Date;
}): CheckoutDaySummary {
  const seed = hashString(`${input.dogName}|${input.animalId || ""}|${pacificDateKey(input.now)}|summary`);
  return {
    attitude: pickIndexed(SUMMARY_POOLS.attitude, seed, 1),
    energyLevel: pickIndexed(SUMMARY_POOLS.energyLevel, seed, 2),
    friendship: pickIndexed(SUMMARY_POOLS.friendship, seed, 3),
    zoomies: pickIndexed(SUMMARY_POOLS.zoomies, seed, 4),
    napTime: pickIndexed(SUMMARY_POOLS.napTime, seed, 5),
    overallDay: pickIndexed(SUMMARY_POOLS.overallDay, seed, 6)
  };
}
