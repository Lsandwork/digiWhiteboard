-- Management write-up reports for dog handler owner complaints (stored in admin_settings.settings.management_reports at runtime).

CREATE TABLE IF NOT EXISTS management_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type TEXT NOT NULL,
  title TEXT NOT NULL,
  dog_handler_name TEXT,
  summary TEXT,
  source TEXT NOT NULL DEFAULT 'push_notice',
  status TEXT NOT NULL DEFAULT 'Needs Review',
  visibility TEXT NOT NULL DEFAULT 'admin_management',
  push_notice_id TEXT,
  related_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_management_reports_created_at ON management_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_management_reports_type ON management_reports (report_type);
