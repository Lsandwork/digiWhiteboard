export type YardLinkFeed = {
  title: string;
  videoId: string;
  fallbackUrl: string;
  description: string;
};

export const YARD_LINK_FEEDS: readonly YardLinkFeed[] = [
  {
    title: "Big Side",
    videoId: "wK0m06yoW4Q",
    fallbackUrl: "https://www.youtube.com/watch?v=wK0m06yoW4Q",
    description: "Live yard camera link"
  },
  {
    title: "Small Side",
    videoId: "o5rwgL1BKeQ",
    fallbackUrl: "https://www.youtube.com/live/o5rwgL1BKeQ",
    description: "Live yard camera link"
  }
] as const;
