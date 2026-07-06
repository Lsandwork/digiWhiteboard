type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type HrConsultMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  report_id?: string | null;
};

export type HrConsultThread = {
  messages: HrConsultMessage[];
  updated_at: string;
};

const SETTINGS_KEY = "hr_consult_threads";

function newMessageId() {
  return `hr-msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function threadKey(email: string) {
  return email.trim().toLowerCase() || "anonymous";
}

async function loadThreadsRaw(supabase: SupabaseClient): Promise<Record<string, HrConsultThread>> {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) return {};
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const raw = settings[SETTINGS_KEY];
  if (!raw || typeof raw !== "object") return {};
  return raw as Record<string, HrConsultThread>;
}

async function saveThreadsRaw(supabase: SupabaseClient, threads: Record<string, HrConsultThread>) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) throw error;
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_KEY]: threads
  };
  const { error: saveError } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings, updated_at: new Date().toISOString() });
  if (saveError) throw saveError;
}

export async function loadHrConsultThread(supabase: SupabaseClient, email: string) {
  const threads = await loadThreadsRaw(supabase);
  return threads[threadKey(email)] ?? { messages: [], updated_at: new Date().toISOString() };
}

export async function appendHrConsultMessages(
  supabase: SupabaseClient,
  email: string,
  entries: Array<{ role: "user" | "assistant"; content: string; report_id?: string | null }>
) {
  const threads = await loadThreadsRaw(supabase);
  const key = threadKey(email);
  const current = threads[key] ?? { messages: [], updated_at: new Date().toISOString() };
  const now = new Date().toISOString();
  const nextMessages = [
    ...current.messages,
    ...entries.map((entry) => ({
      id: newMessageId(),
      role: entry.role,
      content: entry.content,
      created_at: now,
      report_id: entry.report_id ?? null
    }))
  ].slice(-80);

  threads[key] = { messages: nextMessages, updated_at: now };
  await saveThreadsRaw(supabase, threads);
  return threads[key];
}

export async function clearHrConsultThread(supabase: SupabaseClient, email: string) {
  const threads = await loadThreadsRaw(supabase);
  delete threads[threadKey(email)];
  await saveThreadsRaw(supabase, threads);
}
