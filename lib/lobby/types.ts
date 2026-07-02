export type LobbyCheckoutDog = {
  id: string;
  gingr_animal_id: string | null;
  dog_name: string;
  breed: string | null;
  dog_photo_url: string | null;
  checkout_status: string;
  prompted_at: string | null;
  estimated_ready_at: string | null;
  display_until: string | null;
};

export type LobbyPromotion = {
  id: string;
  title: string;
  subtitle: string | null;
  category: string | null;
  icon_key: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  sort_order: number;
};

export type LobbyEvent = {
  id: string;
  title: string;
  description: string | null;
  event_at: string | null;
  active: boolean;
  sort_order: number;
};

export type LobbySettings = {
  max_queue_count: number;
  refresh_interval_ms: number;
  show_promotions: boolean;
  show_events: boolean;
  footer_message: string | null;
  lobby_message: string | null;
};

export type LobbyCheckoutsResponse = {
  featured: LobbyCheckoutDog | null;
  queue: LobbyCheckoutDog[];
  counts: { active: number; queue: number };
  last_updated: string;
  error?: string;
};

export type LobbyStatusResponse = {
  healthy: boolean;
  active_checkout_count: number;
  last_successful_sync_at: string | null;
  data_source: "supabase_live_transition_dogs";
  refresh_interval_ms: number;
};
