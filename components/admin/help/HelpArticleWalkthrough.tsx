"use client";

import { HelpCastWalkthrough } from "@/components/admin/help/HelpCastWalkthrough";
import { HelpPushNoticeWalkthrough } from "@/components/admin/help/HelpPushNoticeWalkthrough";
import type { HelpArticle } from "@/lib/admin/help-content";

export function HelpArticleWalkthrough({ walkthrough }: { walkthrough: NonNullable<HelpArticle["walkthrough"]> }) {
  if (walkthrough === "marketing-cast") return <HelpCastWalkthrough variant="marketing" />;
  if (walkthrough === "push-notices") return <HelpPushNoticeWalkthrough />;
  return null;
}
