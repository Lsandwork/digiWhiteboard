import { scrubSocialAiSlop, FITDOG_SOCIAL_VOICE } from "@/lib/blog/social/voice";
import type { SocialPackItemInput, SocialPackResult, SocialPlatform } from "@/lib/blog/social/types";

export type SocialGenerateInput = {
  topic?: string | null;
  angle?: string | null;
  blogUrl?: string | null;
  articleTitle?: string | null;
};

function clean(text: string): string {
  return scrubSocialAiSlop(text.replace(/\s+/g, " ").trim());
}

function topicLine(input: SocialGenerateInput): string {
  return (
    clean(input.topic || input.articleTitle || "") ||
    "helping Santa Monica dogs feel confident on real days, not perfect days"
  );
}

function trafficCta(input: SocialGenerateInput): string {
  if (input.blogUrl) return `Read the full take → ${input.blogUrl}`;
  return "More on the Fitdog blog — or come say hi in Santa Monica.";
}

function hashtags(extra: string[] = []): string[] {
  return Array.from(
    new Set(
      ["Fitdog", "SantaMonicaDogs", "DogDaycare", "DogTraining", "LADogs", ...extra].map((h) =>
        h.replace(/^#/, "")
      )
    )
  ).slice(0, 8);
}

function buildItems(input: SocialGenerateInput): SocialPackItemInput[] {
  const topic = topicLine(input);
  const cta = trafficCta(input);
  const years = FITDOG_SOCIAL_VOICE.years;

  const items: SocialPackItemInput[] = [
    // Instagram feed
    {
      platform: "instagram",
      format: "feed",
      hook: `Your dog doesn't need a perfect schedule. They need a smart one.`,
      body: clean(
        `${topic.charAt(0).toUpperCase()}${topic.slice(1)}. After ${years} years in Santa Monica, we've learned the quiet truth: dogs thrive when humans stop guessing and start partnering. We're not here to lecture — we're here to set you both up for success. Tell your dog we said hi.`
      ),
      cta,
      hashtags: hashtags(["DogCare"]),
      visualDirection: "Real Fitdog yard or trail moment — dog mid-play, natural light, no stock-photo smiles.",
      toneTags: ["smart", "warm", "local"]
    },
    {
      platform: "instagram",
      format: "feed",
      hook: `Hot take from the daycare floor:`,
      body: clean(
        `Enrichment isn't "keeping them busy." It's giving their brain a job so the rest of the day feels easier at home. That's the Fitdog partnership model — we handle the skill-building stretch; you get a dog who settles like they meant it.`
      ),
      cta,
      hashtags: hashtags(["DogEnrichment"]),
      visualDirection: "Close-up of a dog working a puzzle or calm post-play water break.",
      toneTags: ["funny", "expert", "practical"]
    },
    // Instagram story
    {
      platform: "instagram",
      format: "story",
      hook: `Quick check-in for dog people:`,
      body: clean(
        `Did your dog get a win today — even a tiny one? Confidence stacks. Tap for a Santa Monica-tested tip on ${topic}.`
      ),
      cta: "Swipe up / sticker → blog",
      hashtags: [],
      visualDirection: "Vertical 9:16 — bold text sticker top third, dog face bottom, sunny SM light.",
      toneTags: ["punchy", "human"],
      onScreenText: "Tiny wins > perfect days"
    },
    {
      platform: "instagram",
      format: "story",
      hook: `Tell your dog we said hi.`,
      body: clean(
        `From the Fitdog crew in Santa Monica — we're partners in their care, not spectators. ${cta}`
      ),
      cta: "Link sticker → blog or booking",
      hashtags: [],
      visualDirection: "Handwritten-style text over candid facility photo.",
      toneTags: ["signature", "warm"],
      onScreenText: "Tell your dog we said hi 👋"
    },
    // Instagram reel
    {
      platform: "instagram",
      format: "reel",
      hook: `POV: your dog just figured out the day wasn't going to be boring.`,
      body: clean(
        `Hook → 2 seconds of chaos joy → cut to calm skill → end on partnership line. Caption keeps it smart, not shouty.`
      ),
      cta,
      hashtags: hashtags(["Reels", "DogDaycare"]),
      visualDirection: "Jump-cut: arrival wag → play group → water bowl victory lap.",
      toneTags: ["funny", "kinetic"],
      scriptSpoken: clean(
        `Okay real talk — dogs don't need more stuff. They need better days. ${years} years in Santa Monica taught us that. We set people and dogs up for success. Tell your dog we said hi.`
      ),
      onScreenText: "Better days > more stuff"
    },
    // Facebook
    {
      platform: "facebook",
      format: "page_post",
      hook: `A note for dog owners who care a little too much (affectionate):`,
      body: clean(
        `You're not overthinking it — you're being a good partner. ${topic.charAt(0).toUpperCase()}${topic.slice(1)}. At Fitdog we've spent ${years} years in Santa Monica learning what actually helps dogs succeed: clear structure, kind humans, and enough mental work that home feels peaceful again.\n\nIf you want the longer version (with less algorithm nonsense), it's on the blog.`
      ),
      cta,
      hashtags: hashtags(),
      visualDirection: "Landscape photo of dogs in supervised play — caption-forward post.",
      toneTags: ["smart", "community"]
    },
    {
      platform: "facebook",
      format: "video_script",
      hook: `15-second truth bomb`,
      body: clean(`Open on leash tangle → cut to calm group → end on Fitdog sign / smile.`),
      cta,
      hashtags: hashtags(["SantaMonica"]),
      visualDirection: "Phone-vertical or 1:1; natural audio ok.",
      toneTags: ["funny", "direct"],
      scriptSpoken: clean(
        `Nobody warns you that dog care is a teamwork sport. We do. Fitdog — Santa Monica — ${years} years of setting dogs and people up for success. Tell your dog we said hi.`
      ),
      onScreenText: "Teamwork sport."
    },
    // TikTok
    {
      platform: "tiktok",
      format: "caption_script",
      hook: `Dog people who "just want them tired" are playing the wrong game.`,
      body: clean(
        `Tired is temporary. Confident is sticky. Here's how we think about ${topic} after ${years} years on the Westside.`
      ),
      cta: `${cta} #Fitdog`,
      hashtags: hashtags(["TikTokDogs", "DogTok"]),
      visualDirection: "Talking-to-camera or B-roll of play with kinetic text.",
      toneTags: ["sharp", "funny"],
      onScreenText: "Tired ≠ trained",
      scriptSpoken: clean(
        `Okay, controversial daycare opinion: a wiped-out dog who still panics at the door isn't a win. A dog who can settle? That's the win. We're Fitdog in Santa Monica. Partners in your dog's care. Tell them we said hi.`
      )
    },
    // Snapchat
    {
      platform: "snapchat",
      format: "story",
      hook: `SM dog update`,
      body: clean(
        `Short snap: one sentence tip on ${topic}. Second snap: "partners in care" + link to blog.`
      ),
      cta: "Attach link → blog",
      hashtags: [],
      visualDirection: "Snap filters light/none; big readable text; dog eye-level.",
      toneTags: ["casual", "local"],
      onScreenText: "Partners in care."
    },
    {
      platform: "snapchat",
      format: "spotlight",
      hook: `When your dog clocks that today has a plan`,
      body: clean(`Spotlight length: 12–20s. Joke first, expertise second, goodbye wink last.`),
      cta,
      hashtags: hashtags(["Snapchat"]),
      visualDirection: "Fast cuts, sunny Santa Monica outdoor energy.",
      toneTags: ["funny", "bright"],
      scriptSpoken: clean(
        `Plot twist: the best dog care looks boring from the outside — calm arrivals, clear cues, happy exits. That's ${years} years of Fitdog. Tell your dog we said hi.`
      ),
      onScreenText: "Calm is a skill."
    }
  ];

  if (input.angle) {
    items[0]!.body = clean(`${items[0]!.body} Angle we're sitting with: ${input.angle}.`);
  }

  return items;
}

export function generateSocialPackDeterministic(input: SocialGenerateInput = {}): SocialPackResult {
  const topic = topicLine(input);
  const items = buildItems(input);
  return {
    title: `Social pack — ${topic.slice(0, 72)}`,
    voiceNotes: [
      "Smart + funny, never corny",
      "Sound human — specific Santa Monica / Fitdog detail",
      "Drive traffic without hard sell",
      "Tell your dog we said hi when it fits"
    ],
    items
  };
}

export function itemsByPlatform(items: SocialPackItemInput[]): Record<SocialPlatform, SocialPackItemInput[]> {
  const out: Record<SocialPlatform, SocialPackItemInput[]> = {
    instagram: [],
    facebook: [],
    tiktok: [],
    snapchat: []
  };
  for (const item of items) out[item.platform].push(item);
  return out;
}

export function packItemToDownloadRow(item: SocialPackItemInput) {
  return {
    platform: item.platform,
    format: item.format,
    hook: item.hook,
    body: item.body,
    cta: item.cta,
    hashtags: item.hashtags.join(" "),
    visualDirection: item.visualDirection,
    toneTags: item.toneTags.join(", "),
    scriptSpoken: item.scriptSpoken || "",
    onScreenText: item.onScreenText || ""
  };
}

export function toCsv(rows: ReturnType<typeof packItemToDownloadRow>[]): string {
  const headers = [
    "platform",
    "format",
    "hook",
    "body",
    "cta",
    "hashtags",
    "visualDirection",
    "toneTags",
    "scriptSpoken",
    "onScreenText"
  ];
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((h) => escape(String((row as Record<string, string>)[h] || ""))).join(","))].join(
    "\n"
  );
}
