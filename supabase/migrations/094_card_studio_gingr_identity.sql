-- Card Studio: persist Gingr identity used at print time for audit / reprints.
alter table public.card_studio_cards
  add column if not exists gingr_owner_id text,
  add column if not exists barcode_source text,
  add column if not exists barcode_value text,
  add column if not exists barcode_symbology text;

create index if not exists card_studio_cards_gingr_owner_idx
  on public.card_studio_cards (gingr_owner_id)
  where gingr_owner_id is not null;

create index if not exists card_studio_cards_barcode_value_idx
  on public.card_studio_cards (barcode_value)
  where barcode_value is not null;
