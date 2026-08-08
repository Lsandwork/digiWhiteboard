-- Track when Need to Re-Book was set to Yes, and when the 2-week reminder fired.

alter table public.vip_auto_book_clients
  add column if not exists need_to_rebook_set_at timestamptz,
  add column if not exists rebook_alert_sent_at timestamptz;

-- Start the 14-day clock for rows already marked Yes.
update public.vip_auto_book_clients
set need_to_rebook_set_at = coalesce(need_to_rebook_set_at, updated_at, now())
where need_to_rebook = true
  and need_to_rebook_set_at is null;

create index if not exists vip_auto_book_clients_rebook_due_idx
  on public.vip_auto_book_clients (need_to_rebook, need_to_rebook_set_at)
  where need_to_rebook = true;
