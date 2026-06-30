export type DisplayStatus = "checking_in" | "checking_out" | "removed";

export type LiveDog = {
  id: string;
  gingr_reservation_id: string | null;
  gingr_animal_id: string | null;
  animal_name: string;
  owner_name: string | null;
  photo_url: string | null;
  reservation_type: string | null;
  current_status: string;
  display_status: DisplayStatus;
  room: string | null;
  notes: string | null;
  flags: Record<string, boolean | string | number | null>;
  status_started_at: string | null;
  completed_at: string | null;
  last_seen_from_gingr_at: string | null;
  raw_payload?: Record<string, unknown> | null;
  hidden: boolean;
  updated_at: string;
};

export type LiveBoardResponse = {
  checking_in: LiveDog[];
  checking_out: LiveDog[];
  counts: {
    checking_in: number;
    checking_out: number;
    total: number;
  };
  last_updated: string;
};

export type WebhookEvent = {
  id: string;
  webhook_type: string | null;
  entity_id: string | null;
  entity_type: string | null;
  verified: boolean;
  processed: boolean;
  processing_error: string | null;
  created_at: string;
};
