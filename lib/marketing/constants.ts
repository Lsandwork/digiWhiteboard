export type MarketingRequestType =
  | "photo_session"
  | "video_session"
  | "social_media"
  | "campaign_content"
  | "before_after"
  | "other";

export type MarketingDestination =
  | "photo_box"
  | "grooming_area"
  | "lobby"
  | "training_room"
  | "custom";

export type MarketingRequestPriority = "standard" | "time_sensitive" | "urgent";

export type MarketingRequestStatus =
  | "awaiting_handler"
  | "handler_acknowledged"
  | "dog_being_retrieved"
  | "dog_ready"
  | "in_session"
  | "completed"
  | "delayed"
  | "unavailable"
  | "canceled";

export type MarketingStaffAction =
  | "acknowledge"
  | "dog_being_retrieved"
  | "dog_ready"
  | "delay_5_minutes"
  | "dog_unavailable"
  | "contact_marketing";

export type MarketingMarketingAction = "edit" | "cancel" | "resend" | "mark_in_session" | "complete";

export type MarketingCampaignStatus =
  | "planning"
  | "collecting_content"
  | "editing"
  | "ready_for_approval"
  | "approved"
  | "published"
  | "archived";

export type MarketingCalendarEventType =
  | "photo_session"
  | "video_session"
  | "campaign_deadline"
  | "content_collection"
  | "editing_deadline"
  | "publication";

export type MarketingUploadBatchStatus =
  | "draft"
  | "uploading"
  | "processing"
  | "completed"
  | "failed"
  | "canceled";

export type MarketingDogAssignmentType = "single" | "multiple" | "group" | "facility" | "unmatched";

export const MARKETING_REQUEST_TYPE_LABELS: Record<MarketingRequestType, string> = {
  photo_session: "Photo Session",
  video_session: "Video Session",
  social_media: "Social Media Content",
  campaign_content: "Campaign Content",
  before_after: "Before & After",
  other: "Other"
};

export const MARKETING_DESTINATION_LABELS: Record<MarketingDestination, string> = {
  photo_box: "Photo Box",
  grooming_area: "Grooming Area",
  lobby: "Lobby",
  training_room: "Training Room",
  custom: "Custom Location"
};

export const MARKETING_PRIORITY_LABELS: Record<MarketingRequestPriority, string> = {
  standard: "Standard",
  time_sensitive: "Time-sensitive",
  urgent: "Urgent"
};

export const MARKETING_CAMPAIGN_STATUS_LABELS: Record<MarketingCampaignStatus, string> = {
  planning: "Planning",
  collecting_content: "Collecting Content",
  editing: "Editing",
  ready_for_approval: "Ready for Approval",
  approved: "Approved",
  published: "Published",
  archived: "Archived"
};

export const MARKETING_CALENDAR_EVENT_LABELS: Record<MarketingCalendarEventType, string> = {
  photo_session: "Photo Session",
  video_session: "Video Session",
  campaign_deadline: "Campaign Deadline",
  content_collection: "Content Collection",
  editing_deadline: "Editing Deadline",
  publication: "Publication Date"
};

export const MARKETING_ROUTES = {
  dashboard: "/marketing",
  mediaPush: "/marketing/media-push",
  requests: "/marketing/requests",
  upload: "/marketing/upload",
  storage: "/marketing/storage",
  campaigns: "/marketing/campaigns",
  calendar: "/marketing/calendar",
  notifications: "/marketing/notifications",
  history: "/marketing/history",
  settings: "/marketing/settings"
} as const;

export type MarketingRouteKey = keyof typeof MARKETING_ROUTES;
