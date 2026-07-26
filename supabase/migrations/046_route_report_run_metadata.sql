-- Persist structured pull metadata (skipped non-route occurrences, taxi imports, warnings).
alter table public.route_report_runs
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.route_report_runs.metadata is
  'Structured pull metadata: warnings[], skippedOccurrences[], gingrTaxi[], manualAdds[].';
