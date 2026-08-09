import { scrubSocialAiSlop, FITDOG_SOCIAL_VOICE } from "@/lib/blog/social/voice";
import type { SocialPackItemInput, SocialPackResult, SocialPlatform } from "@/lib/blog/social/types";
import type { BlogImageCandidate } from "@/lib/blog/media/types";

export type SocialGenerateInput = {
  topic?: string | null;
  angle?: string | null;
  blogUrl?: string | null;
  articleTitle?: string | null;
  /** Real photos from bulk library + web search */
  images?: BlogImageCandidate[];
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

function pickImage(images: BlogImageCandidate[] | undefined, index: number): BlogImageCandidate | null {
  if (!images?.length) return null;
  return images[index % images.length] || null;
}

function imageFields(img: BlogImageCandidate | null, fallbackDirection: string) {
  if (!img) {
    return {
      visualDirection: `${fallbackDirection} Use a real Fitdog bulk photo or licensed web photo — never AI-generated imagery.`,
      imageUrl: undefined as string | undefined,
      imageAlt: undefined as string | undefined,
      imageCredit: undefined as string | undefined,
      imageSourceKind: undefined as SocialPackItemInput["imageSourceKind"]
    };
  }
  const credit = [img.photographer, img.license].filter(Boolean).join(" · ");
  const dogBit = img.dogNames?.length ? ` Featuring ${img.dogNames.slice(0, 3).join(", ")}.` : "";
  return {
    visualDirection: clean(
      `USE THIS REAL PHOTO (${img.sourceKind}): ${img.sceneDescription}.${dogBit} ${fallbackDirection} No AI-generated images.`
    ),
    imageUrl: img.url,
    imageAlt: img.alt,
    imageCredit: credit || undefined,
    imageSourceKind: img.sourceKind
  };
}

function sceneHook(img: BlogImageCandidate | null, topic: string): string {
  if (!img) return `Your dog doesn't need a perfect schedule. They need a smart one.`;
  if (img.sourceKind === "bulk_photo") {
    const dog = img.dogNames?.[0];
    if (dog) return `${dog} clocked that today had a plan.`;
    if (img.category) return `Real daycare energy: ${String(img.category).replace(/_/g, " ")}.`;
    return `This is what a real Fitdog day looks like — not a filter, not AI art.`;
  }
  return `Real dogs. Real photos. A clearer take on ${topic.slice(0, 48)}.`;
}

function sceneBody(img: BlogImageCandidate | null, topic: string, years: number): string {
  if (img?.sourceKind === "bulk_photo") {
    const where = img.yard ? ` in the ${String(img.yard).replace(/_/g, " ")} yard` : "";
    const dogs = img.dogNames?.length ? ` (${img.dogNames.slice(0, 3).join(", ")})` : "";
    return clean(
      `${topic.charAt(0).toUpperCase()}${topic.slice(1)}. This frame${where}${dogs} is from our Digi Board photo library — a real Santa Monica daycare moment after ${years} years of doing this work. We're not here to lecture — we're partners in their care. Tell your dog we said hi.`
    );
  }
  if (img) {
    return clean(
      `${topic.charAt(0).toUpperCase()}${topic.slice(1)}. The photo with this post is real licensed photography (not AI-generated) chosen to match the point: dogs thrive when humans stop guessing and start partnering. After ${years} years in Santa Monica, that's still the quiet truth.`
    );
  }
  return clean(
    `${topic.charAt(0).toUpperCase()}${topic.slice(1)}. After ${years} years in Santa Monica, we've learned the quiet truth: dogs thrive when humans stop guessing and start partnering. We're not here to lecture — we're here to set you both up for success. Tell your dog we said hi.`
  );
}

function buildItems(input: SocialGenerateInput): SocialPackItemInput[] {
  const topic = topicLine(input);
  const cta = trafficCta(input);
  const years = FITDOG_SOCIAL_VOICE.years;
  const images = input.images || [];
  const img0 = pickImage(images, 0);
  const img1 = pickImage(images, 1);
  const img2 = pickImage(images, 2);
  const img3 = pickImage(images, 3);

  const items: SocialPackItemInput[] = [
    {
      platform: "instagram",
      format: "feed",
      hook: sceneHook(img0, topic),
      body: sceneBody(img0, topic, years),
      cta,
      hashtags: hashtags(["DogCare", "RealNotAI"]),
      ...imageFields(img0, "Square/4:5 crop — dog mid-play, natural light."),
      toneTags: ["smart", "warm", "local"]
    },
    {
      platform: "instagram",
      format: "feed",
      hook: `Hot take from the daycare floor:`,
      body: clean(
        img1?.sourceKind === "bulk_photo"
          ? `Enrichment isn't "keeping them busy." It's giving their brain a job so the rest of the day feels easier at home. This real Fitdog shot${img1.category ? ` (${String(img1.category).replace(/_/g, " ")})` : ""} is the opposite of a fake AI dog collage.`
          : `Enrichment isn't "keeping them busy." It's giving their brain a job so the rest of the day feels easier at home. That's the Fitdog partnership model — we handle the skill-building stretch; you get a dog who settles like they meant it.`
      ),
      cta,
      hashtags: hashtags(["DogEnrichment"]),
      ...imageFields(img1, "Close crop on a real dog working or resting after play."),
      toneTags: ["funny", "expert", "practical"]
    },
    {
      platform: "instagram",
      format: "story",
      hook: `Quick check-in for dog people:`,
      body: clean(
        `Did your dog get a win today — even a tiny one? Confidence stacks. Tap for a Santa Monica-tested tip on ${topic}. Photo: real, not AI.`
      ),
      cta: "Swipe up / sticker → blog",
      hashtags: [],
      ...imageFields(img2, "Vertical 9:16 — bold text sticker top third, real dog face bottom."),
      toneTags: ["punchy", "human"],
      onScreenText: "Tiny wins > perfect days"
    },
    {
      platform: "instagram",
      format: "story",
      hook: `Tell your dog we said hi.`,
      body: clean(
        `From the Fitdog crew in Santa Monica — partners in their care, not spectators. ${cta}`
      ),
      cta: "Link sticker → blog or booking",
      hashtags: [],
      ...imageFields(img0, "Handwritten-style text over candid facility photo."),
      toneTags: ["signature", "warm"],
      onScreenText: "Tell your dog we said hi"
    },
    {
      platform: "instagram",
      format: "reel",
      hook: `POV: your dog just figured out the day wasn't going to be boring.`,
      body: clean(
        `Hook → 2 seconds of real play → cut to calm skill → end on partnership line. Use Digi Board bulk clips/photos — never AI B-roll.`
      ),
      cta,
      hashtags: hashtags(["Reels", "DogDaycare"]),
      ...imageFields(img1, "Jump-cut from real arrival / play / water break photos."),
      toneTags: ["funny", "kinetic"],
      scriptSpoken: clean(
        `Okay real talk — dogs don't need more stuff. They need better days. ${years} years in Santa Monica taught us that. We set people and dogs up for success. Tell your dog we said hi.`
      ),
      onScreenText: "Better days > more stuff"
    },
    {
      platform: "facebook",
      format: "page_post",
      hook: `A note for dog owners who care a little too much (affectionate):`,
      body: clean(
        `You're not overthinking it — you're being a good partner. ${topic.charAt(0).toUpperCase()}${topic.slice(1)}. At Fitdog we've spent ${years} years in Santa Monica learning what actually helps dogs succeed: clear structure, kind humans, and enough mental work that home feels peaceful again.\n\n${
          img0?.sourceKind === "bulk_photo"
            ? "The photo here is from our real Digi Board library — same dogs, same yards, no AI filler."
            : "We're pairing this with real photography only (no AI-generated dogs)."
        }\n\nIf you want the longer version (with less algorithm nonsense), it's on the blog.`
      ),
      cta,
      hashtags: hashtags(),
      ...imageFields(img0, "Landscape crop — supervised play, caption-forward."),
      toneTags: ["smart", "community"]
    },
    {
      platform: "facebook",
      format: "video_script",
      hook: `15-second truth bomb`,
      body: clean(`Open on real leash moment → cut to calm group photo → end on Fitdog sign. No synthetic clips.`),
      cta,
      hashtags: hashtags(["SantaMonica"]),
      ...imageFields(img2, "Phone-vertical or 1:1; natural audio ok."),
      toneTags: ["funny", "direct"],
      scriptSpoken: clean(
        `Nobody warns you that dog care is a teamwork sport. We do. Fitdog — Santa Monica — ${years} years of setting dogs and people up for success. Tell your dog we said hi.`
      ),
      onScreenText: "Teamwork sport."
    },
    {
      platform: "tiktok",
      format: "caption_script",
      hook: `Dog people who "just want them tired" are playing the wrong game.`,
      body: clean(
        `Tired is temporary. Confident is sticky. Here's how we think about ${topic} after ${years} years on the Westside. B-roll = real daycare photos.`
      ),
      cta: `${cta} #Fitdog`,
      hashtags: hashtags(["TikTokDogs", "DogTok"]),
      ...imageFields(img3, "Talking-to-camera or real B-roll with kinetic text."),
      toneTags: ["sharp", "funny"],
      onScreenText: "Tired ≠ trained",
      scriptSpoken: clean(
        `Okay, controversial daycare opinion: a wiped-out dog who still panics at the door isn't a win. A dog who can settle? That's the win. We're Fitdog in Santa Monica. Partners in your dog's care. Tell them we said hi.`
      )
    },
    {
      platform: "snapchat",
      format: "story",
      hook: `SM dog update`,
      body: clean(
        `Short snap: one sentence tip on ${topic}. Second snap: real photo + "partners in care" + link.`
      ),
      cta: "Attach link → blog",
      hashtags: [],
      ...imageFields(img1, "Snap filters light/none; big readable text; dog eye-level."),
      toneTags: ["casual", "local"],
      onScreenText: "Partners in care."
    },
    {
      platform: "snapchat",
      format: "spotlight",
      hook: `When your dog clocks that today has a plan`,
      body: clean(`Spotlight length: 12–20s. Joke first, expertise second, goodbye wink last. Real photos only.`),
      cta,
      hashtags: hashtags(["Snapchat"]),
      ...imageFields(img0, "Fast cuts from real sunny Santa Monica daycare frames."),
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
  const bulkCount = (input.images || []).filter((i) => i.sourceKind === "bulk_photo").length;
  const webCount = (input.images || []).filter((i) => i.sourceKind === "web_licensed").length;
  return {
    title: `Social pack — ${topic.slice(0, 72)}`,
    voiceNotes: [
      "Smart + funny, never corny",
      "Sound human — specific Santa Monica / Fitdog detail",
      "Drive traffic without hard sell",
      "Tell your dog we said hi when it fits",
      "REAL PHOTOS ONLY — Digi Board bulk library first, licensed web photos second; never AI-generated images",
      bulkCount || webCount
        ? `Attached ${bulkCount} bulk photo(s) + ${webCount} licensed web photo(s); captions written to match those scenes.`
        : "No photos attached yet — still write for real photography; staff should pull from Bulk Photo Upload."
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
    imageUrl: item.imageUrl || "",
    imageAlt: item.imageAlt || "",
    imageCredit: item.imageCredit || "",
    imageSourceKind: item.imageSourceKind || "",
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
    "imageUrl",
    "imageAlt",
    "imageCredit",
    "imageSourceKind",
    "toneTags",
    "scriptSpoken",
    "onScreenText"
  ];
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((h) => escape(String((row as Record<string, string>)[h] || ""))).join(","))].join(
    "\n"
  );
}

export function toTxt(rows: ReturnType<typeof packItemToDownloadRow>[]): string {
  return rows
    .map((row, index) =>
      [
        `--- ${row.platform.toUpperCase()} / ${row.format} #${index + 1} ---`,
        `HOOK: ${row.hook}`,
        "",
        row.body,
        "",
        row.onScreenText ? `ON-SCREEN: ${row.onScreenText}` : "",
        row.scriptSpoken ? `SPOKEN: ${row.scriptSpoken}` : "",
        `CTA: ${row.cta}`,
        row.hashtags ? `HASHTAGS: ${row.hashtags}` : "",
        `VISUAL: ${row.visualDirection}`,
        row.imageUrl ? `IMAGE_URL: ${row.imageUrl}` : "",
        row.imageAlt ? `IMAGE_ALT: ${row.imageAlt}` : "",
        row.imageCredit ? `IMAGE_CREDIT: ${row.imageCredit}` : "",
        row.imageSourceKind ? `IMAGE_SOURCE: ${row.imageSourceKind}` : "",
        row.toneTags ? `TONE: ${row.toneTags}` : ""
      ]
        .filter((line) => line !== "")
        .join("\n")
    )
    .join("\n\n");
}
