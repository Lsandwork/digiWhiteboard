import { BLOG_APP_PATH } from "@/lib/blog/constants";
import { FITDOG_BLOG_ORANGE, FITDOG_BLOG_LOGO } from "@/lib/blog/brand";

export const BLOG_HELP_GUIDE_PATH = "/admin/blog/help/how-to-use-blog-generator";

export const BLOG_HELP_SUPPORT_HREF = "/admin?board=staff&tab=help";
export const BLOG_HELP_SUPPORT_EMAIL = "Lonnie@fitdog.com";

export const BLOG_HELP_ORANGE = FITDOG_BLOG_ORANGE;
export const BLOG_HELP_LOGO = FITDOG_BLOG_LOGO;

export type BlogHelpStepId =
  | "overview"
  | "topics"
  | "create"
  | "review"
  | "publish"
  | "performance"
  | "best-practices";

export type BlogHelpStep = {
  id: BlogHelpStepId;
  number: number;
  navLabel: string;
  badge: string;
  title: string;
};

export const BLOG_HELP_STEPS: BlogHelpStep[] = [
  { id: "overview", number: 1, navLabel: "Overview", badge: "STEP 1", title: "Overview" },
  { id: "topics", number: 2, navLabel: "Generate Topic Ideas", badge: "STEP 2", title: "Generate Topic Ideas" },
  { id: "create", number: 3, navLabel: "Create Blog Articles", badge: "STEP 3", title: "Create Blog Articles" },
  { id: "review", number: 4, navLabel: "Review & Approve", badge: "STEP 4", title: "Review & Approve" },
  { id: "publish", number: 5, navLabel: "Schedule & Publish", badge: "STEP 5", title: "Schedule & Publish" },
  { id: "performance", number: 6, navLabel: "Monitor Performance", badge: "STEP 6", title: "Monitor Performance" },
  { id: "best-practices", number: 7, navLabel: "Best Practices", badge: "STEP 7", title: "Best Practices" }
];

export const BLOG_HELP_LINKS = {
  dashboard: `${BLOG_APP_PATH}?page=overview`,
  generator: `${BLOG_APP_PATH}?page=generate`,
  articles: `${BLOG_APP_PATH}?page=articles`,
  calendar: `${BLOG_APP_PATH}?page=calendar`,
  analytics: `${BLOG_APP_PATH}?page=analytics`,
  settings: `${BLOG_APP_PATH}?page=settings`,
  topics: `${BLOG_APP_PATH}?page=topics`,
  drafts: `${BLOG_APP_PATH}?page=drafts`,
  needsReview: `${BLOG_APP_PATH}?page=human-review`,
  scheduled: `${BLOG_APP_PATH}?page=scheduled`,
  media: `${BLOG_APP_PATH}?page=media`,
  setup: `${BLOG_APP_PATH}?page=setup`,
  editorial: `${BLOG_APP_PATH}?page=editorial`,
  help: BLOG_HELP_GUIDE_PATH,
  publicBlog: "/blog"
} as const;

export const BLOG_HELP_PRO_TIPS = [
  "Start with Topic Ideas for strong, specific topics, then score and save them.",
  "Review and personalize important sections before approval — never approve on completeness alone.",
  "Include local Los Angeles or Santa Monica relevance only when it adds real value.",
  "Use approved real photos from the Fitdog Media Library whenever possible.",
  "Schedule useful content consistently rather than publishing low-quality articles too often.",
  "Verify all health, safety, legal, and nutrition claims before approval.",
  "Make sure every article gives the reader practical advice first.",
  "Avoid forcing Fitdog promotions into unrelated topics."
] as const;

export const BLOG_HELP_ASSETS = {
  heroDog: "/assets/fitdog/social-moments/posters/social-moment-05.jpg",
  dashboardFixture: "/assets/fitdog/blog-help/dashboard-fixture.png",
  topicsFixture: "/assets/fitdog/blog-help/topics-fixture.png",
  generateFixture: "/assets/fitdog/blog-help/generate-fixture.png",
  reviewFixture: "/assets/fitdog/blog-help/review-fixture.png"
} as const;

/** Tutorial video from env or blog_settings.provider_config.help_tutorial_video_url */
export function resolveBlogTutorialVideo(providerConfig?: Record<string, unknown> | null) {
  const fromEnv = process.env.NEXT_PUBLIC_BLOG_TUTORIAL_VIDEO_URL?.trim() || process.env.BLOG_TUTORIAL_VIDEO_URL?.trim();
  if (fromEnv) return fromEnv;
  const fromSettings = providerConfig?.help_tutorial_video_url;
  if (typeof fromSettings === "string" && fromSettings.trim()) return fromSettings.trim();
  return null;
}

export function blogHelpSectionHref(stepId: BlogHelpStepId) {
  return `${BLOG_HELP_GUIDE_PATH}#${stepId}`;
}
