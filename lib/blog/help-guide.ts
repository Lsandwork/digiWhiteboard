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

/** Pro Tips copy aligned to the approved mockup (sidebar panel). */
export const BLOG_HELP_PRO_TIPS = [
  "Start with the AI Topic Generator for the best results",
  "Always review and personalize key sections",
  "Include local LA relevancy when it adds value",
  "Use real photos from our media library when possible",
  "Schedule content consistently for maximum impact"
] as const;

export const BLOG_HELP_OVERVIEW = {
  title: "What is the Fitdog Blog Generator?",
  body:
    "The Blog Generator is your all-in-one AI-powered content engine that helps you create, manage and publish expert dog-care content for the Fitdog blog. It combines approved Fitdog knowledge, SEO best practices and the Fitdog brand voice to produce detailed articles that inform, engage and attract dog owners to Fitdog services.",
  why:
    "Consistent, high-quality content builds trust with dog owners, improves search visibility, and connects readers with Fitdog services when the advice naturally leads there. Every article should provide useful guidance first."
} as const;

export const BLOG_HELP_FEATURES = [
  {
    title: "AI-Powered Content Creation",
    description: "Generate detailed, helpful articles in minutes.",
    href: BLOG_HELP_LINKS.generator,
    tone: "blue" as const,
    event: "help.feature_generator"
  },
  {
    title: "SEO Optimized",
    description: "Rank higher in search and reach more dog owners.",
    href: BLOG_HELP_LINKS.editorial,
    tone: "blue" as const,
    event: "help.feature_seo"
  },
  {
    title: "Full Editorial Workflow",
    description: "From idea to published article in one place.",
    href: BLOG_HELP_LINKS.dashboard,
    tone: "purple" as const,
    event: "help.feature_pipeline"
  },
  {
    title: "Real Performance Insights",
    description: "See what resonates and keep improving.",
    href: BLOG_HELP_LINKS.analytics,
    tone: "green" as const,
    event: "help.feature_analytics"
  }
] as const;

export const BLOG_HELP_ASSETS = {
  heroComposite: "/assets/fitdog/blog-help/hero-composite.png",
  heroDog: "/assets/fitdog/social-moments/posters/social-moment-05.jpg",
  dashboardFixture: "/assets/fitdog/blog-help/dashboard-fixture.png",
  topicsFixture: "/assets/fitdog/blog-help/topics-fixture.png",
  generateFixture: "/assets/fitdog/blog-help/generate-fixture.png",
  reviewFixture: "/assets/fitdog/blog-help/review-fixture.png"
} as const;

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
