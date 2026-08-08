-- Match VIP Auto Booking spreadsheet columns used by front desk.

alter table public.vip_auto_book_clients
  add column if not exists platform text not null default 'APP',
  add column if not exists need_to_rebook boolean not null default false,
  add column if not exists pickup_location text,
  add column if not exists dropoff_location text,
  add column if not exists days_booked_label text;

comment on column public.vip_auto_book_clients.platform is 'APP, Gingr, or Gingr / APP';
comment on column public.vip_auto_book_clients.days_booked_label is 'Display label for booked days when not a simple weekday array';
