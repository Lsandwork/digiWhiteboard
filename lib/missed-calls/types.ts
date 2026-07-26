export type MissedCallType = "missed_call" | "voicemail" | "other";
export type MissedCallStatus = "new" | "listened" | "archived";

export type MissedCall = {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  source: string;
  call_type: MissedCallType;
  from_number: string | null;
  from_name: string | null;
  to_number: string | null;
  subject: string;
  snippet: string;
  body_text: string;
  body_html: string;
  received_at: string;
  voicemail_url: string | null;
  voicemail_storage_path: string | null;
  voicemail_content_type: string | null;
  voicemail_filename: string | null;
  voicemail_byte_size: number | null;
  status: MissedCallStatus;
  listened_at: string | null;
  listened_by: string | null;
  raw: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MissedCallSyncRun = {
  id: string;
  trigger: "cron" | "manual";
  status: "running" | "completed" | "failed" | "skipped";
  started_at: string;
  finished_at: string | null;
  messages_scanned: number;
  calls_created: number;
  calls_updated: number;
  error_count: number;
  message: string | null;
  error_details: string | null;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
};

export type MissedCallSummary = {
  new_count: number;
  voicemail_count: number;
  listened_count: number;
  total_count: number;
};
