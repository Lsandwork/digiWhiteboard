-- Stricter same-day dedupe: trainer + client + dog + class + date (amount ignored).
-- Soft-archive existing doubles, then replace the unique index.

drop index if exists public.package_commission_records_same_day_dedupe_idx;

with ranked as (
  select
    id,
    row_number() over (
      partition by
        lower(trim(coalesce(trainer_name, ''))),
        lower(trim(coalesce(client_name, ''))),
        lower(trim(coalesce(dog_name, ''))),
        lower(trim(coalesce(package_or_class, ''))),
        sale_date
      order by
        case when payment_status = 'paid' then 0 else 1 end,
        case when approval_status = 'approved' then 0 else 1 end,
        case when approval_status = 'rejected' or review_status = 'rejected' then 2 else 0 end,
        created_at asc nulls last,
        id asc
    ) as rn
  from public.package_commission_records
  where archived_at is null
    and sale_date is not null
    and coalesce(trim(client_name), '') <> ''
    and coalesce(trim(dog_name), '') <> ''
    and coalesce(trim(package_or_class), '') <> ''
)
update public.package_commission_records r
set
  archived_at = now(),
  is_possible_duplicate = true,
  internal_notes = trim(
    both E'\n' from concat_ws(
      E'\n',
      nullif(trim(coalesce(r.internal_notes, '')), ''),
      'Archived as duplicate same name/date/class entry (migration 052).'
    )
  ),
  updated_at = now()
from ranked
where r.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists package_commission_records_name_date_class_dedupe_idx
  on public.package_commission_records (
    lower(trim(coalesce(trainer_name, ''))),
    lower(trim(coalesce(client_name, ''))),
    lower(trim(coalesce(dog_name, ''))),
    lower(trim(coalesce(package_or_class, ''))),
    sale_date
  )
  where archived_at is null
    and sale_date is not null
    and coalesce(trim(client_name), '') <> ''
    and coalesce(trim(dog_name), '') <> ''
    and coalesce(trim(package_or_class), '') <> '';

comment on index public.package_commission_records_name_date_class_dedupe_idx is
  'Prevents duplicate active commission rows for the same trainer/name/date/class.';
