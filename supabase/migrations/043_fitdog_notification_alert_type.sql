-- Allow Fitdog in-app notification feed alerts (cancellations, vaccinations, docs, etc.).

alter table public.operations_alerts
  drop constraint if exists operations_alerts_alert_type_check;

alter table public.operations_alerts
  add constraint operations_alerts_alert_type_check
  check (alert_type in (
    'PAYMENT_FAILED',
    'PAYMENT_MISSED',
    'CARD_DECLINED',
    'CARD_EXPIRED',
    'CARD_MISSING',
    'PAYMENT_PROCESSING_ERROR',
    'PAYMENT_RETRY_FAILED',
    'OUTSTANDING_BALANCE',
    'PAYMENT_RESOLVED',
    'FITDOG_SYNC_ERROR',
    'FITDOG_NOTIFICATION'
  ));
