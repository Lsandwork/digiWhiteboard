-- Allow Fitdog in-app PAYMENT ERROR alerts (card update / charge failures from app.fitdog.com).

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
    'PAYMENT_ERROR',
    'OUTSTANDING_BALANCE',
    'PAYMENT_RESOLVED',
    'FITDOG_SYNC_ERROR',
    'FITDOG_NOTIFICATION'
  ));
