export const RUFFLY_APP_PATH = "/ruffly";
export const RUFFLY_PUBLIC_PATH = "/ruffly/public";
export const RUFFLY_HOSTNAME = "ruffly.ruffops.com";

export const RUFFLY_NAV_PAGES = [
  { id: "overview", label: "Overview", href: "/ruffly?page=overview", permission: "ruffly.dashboard.view" },
  { id: "inbox", label: "Inbox", href: "/ruffly?page=inbox", permission: "ruffly.inbox.view" },
  { id: "reviews", label: "Reviews", href: "/ruffly?page=reviews", permission: "ruffly.reviews.view" },
  { id: "feedback", label: "Feedback", href: "/ruffly?page=feedback", permission: "ruffly.feedback.view" },
  { id: "contacts", label: "Contacts", href: "/ruffly?page=contacts", permission: "ruffly.contacts.view" },
  { id: "leads", label: "Leads", href: "/ruffly?page=leads", permission: "ruffly.leads.view" },
  { id: "campaigns", label: "Campaigns", href: "/ruffly?page=campaigns", permission: "ruffly.campaigns.view" },
  { id: "automations", label: "Automations", href: "/ruffly?page=automations", permission: "ruffly.automations.view" },
  { id: "webchat", label: "Web Chat", href: "/ruffly?page=webchat", permission: "ruffly.webchat.manage" },
  { id: "ai-receptionist", label: "AI Receptionist", href: "/ruffly?page=ai-receptionist", permission: "ruffly.ai.manage" },
  { id: "social", label: "Social", href: "/ruffly?page=social", permission: "ruffly.social.view" },
  { id: "analytics", label: "Analytics", href: "/ruffly?page=analytics", permission: "ruffly.analytics.view" },
  { id: "knowledge", label: "Knowledge Base", href: "/ruffly?page=knowledge", permission: "ruffly.knowledge.manage" },
  { id: "integrations", label: "Integrations", href: "/ruffly?page=integrations", permission: "ruffly.integrations.manage" },
  { id: "settings", label: "Ruffly Settings", href: "/ruffly?page=settings", permission: "ruffly.settings.manage" }
] as const;

export type RufflyPageId = (typeof RUFFLY_NAV_PAGES)[number]["id"];

export const RUFFLY_LEAD_STAGES = [
  "new_lead",
  "ai_responded",
  "staff_contacted",
  "needs_follow_up",
  "assessment_needed",
  "assessment_scheduled",
  "assessment_completed",
  "service_recommended",
  "awaiting_decision",
  "won",
  "lost",
  "long_term_nurture"
] as const;

export const RUFFLY_LEAD_TYPES = [
  "daycare",
  "boarding",
  "training",
  "grooming",
  "adventure_hike",
  "beach_excursion",
  "membership",
  "taxi",
  "general_inquiry",
  "partnership",
  "other"
] as const;

export const SMS_OPT_OUT_KEYWORDS = [
  "STOP",
  "UNSUBSCRIBE",
  "END",
  "QUIT",
  "STOPALL",
  "REVOKE",
  "OPTOUT",
  "CANCEL"
] as const;
