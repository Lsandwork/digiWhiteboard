-- Soft-archive Ivonne Campuzano rejected duplicate commission rows
-- (same trainer/client/dog/package/sale_date/amount), keeping a preferred twin.

with ivonne as (
  select
    id,
    approval_status,
    review_status,
    created_at,
    row_number() over (
      partition by
        lower(trim(coalesce(trainer_name, ''))),
        lower(trim(coalesce(client_name, ''))),
        lower(trim(coalesce(dog_name, ''))),
        lower(trim(coalesce(package_or_class, ''))),
        sale_date,
        final_commission_cents
      order by
        case
          when approval_status = 'rejected' or review_status = 'rejected' then 1
          else 0
        end,
        created_at asc nulls last,
        id asc
    ) as rn,
    count(*) over (
      partition by
        lower(trim(coalesce(trainer_name, ''))),
        lower(trim(coalesce(client_name, ''))),
        lower(trim(coalesce(dog_name, ''))),
        lower(trim(coalesce(package_or_class, ''))),
        sale_date,
        final_commission_cents
    ) as grp_size
  from public.package_commission_records
  where archived_at is null
    and lower(coalesce(trainer_name, '')) like '%ivonne%'
)
update public.package_commission_records r
set
  archived_at = now(),
  is_possible_duplicate = true,
  internal_notes = trim(
    both E'\n' from concat_ws(
      E'\n',
      nullif(trim(coalesce(r.internal_notes, '')), ''),
      'Removed as rejected duplicate entry (migration 051).'
    )
  ),
  updated_at = now()
from ivonne
where r.id = ivonne.id
  and ivonne.grp_size > 1
  and ivonne.rn > 1
  and (ivonne.approval_status = 'rejected' or ivonne.review_status = 'rejected');
