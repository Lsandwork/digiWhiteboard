"use client";

import type { UserAccess } from "@/lib/admin/permissions";
import type { BlogPageId } from "@/lib/blog/constants";
import { BlogDashboardPanel } from "@/components/blog/dashboard/BlogDashboardPanel";
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
import { BlogUnavailablePanel } from "@/components/blog/panels/BlogUnavailablePanel";

type Props = {
  page: BlogPageId;
  articleId: string | null;
  role: string;
  access: UserAccess;
  canCreate?: boolean;
  canSubmitIdea?: boolean;
  onDashboardCounts?: (counts: Record<string, number>) => void;
};

export function BlogWorkspace({
  page,
  articleId,
  canCreate = false,
  canSubmitIdea = false,
  onDashboardCounts
}: Props) {
  if (page === "editor" || articleId) {
    return <BlogEditorPanel articleId={articleId} />;
  }

  switch (page) {
    case "overview":
      return (
        <BlogDashboardPanel
          canCreate={canCreate}
          canSubmitIdea={canSubmitIdea}
          onCounts={onDashboardCounts}
        />
      );
    case "topics":
      return <BlogTopicsPanel />;
    case "generate":
      return <BlogGeneratePanel />;
    case "articles":
      return (
        <BlogArticlesPanel
          title="All Articles"
          statuses="DRAFTING,EDITING,PRACTICAL_REVIEW,EMPATHY_REVIEW,NATURAL_VOICE_REVIEW,SEO_REVIEW,NEEDS_CHANGES,IMAGE_SELECTION,IMAGE_REVIEW,FACT_CHECK,BRAND_REVIEW,HUMAN_REVIEW,APPROVED,SCHEDULED,PUBLISHED,FAILED,ARCHIVED"
        />
      );
    case "drafts":
      return (
        <BlogArticlesPanel
          title="Drafts"
          statuses="DRAFTING,EDITING,PRACTICAL_REVIEW,EMPATHY_REVIEW,NATURAL_VOICE_REVIEW,SEO_REVIEW,NEEDS_CHANGES,IMAGE_SELECTION,IMAGE_REVIEW,FACT_CHECK,BRAND_REVIEW,BRIEF_READY,RESEARCHING,OUTLINING"
        />
      );
    case "human-review":
      return <BlogArticlesPanel title="Needs Review" statuses="HUMAN_REVIEW" />;
    case "needs-approval":
    case "approved":
      return <BlogArticlesPanel title="Approved" statuses="APPROVED" />;
    case "scheduled":
      return <BlogArticlesPanel title="Scheduled" statuses="SCHEDULED" />;
    case "published":
      return <BlogArticlesPanel title="Published" statuses="PUBLISHED" />;
    case "failed":
      return <BlogArticlesPanel title="Failed" statuses="FAILED" />;
    case "archived":
      return <BlogArticlesPanel title="Archived" statuses="ARCHIVED" />;
    case "calendar":
      return <BlogArticlesPanel title="Content Calendar" statuses="APPROVED,SCHEDULED,DRAFTING,HUMAN_REVIEW" />;
    case "categories":
      return <BlogGenericPanel title="Categories" endpoint="/api/blog/taxonomy?type=categories" listKey="items" />;
    case "tags":
      return <BlogGenericPanel title="Tags" endpoint="/api/blog/taxonomy?type=tags" listKey="items" />;
    case "authors":
      return <BlogGenericPanel title="Authors" endpoint="/api/blog/taxonomy?type=authors" listKey="items" />;
    case "newsletter":
      return <BlogGenericPanel title="Newsletter Subscribers" endpoint="/api/blog/newsletter" listKey="subscribers" />;
    case "promotions":
      return <BlogGenericPanel title="Promotions" endpoint="/api/blog/promotions" listKey="promotions" />;
    case "knowledge":
      return <BlogKnowledgePanel />;
    case "media":
    case "image-approvals":
      return <BlogMediaPanel approvalsOnly={page === "image-approvals"} />;
    case "providers":
    case "agents":
      return <BlogProvidersPanel />;
    case "settings":
    case "editorial":
    case "automation":
    case "brand-voice":
    case "publishing":
      return <BlogSettingsPanel focus={page === "automation" ? "automation" : page} />;
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
        <BlogDashboardPanel
          canCreate={canCreate}
          canSubmitIdea={canSubmitIdea}
          onCounts={onDashboardCounts}
        />
      );
    case "search-console":
      return (
        <BlogUnavailablePanel
          title="Search Console"
          reason="Google Search Console is not connected to RuffOps yet."
          actionLabel="Open Blog Settings"
          actionHref="/admin/automatic-blog?page=settings"
        />
      );
    default:
      return (
        <BlogDashboardPanel
          canCreate={canCreate}
          canSubmitIdea={canSubmitIdea}
          onCounts={onDashboardCounts}
        />
      );
  }
}
