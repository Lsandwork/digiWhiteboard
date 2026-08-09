/** Fitdog social voice — smart, funny, never corny, never AI-slop.
 * Canonical posting style (use for every pack):
 *
 * Summer in Santa Monica: 78° ☀️
 * Our dogs: “Absolutely not. Turn the AC up.” 😂
 *
 * Play hard. Cool off. Repeat.
 *
 * After 16 years of daycare, we’ve learned that dogs have very strong opinions…
 * Meanwhile, someone in this photo is definitely going home…
 * Which dog is yours: ☀️ sunbather or ❄️ AC addict?
 */

export const FITDOG_SOCIAL_VOICE = {
  brand: "Fitdog",
  years: 16,
  place: "Santa Monica",
  placeLong: "Santa Monica, CA",
  pillars: [
    "We are partners in our members' dogs' care.",
    "We set people and dogs up for success.",
    "We always want the best for ALL dog owners.",
    "Tell your dog we said hi."
  ],
  tone: [
    "smart",
    "funny",
    "warm",
    "specific",
    "local",
    "not_corny",
    "not_corporate",
    "human",
    "observational"
  ],
  /** Default hashtag block matching staff-approved posts */
  hashtags: ["Fitdog", "SantaMonicaDogs", "DogDaycare", "DogsofLA", "DogLife"] as const,
  /** Caption recipe — keep this shape on feed / page posts */
  captionRecipe: [
    "1. Scene opener: place + concrete detail (weather, season, time of day) + light emoji",
    "2. Dog dialogue: dogs as characters with a strong opinion in quotes",
    "3. Three-beat rhythm line (e.g. Play hard. Cool off. Repeat.)",
    "4. Years lesson: After 16 years of daycare, we've learned… — witty, never corporate",
    "5. Photo beat: observational joke about the dog(s) in THIS frame",
    "6. Binary engagement question (not 'tag a friend' spam)",
    "7. Clean hashtag block — never bury the joke under 30 tags"
  ]
} as const;

export const SOCIAL_BANNED_PHRASES = [
  "In today's fast-paced world",
  "furry friend",
  "furry companion",
  "paw-some",
  "pawrent",
  "doggo",
  "hooman",
  "unleash the",
  "game changer",
  "ultimate guide",
  "look no further",
  "rest assured",
  "delve into",
  "dive into",
  "unlock the secrets",
  "whether you're a seasoned",
  "at the end of the day",
  "in conclusion",
  "let's explore",
  "this post will",
  "as an AI",
  "I'm excited to share",
  "double tap if",
  "link in bio for more info!!!",
  "tag a friend who",
  "who else can relate???",
  "hot take from the daycare floor",
  "truth bomb",
  "POV:",
  "RealNotAI",
  "no AI filler",
  "not a filter, not AI art"
];

export function scrubSocialAiSlop(text: string): string {
  let out = text;
  for (const phrase of SOCIAL_BANNED_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, "");
  }
  return out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function socialSystemPrompt(topicHint?: string): string {
  return [
    `You write social content for Fitdog — professional dog care in ${FITDOG_SOCIAL_VOICE.placeLong} with ${FITDOG_SOCIAL_VOICE.years} years of experience.`,
    "Voice: extremely smart marketer who is actually funny. Not corny. Not try-hard. Sounds like a real human who knows dogs.",
    "ALWAYS follow the Fitdog caption recipe:",
    ...FITDOG_SOCIAL_VOICE.captionRecipe,
    "Example gold standard:",
    'Summer in Santa Monica: 78° ☀️',
    'Our dogs: “Absolutely not. Turn the AC up.” 😂',
    "",
    "Play hard. Cool off. Repeat.",
    "",
    "After 16 years of daycare, we’ve learned that dogs have very strong opinions about their summer accommodations. Luckily, Fitdog comes with friends, playtime, and the sweet, sweet luxury of air conditioning. ❄️🐶",
    "",
    "Meanwhile, someone in this photo is definitely going home and acting like they had a very exhausting day at work.",
    "",
    "Which dog is yours: ☀️ sunbather or ❄️ AC addict?",
    "",
    "Drive traffic lightly — never hard sell. Prefer wit over lectures.",
    "Never invent studies, awards, or customer quotes.",
    "Emoji: sparse and intentional (☀️😂❄️🐶) — never spam.",
    topicHint ? `Topic angle: ${topicHint}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}
