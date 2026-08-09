export const SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok", "snapchat"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type SocialFormat =
  | "feed"
  | "story"
  | "reel"
  | "page_post"
  | "video_script"
  | "caption_script"
  | "spotlight";

export type SocialPackItemInput = {
  platform: SocialPlatform;
  format: SocialFormat;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  visualDirection: string;
  toneTags: string[];
  scriptSpoken?: string;
  onScreenText?: string;
};

export type SocialPackResult = {
  title: string;
  voiceNotes: string[];
  items: SocialPackItemInput[];
};

export const PLATFORM_FORMATS: Record<
  SocialPlatform,
  Array<{ format: SocialFormat; label: string; tableKey: string }>
> = {
  instagram: [
    { format: "feed", label: "Profile / Feed posts", tableKey: "instagram_feed" },
    { format: "story", label: "Story posts", tableKey: "instagram_story" },
    { format: "reel", label: "Reel captions & scripts", tableKey: "instagram_reel" }
  ],
  facebook: [
    { format: "page_post", label: "Page posts", tableKey: "facebook_page" },
    { format: "video_script", label: "Short video scripts", tableKey: "facebook_video" }
  ],
  tiktok: [
    { format: "caption_script", label: "Captions, on-screen text & spoken scripts", tableKey: "tiktok_script" }
  ],
  snapchat: [
    { format: "story", label: "Story snaps", tableKey: "snapchat_story" },
    { format: "spotlight", label: "Spotlight-style short scripts", tableKey: "snapchat_spotlight" }
  ]
};
