do $$
begin
  alter publication supabase_realtime add table public.live_transition_dogs;
exception
  when duplicate_object then
    null;
end $$;
