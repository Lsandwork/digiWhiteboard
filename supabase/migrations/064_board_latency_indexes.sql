-- Indexes for the board hot path. Every one of these queries runs on the
-- 1-2 second display poll or on every Gingr webhook, so they must stay fast as
-- live_transition_dogs and gingr_webhook_events grow over months of use.

-- Active board rows are ordered newest-first under a row limit. Partial on
-- hidden = false because the active set stays tiny while the table grows.
create index if not exists live_transition_dogs_active_started_idx
  on public.live_transition_dogs (status_started_at desc)
  where hidden = false;

-- Retirement guard reads only rows hidden in the last few minutes, so Gingr's
-- back-of-house feed cannot re-add a dog the board already took down.
create index if not exists live_transition_dogs_retired_updated_idx
  on public.live_transition_dogs (updated_at desc)
  where hidden = true;

-- Webhook dedupe runs before a dog reaches the board. Without this it degrades
-- into a scan of every webhook Gingr has ever sent.
create index if not exists gingr_webhook_events_entity_recent_idx
  on public.gingr_webhook_events (entity_id, webhook_type, created_at desc);
