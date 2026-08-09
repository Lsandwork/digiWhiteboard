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

type Theme =
  | "summer_ac"
  | "daycare_play"
  | "training"
  | "boarding"
  | "walk_hike"
  | "enrichment"
  | "dropoff"
  | "general";

type SmartCaption = {
  opener: string;
  dialogue: string;
  threeBeat: string;
  lesson: string;
  photoBeat: string;
  question: string;
  onScreen: string;
  spoken: string;
};

function cleanInline(text: string): string {
  return scrubSocialAiSlop(text.replace(/[ \t]+/g, " ").replace(/\n+/g, " ").trim());
}

function cleanMultiline(text: string): string {
  return scrubSocialAiSlop(
    text
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function topicLine(input: SocialGenerateInput): string {
  return (
    cleanInline(input.topic || input.articleTitle || "") ||
    "daycare days in Santa Monica"
  );
}

function promptBlob(input: SocialGenerateInput): string {
  return [input.topic, input.angle, input.articleTitle].filter(Boolean).join(" ").toLowerCase();
}

function detectTheme(blob: string): Theme {
  if (/heat|summer|ac\b|air.?cond|cool|hot|78|sun/i.test(blob)) return "summer_ac";
  if (/drop.?off|first day|new dog|intake/i.test(blob)) return "dropoff";
  if (/train|obedience|leash|cue|manners|heel/i.test(blob)) return "training";
  if (/board|overnight|sleepover/i.test(blob)) return "boarding";
  if (/hike|trail|walk|outing|adventure/i.test(blob)) return "walk_hike";
  if (/enrich|puzzle|brain|mental/i.test(blob)) return "enrichment";
  if (/day.?care|play|yard|regular|social/i.test(blob)) return "daycare_play";
  return "general";
}

function trafficCta(input: SocialGenerateInput): string {
  if (input.blogUrl) return `Read the full take → ${input.blogUrl}`;
  return "More on the Fitdog blog — or come say hi in Santa Monica.";
}

function hashtags(extra: string[] = []): string[] {
  return Array.from(
    new Set([...FITDOG_SOCIAL_VOICE.hashtags, ...extra].map((h) => h.replace(/^#/, "")))
  ).slice(0, 8);
}

function pickImage(images: BlogImageCandidate[] | undefined, index: number): BlogImageCandidate | null {
  if (!images?.length) return null;
  return images[index % images.length] || null;
}

function dogLabel(img: BlogImageCandidate | null): string {
  const name = img?.dogNames?.[0];
  return name ? String(name) : "someone in this photo";
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
    visualDirection: cleanInline(
      `USE THIS REAL PHOTO (${img.sourceKind}): ${img.sceneDescription}.${dogBit} ${fallbackDirection}`
    ),
    imageUrl: img.url,
    imageAlt: img.alt,
    imageCredit: credit || undefined,
    imageSourceKind: img.sourceKind
  };
}

function composeSmartCaption(
  input: SocialGenerateInput,
  img: BlogImageCandidate | null,
  variant: number
): SmartCaption {
  const years = FITDOG_SOCIAL_VOICE.years;
  const place = FITDOG_SOCIAL_VOICE.place;
  const theme = detectTheme(promptBlob(input));
  const topic = topicLine(input);
  const angle = cleanInline(input.angle || "");
  const dog = dogLabel(img);
  const named = Boolean(img?.dogNames?.[0]);
  const subject = named ? dog : "this regular";

  const packs: Record<Theme, SmartCaption[]> = {
    summer_ac: [
      {
        opener: `Summer in ${place}: 78° ☀️`,
        dialogue: `Our dogs: “Absolutely not. Turn the AC up.” 😂`,
        threeBeat: "Play hard. Cool off. Repeat.",
        lesson: `After ${years} years of daycare, we’ve learned that dogs have very strong opinions about their summer accommodations. Luckily, Fitdog comes with friends, playtime, and the sweet, sweet luxury of air conditioning. ❄️🐶`,
        photoBeat: named
          ? `Meanwhile, ${dog} is definitely going home and acting like they had a very exhausting day at work.`
          : `Meanwhile, someone in this photo is definitely going home and acting like they had a very exhausting day at work.`,
        question: "Which dog is yours: ☀️ sunbather or ❄️ AC addict?",
        onScreen: "Play hard. Cool off. Repeat.",
        spoken: `Summer in ${place}. The dogs requested AC. We delivered. ${years} years of daycare will teach you that.`
      },
      {
        opener: `Heat advisory in ${place}. The dogs filed a formal complaint. ☀️`,
        dialogue: `Their proposal: “Shade. Water. AC. In that order.”`,
        threeBeat: "Sprint. Splash. Lounge.",
        lesson: angle
          ? `After ${years} years here, we take that feedback seriously. ${angle.charAt(0).toUpperCase()}${angle.slice(1)} — and yes, the air conditioning is part of the care plan.`
          : `After ${years} years here, we take that feedback seriously. Friends, play, and climate control that doesn’t apologize for itself.`,
        photoBeat: `${subject.charAt(0).toUpperCase()}${subject.slice(1)} clocked the indoor lounge like a VIP suite.`,
        question: "Team patio nap or team indoor freeze?",
        onScreen: "AC is a love language.",
        spoken: `Hot day. Cool dogs. That's the whole strategy.`
      }
    ],
    daycare_play: [
      {
        opener: `Daycare in ${place}: peak chaos, peak joy. 🐶`,
        dialogue: `Our regulars: “We live here now. Don’t make it weird.”`,
        threeBeat: "Arrive. Play. Soft-land.",
        lesson: `After ${years} years of daycare, we’ve learned the quiet truth: dogs don’t need a perfect day — they need a smart one. Fitdog is friends, structure, and enough fun that home feels easy again.`,
        photoBeat: named
          ? `Meanwhile, ${dog} is mid-shift and treating the yard like a LinkedIn networking event.`
          : `Meanwhile, someone in this photo is mid-shift and treating the yard like a LinkedIn networking event.`,
        question: "Which dog is yours: social butterfly or selective VIP?",
        onScreen: "Arrive. Play. Soft-land.",
        spoken: `Regulars don’t need a speech. They need a good day. We build those.`
      },
      {
        opener: `${place} daycare energy: clocks optional, friends mandatory.`,
        dialogue: `The group chat (aka the yard): “Same time tomorrow?”`,
        threeBeat: "Run. Wrestle. Reset.",
        lesson: angle
          ? `After ${years} years, we’ve learned how to read a room full of dogs. Angle we’re sitting with: ${angle}.`
          : `After ${years} years, we’ve learned how to read a room full of dogs — and when to turn the volume down.`,
        photoBeat: `${subject.charAt(0).toUpperCase()}${subject.slice(1)} is living their best unpaid internship in enrichment.`,
        question: "Is your dog a sprinter, a schemer, or a professional napper?",
        onScreen: "Friends > perfect schedules",
        spoken: `This is what a real Fitdog day looks like. No filter needed.`
      }
    ],
    training: [
      {
        opener: `Training in ${place}: fewer lectures, more clear reps.`,
        dialogue: `The dogs: “Just tell us the job. We’ll do the job.”`,
        threeBeat: "Cue. Try. Celebrate.",
        lesson: `After ${years} years, we’ve learned confidence is sticky — tired is temporary. Fitdog sets people and dogs up for success without the drama.`,
        photoBeat: named
          ? `${dog} practiced looking extremely employed.`
          : `Someone in this photo practiced looking extremely employed.`,
        question: "What’s your dog’s current side quest: leash manners or settling skills?",
        onScreen: "Cue. Try. Celebrate.",
        spoken: `Clear cues. Kind humans. Dogs who actually get it.`
      }
    ],
    boarding: [
      {
        opener: `Overnight in ${place}: the sleepover, but with a bedtime plan.`,
        dialogue: `Our guests: “We’ll allow it… if breakfast is prompt.”`,
        threeBeat: "Play. Rest. Repeat.",
        lesson: `After ${years} years of boarding and daycare, we’ve learned dogs sleep better when the day had a point. Friends by day, calm by night.`,
        photoBeat: `${subject.charAt(0).toUpperCase()}${subject.slice(1)} already claimed the best nap real estate.`,
        question: "Is your dog a suitcase overpacker or a one-toy minimalist?",
        onScreen: "Play. Rest. Repeat.",
        spoken: `Boarding that feels like care, not a waiting room.`
      }
    ],
    walk_hike: [
      {
        opener: `${place} outing energy: sidewalks, smells, opinions.`,
        dialogue: `The dogs: “We can talk about this hydrant for nine minutes.”`,
        threeBeat: "Walk. Sniff. Decompress.",
        lesson: `After ${years} years, we’ve learned a good walk isn’t just mileage — it’s mental work that makes home quieter.`,
        photoBeat: named
          ? `${dog} is conducting a full neighborhood audit.`
          : `Someone in this photo is conducting a full neighborhood audit.`,
        question: "Sniffari or power walk — what’s the house vote?",
        onScreen: "Walk. Sniff. Decompress.",
        spoken: `Mileage is nice. Mental work is nicer.`
      }
    ],
    enrichment: [
      {
        opener: `Brain work in ${place}: because ‘tired’ isn’t the only win.`,
        dialogue: `Our dogs: “Give us a puzzle or give us… actually just give us a puzzle.”`,
        threeBeat: "Think. Try. Earn.",
        lesson: `After ${years} years of daycare, we’ve learned enrichment isn’t busywork — it’s how dogs stop micromanaging your evening.`,
        photoBeat: `${subject.charAt(0).toUpperCase()}${subject.slice(1)} looks like they just closed a deal.`,
        question: "Food puzzle fan or flirt-pole athlete?",
        onScreen: "Think. Try. Earn.",
        spoken: `Tired fades. Confident sticks.`
      }
    ],
    dropoff: [
      {
        opener: `First-day energy in ${place}: brave humans, curious dogs.`,
        dialogue: `The new kid: “I’ll allow this… pending snack review.”`,
        threeBeat: "Arrive. Explore. Soft-land.",
        lesson: `After ${years} years of daycare drop-offs, we’ve learned confidence stacks in tiny wins — not perfect mornings.`,
        photoBeat: named
          ? `${dog} is collecting data like a very fluffy intern.`
          : `Someone in this photo is collecting data like a very fluffy intern.`,
        question: "Was your dog a walk-right-in type or a ‘give me five minutes’ type?",
        onScreen: "Tiny wins > perfect days",
        spoken: `Drop-off doesn’t have to be a movie scene. Tiny wins count.`
      }
    ],
    general: [
      {
        opener: `${place} dog life: unfiltered, unsupervised by algorithms. 🐶`,
        dialogue: `Our dogs: “We have notes.”`,
        threeBeat: "Play hard. Rest well. Repeat.",
        lesson: angle
          ? `After ${years} years of daycare, we’ve learned a few things about ${topic}. Especially this: ${angle}.`
          : `After ${years} years of daycare, we’ve learned dogs thrive when the day has friends, clarity, and enough joy to soft-land at home.`,
        photoBeat: named
          ? `Meanwhile, ${dog} is out here treating adulthood like an optional setting.`
          : `Meanwhile, someone in this photo is out here treating adulthood like an optional setting.`,
        question: "Which dog is yours: chaos gremlin or zen master?",
        onScreen: "Play hard. Rest well. Repeat.",
        spoken: `Smart care. Real dogs. ${place}.`
      },
      {
        opener: `A ${place} reminder from the yard:`,
        dialogue: `The committee of dogs: “We prefer competent humans.”`,
        threeBeat: "Show up. Be clear. Be kind.",
        lesson: `After ${years} years, Fitdog still runs on the same idea — set people and dogs up for success, then get out of the way of the fun.`,
        photoBeat: `${subject.charAt(0).toUpperCase()}${subject.slice(1)} approved this message (reluctantly, then enthusiastically).`,
        question: "Coffee-before-walk household or walk-before-coffee household?",
        onScreen: "Be clear. Be kind.",
        spoken: `Partners in care. Comedians on the side.`
      }
    ]
  };

  const options = packs[theme];
  return options[variant % options.length]!;
}

function formatFeedCaption(caption: SmartCaption, cta?: string): { hook: string; body: string } {
  const hook = cleanMultiline(`${caption.opener}\n${caption.dialogue}`);
  const bodyParts = [
    caption.threeBeat,
    "",
    caption.lesson,
    "",
    caption.photoBeat,
    "",
    caption.question
  ];
  if (cta) {
    bodyParts.push("", cta);
  }
  return { hook, body: cleanMultiline(bodyParts.join("\n")) };
}

function buildItems(input: SocialGenerateInput): SocialPackItemInput[] {
  const cta = trafficCta(input);
  const images = input.images || [];
  const img0 = pickImage(images, 0);
  const img1 = pickImage(images, 1);
  const img2 = pickImage(images, 2);
  const img3 = pickImage(images, 3);

  const cap0 = composeSmartCaption(input, img0, 0);
  const cap1 = composeSmartCaption(input, img1, 1);
  const cap2 = composeSmartCaption(input, img2, 0);
  const feed0 = formatFeedCaption(cap0, input.blogUrl ? cta : undefined);
  const feed1 = formatFeedCaption(cap1, undefined);
  const fb = formatFeedCaption(cap0, cta);

  const items: SocialPackItemInput[] = [
    {
      platform: "instagram",
      format: "feed",
      hook: feed0.hook,
      body: feed0.body,
      cta: input.blogUrl ? cta : "Come say hi in Santa Monica.",
      hashtags: hashtags(),
      ...imageFields(img0, "Square/4:5 crop — dog mid-play or mid-lounge, natural light."),
      toneTags: ["smart", "funny", "local", "observational"]
    },
    {
      platform: "instagram",
      format: "feed",
      hook: feed1.hook,
      body: feed1.body,
      cta: "Tell your dog we said hi.",
      hashtags: hashtags(),
      ...imageFields(img1, "Close crop on a real dog working, playing, or resting."),
      toneTags: ["smart", "funny", "practical"]
    },
    {
      platform: "instagram",
      format: "story",
      hook: cap2.opener,
      body: cleanMultiline(`${cap2.dialogue}\n${cap2.threeBeat}`),
      cta: "Sticker → blog or booking",
      hashtags: [],
      ...imageFields(img2, "Vertical 9:16 — bold text top third, real dog face bottom."),
      toneTags: ["punchy", "human"],
      onScreenText: cap2.onScreen
    },
    {
      platform: "instagram",
      format: "story",
      hook: cap0.question,
      body: cleanInline(`${cap0.threeBeat} Tap for the longer take.`),
      cta: "Link sticker → blog",
      hashtags: [],
      ...imageFields(img0, "Poll sticker + candid facility photo."),
      toneTags: ["signature", "warm"],
      onScreenText: cap0.question.replace(/[☀️❄️🐶😂]/g, "").trim()
    },
    {
      platform: "instagram",
      format: "reel",
      hook: cap0.dialogue,
      body: cleanMultiline(
        `${cap0.opener}\n${cap0.threeBeat}\nHook on dialogue → real play → cool-down → end on the question.`
      ),
      cta,
      hashtags: hashtags(["Reels"]),
      ...imageFields(img1, "Jump-cut from real arrival / play / water-break photos."),
      toneTags: ["funny", "kinetic"],
      scriptSpoken: cleanInline(cap0.spoken),
      onScreenText: cap0.onScreen
    },
    {
      platform: "facebook",
      format: "page_post",
      hook: fb.hook,
      body: fb.body,
      cta,
      hashtags: hashtags(),
      ...imageFields(img0, "Landscape crop — supervised play, caption-forward."),
      toneTags: ["smart", "community", "funny"]
    },
    {
      platform: "facebook",
      format: "video_script",
      hook: cap1.opener,
      body: cleanInline(`${cap1.threeBeat} Open on real play → cut to lounge → end on Fitdog sign.`),
      cta,
      hashtags: hashtags(),
      ...imageFields(img2, "Phone-vertical or 1:1; natural audio ok."),
      toneTags: ["funny", "direct"],
      scriptSpoken: cleanInline(cap1.spoken),
      onScreenText: cap1.onScreen
    },
    {
      platform: "tiktok",
      format: "caption_script",
      hook: cap0.dialogue,
      body: cleanMultiline(`${cap0.opener}\n${cap0.threeBeat}\n${cap0.lesson}`),
      cta: `${cta}`,
      hashtags: hashtags(["DogTok"]),
      ...imageFields(img3, "Talking-to-camera or real B-roll with kinetic text."),
      toneTags: ["sharp", "funny"],
      onScreenText: cap0.onScreen,
      scriptSpoken: cleanInline(`${cap0.spoken} ${cap0.question}`)
    },
    {
      platform: "snapchat",
      format: "story",
      hook: cap1.opener,
      body: cleanInline(`${cap1.dialogue} ${cap1.threeBeat}`),
      cta: "Attach link → blog",
      hashtags: [],
      ...imageFields(img1, "Snap filters light/none; big readable text; dog eye-level."),
      toneTags: ["casual", "local"],
      onScreenText: cap1.onScreen
    },
    {
      platform: "snapchat",
      format: "spotlight",
      hook: cap0.threeBeat,
      body: cleanInline(`Joke first (${cap0.dialogue}) → expertise second → wink last.`),
      cta,
      hashtags: hashtags(),
      ...imageFields(img0, "Fast cuts from real Santa Monica daycare frames."),
      toneTags: ["funny", "bright"],
      scriptSpoken: cleanInline(cap0.spoken),
      onScreenText: cap0.onScreen
    }
  ];

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
      "SMART Fitdog style: scene opener → dog dialogue → three-beat line → 16-year lesson → photo joke → binary question",
      "Gold standard: Summer in Santa Monica: 78° / Our dogs: “Turn the AC up.” / Play hard. Cool off. Repeat.",
      "Funny + specific + local — never corny, never corporate, never AI-lecture",
      "Hashtags stay clean: #Fitdog #SantaMonicaDogs #DogDaycare #DogsofLA #DogLife",
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
    hashtags: item.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "),
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
        row.hook,
        "",
        row.body,
        "",
        row.onScreenText ? `ON-SCREEN: ${row.onScreenText}` : "",
        row.scriptSpoken ? `SPOKEN: ${row.scriptSpoken}` : "",
        row.cta ? `CTA: ${row.cta}` : "",
        row.hashtags ? row.hashtags : "",
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
