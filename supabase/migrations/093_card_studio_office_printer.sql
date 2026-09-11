-- Meantime path: CR80 artwork prints through a normal office/OS printer
-- via the browser print dialog. This is OS Driver Mode, not a native ID SDK.

insert into public.card_studio_printers (
  id, name, manufacturer, model, adapter_id, connection, native_integration, serial_number, firmware, capabilities, status_code, status_message, last_seen_at
) values (
  'os-office',
  'This computer (normal printer)',
  'OS',
  'Installed system printer',
  'generic-os',
  'os',
  false,
  null,
  null,
  '{"color":true,"monochrome":true,"duplex":true,"automaticDuplex":false,"manualFlip":true,"edgeToEdge":false,"resolution":300,"uv":false,"lamination":false,"magneticStripe":false,"smartCard":false,"contactless":false,"usb":false,"ethernet":false,"wifi":false,"osDriver":true,"nativeIntegration":false}'::jsonb,
  'online',
  'OS Driver Mode — print CR80 at actual size (3.375 in × 2.125 in) through this computer’s print dialog.',
  now()
)
on conflict (id) do update set
  name = excluded.name,
  manufacturer = excluded.manufacturer,
  model = excluded.model,
  adapter_id = excluded.adapter_id,
  connection = excluded.connection,
  native_integration = excluded.native_integration,
  capabilities = excluded.capabilities,
  status_code = excluded.status_code,
  status_message = excluded.status_message,
  last_seen_at = now(),
  updated_at = now();

insert into public.card_studio_printer_profiles (printer_id, name, dpi)
select id, name || ' CR80 300 DPI', 300
from public.card_studio_printers
where id = 'os-office'
on conflict do nothing;
