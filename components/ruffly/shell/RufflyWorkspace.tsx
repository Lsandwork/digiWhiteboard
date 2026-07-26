"use client";

import type { RufflyPageId } from "@/lib/ruffly/constants";
import { RufflyOverviewPanel } from "@/components/ruffly/overview/RufflyOverviewPanel";
import { RufflyInboxPanel } from "@/components/ruffly/inbox/RufflyInboxPanel";
import { RufflyReviewsPanel } from "@/components/ruffly/reviews/RufflyReviewsPanel";
import { RufflyFeedbackPanel } from "@/components/ruffly/feedback/RufflyFeedbackPanel";
import { RufflyContactsPanel } from "@/components/ruffly/contacts/RufflyContactsPanel";
import { RufflyLeadsPanel } from "@/components/ruffly/leads/RufflyLeadsPanel";
import { RufflyCampaignsPanel } from "@/components/ruffly/campaigns/RufflyCampaignsPanel";
import { RufflyAutomationsPanel } from "@/components/ruffly/automations/RufflyAutomationsPanel";
import { RufflyWebchatPanel } from "@/components/ruffly/webchat/RufflyWebchatPanel";
import { RufflyAiReceptionistPanel } from "@/components/ruffly/ai-receptionist/RufflyAiReceptionistPanel";
import { RufflySocialPanel } from "@/components/ruffly/social/RufflySocialPanel";
import { RufflyAnalyticsPanel } from "@/components/ruffly/analytics/RufflyAnalyticsPanel";
import { RufflyKnowledgePanel } from "@/components/ruffly/knowledge/RufflyKnowledgePanel";
import { RufflyIntegrationsPanel } from "@/components/ruffly/integrations/RufflyIntegrationsPanel";
import { RufflySettingsPanel } from "@/components/ruffly/settings/RufflySettingsPanel";

type Flags = {
  enabled: boolean;
  webchat: boolean;
  ai: boolean;
  voice: boolean;
  campaigns: boolean;
  automations: boolean;
};

export function RufflyWorkspace({ page, flags }: { page: RufflyPageId; flags: Flags }) {
  switch (page) {
    case "overview":
      return <RufflyOverviewPanel />;
    case "inbox":
      return <RufflyInboxPanel />;
    case "reviews":
      return <RufflyReviewsPanel />;
    case "feedback":
      return <RufflyFeedbackPanel />;
    case "contacts":
      return <RufflyContactsPanel />;
    case "leads":
      return <RufflyLeadsPanel />;
    case "campaigns":
      return <RufflyCampaignsPanel enabled={flags.campaigns} />;
    case "automations":
      return <RufflyAutomationsPanel enabled={flags.automations} />;
    case "webchat":
      return <RufflyWebchatPanel enabled={flags.webchat} />;
    case "ai-receptionist":
      return <RufflyAiReceptionistPanel enabled={flags.ai || flags.voice} />;
    case "social":
      return <RufflySocialPanel />;
    case "analytics":
      return <RufflyAnalyticsPanel />;
    case "knowledge":
      return <RufflyKnowledgePanel />;
    case "integrations":
      return <RufflyIntegrationsPanel />;
    case "settings":
      return <RufflySettingsPanel />;
    default:
      return <RufflyOverviewPanel />;
  }
}
