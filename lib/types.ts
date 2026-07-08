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
  display_until: string | null;
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
  error?: string;
  basket_filtered?: boolean;
  debug?: {
    endpoint?: string;
    raw_record_count?: number;
    checking_in_count?: number;
    checking_out_count?: number;
    expired_checkin_count?: number;
    expired_checkout_count?: number;
    raw_checking_out_candidates?: number;
    prompted_checkout_count?: number;
    scheduled_only_checkout_count?: number;
    filtered_unprompted_checkout_count?: number;
    visible_checking_out_count?: number;
    expired_checking_out_count?: number;
    supabase_checkout_rows?: number;
    supabase_prompted_checkout_rows?: number;
    supabase_filtered_unprompted_checkout_rows?: number;
    filtered_checkout_reasons?: Array<Record<string, string | null>>;
    gingr_sync?: Record<string, unknown>;
    gingr_error?: string | null;
    mode: "webhook_only" | "gingr_live" | "fast_internal";
    data_source?: string;
    request_duration_ms?: number;
    fetch_completed_at?: string;
    used_cached_gingr?: boolean;
    newest_checkout_event_at?: string | null;
    recommended_env?: string[];
    missing_env?: string[];
    env?: Record<string, boolean>;
  };
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
