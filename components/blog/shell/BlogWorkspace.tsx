"use client";

import type { UserAccess } from "@/lib/admin/permissions";
import type { BlogPageId } from "@/lib/blog/constants";
import { BlogOverviewPanel } from "@/components/blog/panels/BlogOverviewPanel";
import { BlogTopicsPanel } from "@/components/blog/panels/BlogTopicsPanel";
import { BlogGeneratePanel } from "@/components/blog/panels/BlogGeneratePanel";
import { BlogArticlesPanel } from "@/components/blog/panels/BlogArticlesPanel";
import { BlogEditorPanel } from "@/components/blog/panels/BlogEditorPanel";
import { BlogSettingsPanel } from "@/components/blog/panels/BlogSettingsPanel";
import { BlogProvidersPanel } from "@/components/blog/panels/BlogProvidersPanel";
import { BlogKnowledgePanel } from "@/components/blog/panels/BlogKnowledgePanel";
import { BlogMediaPanel } from "@/components/blog/panels/BlogMediaPanel";
import { BlogSetupWizardPanel } from "@/components/blog/panels/BlogSetupWizardPanel";
import { BlogGenericPanel } from "@/components/blog/panels/BlogGenericPanel";

type Props = {
  page: BlogPageId;
  articleId: string | null;
  role: string;
  access: UserAccess;
};

export function BlogWorkspace({ page, articleId }: Props) {
  if (page === "editor" || articleId) {
    return <BlogEditorPanel articleId={articleId} />;
  }

  switch (page) {
    case "overview":
      return <BlogOverviewPanel />;
    case "topics":
      return <BlogTopicsPanel />;
    case "generate":
      return <BlogGeneratePanel />;
    case "drafts":
      return <BlogArticlesPanel title="Drafts & in progress" statuses="DRAFTING,EDITING,PRACTICAL_REVIEW,EMPATHY_REVIEW,NATURAL_VOICE_REVIEW,SEO_REVIEW,NEEDS_CHANGES,IMAGE_SELECTION,IMAGE_REVIEW,FACT_CHECK,BRAND_REVIEW" />;
    case "human-review":
      return <BlogArticlesPanel title="Human Review" statuses="HUMAN_REVIEW" />;
    case "needs-approval":
      return <BlogArticlesPanel title="Needs Approval" statuses="HUMAN_REVIEW,FACT_CHECK,IMAGE_REVIEW" />;
    case "scheduled":
      return <BlogArticlesPanel title="Scheduled" statuses="SCHEDULED,APPROVED" />;
    case "published":
      return <BlogArticlesPanel title="Published" statuses="PUBLISHED" />;
    case "failed":
      return <BlogArticlesPanel title="Failed" statuses="FAILED" />;
    case "archived":
      return <BlogArticlesPanel title="Archived" statuses="ARCHIVED" />;
    case "calendar":
      return <BlogArticlesPanel title="Content Calendar" statuses="APPROVED,SCHEDULED,PUBLISHED" />;
    case "knowledge":
      return <BlogKnowledgePanel />;
    case "media":
    case "image-approvals":
      return <BlogMediaPanel approvalsOnly={page === "image-approvals"} />;
    case "providers":
      return <BlogProvidersPanel />;
    case "settings":
    case "editorial":
    case "automation":
    case "brand-voice":
    case "publishing":
      return <BlogSettingsPanel focus={page} />;
    case "setup":
      return <BlogSetupWizardPanel />;
    case "pillars":
      return <BlogGenericPanel title="Content Pillars" endpoint="/api/blog/pillars" listKey="pillars" />;
    case "audit":
      return <BlogGenericPanel title="Audit Log" endpoint="/api/blog/audit" listKey="logs" />;
    case "briefs":
      return (
        <BlogGenericPanel
          title="Content Briefs"
          description="Briefs are created automatically when you generate an article from an approved topic."
          endpoint="/api/blog/topics"
          listKey="topics"
        />
      );
    case "research":
    case "sources":
      return (
        <BlogGenericPanel
          title="Research & Sources"
          description="Research sources attach to topics and articles. Never invent studies, quotes, or statistics."
          endpoint="/api/blog/topics"
          listKey="topics"
        />
      );
    case "analytics":
    case "costs":
      return (
        <BlogOverviewPanel />
      );
    default:
      return <BlogOverviewPanel />;
  }
}
