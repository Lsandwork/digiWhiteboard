/** Clickable Social Media Generator topics + super-funny optional hooks/spins. */

export type SocialGeneratorTopic = {
  id: string;
  label: string;
  /** Loose matchers so typed-in topics still unlock the right hook set. */
  keywords: string[];
  hooks: string[];
};

export const SOCIAL_GENERATOR_TOPICS: SocialGeneratorTopic[] = [
  {
    id: "first-dropoff",
    label: "First daycare drop-off",
    keywords: ["first day", "drop-off", "dropoff", "new dog", "intake", "evaluation"],
    hooks: [
      "The new kid: “I’ll allow this… pending snack review.”",
      "Parents: emotional. Dogs: already networking.",
      "First-day energy: brave humans, extremely nosy dogs.",
      "We told them it was daycare. They heard ‘board meeting with snacks.’",
      "Confidence stacks in tiny wins — not cinematic goodbyes."
    ]
  },
  {
    id: "summer-ac",
    label: "Summer heat + AC",
    keywords: ["summer", "heat", "hot", "ac", "air cond", "78", "sun", "cool"],
    hooks: [
      "Our dogs: “Absolutely not. Turn the AC up.”",
      "They unionized over the thermostat. We lost immediately.",
      "Play hard. Cool off. Repeat. Climate control is in the care plan.",
      "Heat advisory in Santa Monica. The dogs filed a formal complaint.",
      "Team patio nap or team indoor freeze? We’re not picking sides."
    ]
  },
  {
    id: "daycare-regulars",
    label: "Daycare regulars",
    keywords: ["regular", "daycare", "playgroup", "yard", "live here", "members"],
    hooks: [
      "Our regulars: “We live here now. Don’t make it weird.”",
      "The group chat (aka the yard): “Same time tomorrow?”",
      "Clocks optional. Friends mandatory.",
      "Treating the yard like a LinkedIn networking event — unpaid, beloved.",
      "Is your dog a sprinter, a schemer, or a professional napper?"
    ]
  },
  {
    id: "adventure-hike",
    label: "Adventure hikes",
    keywords: ["hike", "trail", "adventure", "outing", "kenneth hahn"],
    hooks: [
      "Mileage is nice. Mental work is nicer.",
      "The dogs: “We can talk about this stick for nine minutes.”",
      "Trail opinions were submitted. All of them were loud.",
      "Adventure day: sidewalks, smells, and a full neighborhood audit.",
      "Sniffari or power walk — what’s the house vote?"
    ]
  },
  {
    id: "beach-day",
    label: "Beach days",
    keywords: ["beach", "huntington", "sand", "ocean", "surf"],
    hooks: [
      "Salt, sand, and zero interest in your meeting later.",
      "The dogs: “We can stay until the parking meter files a complaint.”",
      "Beach day energy: rinse required, dignity optional.",
      "Someone in this photo is going home crunchy and proud.",
      "Did your dog swim, supervise, or run a shoreline security detail?"
    ]
  },
  {
    id: "boarding-overnight",
    label: "Overnight boarding",
    keywords: ["board", "overnight", "sleepover", "hotel"],
    hooks: [
      "The sleepover, but with a bedtime plan.",
      "Our guests: “We’ll allow it… if breakfast is prompt.”",
      "Play by day. Calm by night. Suitcase drama optional.",
      "Already claimed the best nap real estate. We respect the hustle.",
      "Is your dog a suitcase overpacker or a one-toy minimalist?"
    ]
  },
  {
    id: "training",
    label: "Training & manners",
    keywords: ["train", "obedience", "leash", "cue", "manners", "heel", "class"],
    hooks: [
      "The dogs: “Just tell us the job. We’ll do the job.”",
      "Fewer lectures. More clear reps.",
      "Practiced looking extremely employed.",
      "Cue. Try. Celebrate. Drama not invited.",
      "Current side quest: leash manners or settling skills?"
    ]
  },
  {
    id: "puppy-eval",
    label: "Puppy first evaluation",
    keywords: ["puppy", "puppies", "evaluation", "young"],
    hooks: [
      "Tiny intern. Huge clipboard energy.",
      "Preparation is comfort — not a TED Talk for a 12-week-old.",
      "The puppy: “I’ll try one (1) new friend and then we discuss snacks.”",
      "First eval: curiosity over perfection. Always.",
      "Was yours a walk-right-in type or a ‘give me five minutes’ type?"
    ]
  },
  {
    id: "post-daycare",
    label: "Post-daycare zoomies",
    keywords: ["zoomies", "home", "after daycare", "decompress", "wired", "settle"],
    hooks: [
      "They clocked out and immediately started overtime at home.",
      "Recovery is part of the day — not a glitch in the matrix.",
      "Meanwhile, someone is going home acting like they had a very exhausting job.",
      "Play hard. Soft-land. Then maybe one (1) zoomie.",
      "Couch potato or hallway athlete after pickup?"
    ]
  },
  {
    id: "van-taxi",
    label: "Van rides & taxi",
    keywords: ["van", "taxi", "transport", "ride", "pickup route"],
    hooks: [
      "The van: a very exclusive shuttle with excellent gossip.",
      "Seatbelts for humans. Opinions for dogs.",
      "They boarded like frequent flyers who still inspect the snacks.",
      "Route notes: one hydrant, two greetings, zero chill.",
      "Window-seat politician or nap-in-the-back executive?"
    ]
  },
  {
    id: "shy-sensitive",
    label: "Shy / sensitive dogs",
    keywords: ["shy", "sensitive", "nervous", "anxious", "slow intro", "soft"],
    hooks: [
      "VIP energy. Smaller guest list.",
      "We’ll wait. That’s the whole strategy.",
      "Not every dog wants the full festival. Some want the lounge.",
      "A slower start isn’t a fail — it’s good taste.",
      "Selective VIP or ‘five minutes then I’m in’?"
    ]
  },
  {
    id: "enrichment",
    label: "Enrichment & puzzles",
    keywords: ["enrich", "puzzle", "brain", "mental", "snuffle", "nosework"],
    hooks: [
      "“Give us a puzzle or give us… actually just give us a puzzle.”",
      "Tired fades. Confident sticks.",
      "Looks like they just closed a deal. It was kibble.",
      "Busy is not the same as fulfilled. We pick fulfilled.",
      "Food puzzle fan or flirt-pole athlete?"
    ]
  },
  {
    id: "pickup-reunion",
    label: "Pickup reunion",
    keywords: ["pickup", "pick-up", "reunion", "going home", "end of day"],
    hooks: [
      "The reunion: 12 seconds of opera, then ‘what’s for dinner.’",
      "They missed you. They also had a full calendar.",
      "Pickup line politics: who saw you first?",
      "Going home like they survived a very glamorous internship.",
      "Dramatic reunion or businesslike nod?"
    ]
  },
  {
    id: "rainy-indoor",
    label: "Rainy indoor days",
    keywords: ["rain", "indoor", "storm", "wet"],
    hooks: [
      "Weather: dramatic. Dogs: unbothered, slightly damp.",
      "Indoor day. Outdoor opinions still accepted.",
      "The forecast called for play. We delivered, with towels.",
      "Puddles were reviewed. Most got a 5-star rating.",
      "Splash specialist or towel critic?"
    ]
  },
  {
    id: "tell-your-dog-hi",
    label: "Tell your dog we said hi",
    keywords: ["said hi", "hello", "signature", "tell your dog"],
    hooks: [
      "Tell your dog we said hi. They already knew.",
      "Please inform your dog: the yard sends regards.",
      "This is a wellness check for the one who pays the rent.",
      "We remain partners in care. Comedians on the side.",
      "Pass it on: Fitdog says hi."
    ]
  }
];

const GENERIC_HOOKS = [
  (topic: string) => `The dogs have notes on “${topic}.” We are taking them.`,
  (topic: string) => `After 16 years in Santa Monica, we can confirm: ${topic} comes with opinions.`,
  (topic: string) => `Our regulars on this: “We’ll allow it… if breakfast is prompt.”`,
  (topic: string) => `Play hard. Rest well. Repeat. Especially when the topic is ${topic}.`,
  (topic: string) => `Meanwhile, someone in this photo is treating “${topic}” like a full-time job.`
];

function normalize(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchSocialTopic(topic: string | null | undefined): SocialGeneratorTopic | null {
  const hay = normalize(topic || "");
  if (!hay) return null;
  const exact = SOCIAL_GENERATOR_TOPICS.find((row) => normalize(row.label) === hay || row.id === hay);
  if (exact) return exact;
  let best: { topic: SocialGeneratorTopic; hits: number } | null = null;
  for (const row of SOCIAL_GENERATOR_TOPICS) {
    const hits = row.keywords.filter((keyword) => hay.includes(normalize(keyword))).length;
    if (!hits) continue;
    if (!best || hits > best.hits) best = { topic: row, hits };
  }
  return best?.topic ?? null;
}

/** Funny optional hooks for a chosen or typed-in topic. Always returns options when topic is non-empty. */
export function funnyHooksForTopic(topic: string | null | undefined): string[] {
  const text = String(topic || "").trim();
  if (!text) return [];
  const matched = matchSocialTopic(text);
  if (matched?.hooks.length) return [...matched.hooks];
  const short = text.replace(/\s+/g, " ").trim();
  const clipped = short.length > 72 ? `${short.slice(0, 69).trimEnd()}…` : short;
  return GENERIC_HOOKS.map((make) => make(clipped));
}
