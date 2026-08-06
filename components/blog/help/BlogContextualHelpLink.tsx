"use client";

import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { blogHelpSectionHref, type BlogHelpStepId } from "@/lib/blog/help-guide";

export function BlogContextualHelpLink({
  step,
  label = "Learn how"
}: {
  step: BlogHelpStepId;
  label?: string;
}) {
  return (
    <Link
      href={blogHelpSectionHref(step)}
      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--fitdog-orange,#ff6f26)] hover:underline"
      onClick={() => {
        void fetch("/api/blog/help/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "help.contextual_link", details: { step } })
        });
      }}
    >
      <HelpCircle className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Link>
  );
}
