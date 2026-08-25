-- Latest-webhook probes use ORDER BY created_at DESC LIMIT 1 (217 seq scans vs 4 idx scans).
-- My Shift / System Health also probe last_seen_from_gingr_at on live_transition_dogs.

create index if not exists gingr_webhook_events_created_at_idx
  on public.gingr_webhook_events (created_at desc);

create index if not exists live_transition_dogs_last_seen_gingr_idx
  on public.live_transition_dogs (last_seen_from_gingr_at desc nulls last)
  where last_seen_from_gingr_at is not null;
