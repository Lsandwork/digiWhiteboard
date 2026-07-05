type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const SETTINGS_KEY = "write_up_pdfs";

type WriteUpPdfRecord = {
  report_id: string;
  filename: string;
  pdf_base64: string;
  generated_at: string;
  hr_tracked: true;
};

type WriteUpPdfState = {
  records: WriteUpPdfRecord[];
};

function isMissingRelation(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || Boolean(error?.message?.includes("schema cache"));
}

function emptyState(): WriteUpPdfState {
  return { records: [] };
}

function parseState(value: unknown): WriteUpPdfState {
  if (!value || typeof value !== "object") return emptyState();
  const records = Array.isArray((value as { records?: unknown }).records)
    ? ((value as { records: WriteUpPdfRecord[] }).records)
    : [];
  return { records };
}

async function loadState(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return emptyState();
    throw error;
  }
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return parseState(settings[SETTINGS_KEY]);
}

async function saveState(supabase: SupabaseClient, state: WriteUpPdfState) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return false;
    throw error;
  }
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_KEY]: state
  };
  const { error: saveError } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings, updated_at: new Date().toISOString() });
  if (saveError) {
    if (isMissingRelation(saveError)) return false;
    throw saveError;
  }
  return true;
}

export function warningNoticePdfFilename(employeeName: string, reportId: string) {
  const safeName = employeeName.trim().replace(/[^\w.-]+/g, "_").slice(0, 40) || "employee";
  return `Fitdog-Warning-Notice-${safeName}-${reportId.slice(0, 8)}.pdf`;
}

export async function saveWriteUpPdf(
  supabase: SupabaseClient,
  reportId: string,
  employeeName: string,
  pdfBytes: Uint8Array
) {
  const generated_at = new Date().toISOString();
  const record: WriteUpPdfRecord = {
    report_id: reportId,
    filename: warningNoticePdfFilename(employeeName, reportId),
    pdf_base64: Buffer.from(pdfBytes).toString("base64"),
    generated_at,
    hr_tracked: true
  };

  const state = await loadState(supabase);
  const next = state.records.filter((entry) => entry.report_id !== reportId);
  next.unshift(record);

  if (!(await saveState(supabase, { records: next.slice(0, 200) }))) {
    throw new Error("Write-up PDF storage is not available.");
  }

  return { filename: record.filename, generated_at };
}

export async function getWriteUpPdfRecord(supabase: SupabaseClient, reportId: string) {
  const state = await loadState(supabase);
  return state.records.find((entry) => entry.report_id === reportId) ?? null;
}

export async function getWriteUpPdfBytes(supabase: SupabaseClient, reportId: string) {
  const record = await getWriteUpPdfRecord(supabase, reportId);
  if (!record) return null;
  return {
    filename: record.filename,
    generated_at: record.generated_at,
    bytes: Buffer.from(record.pdf_base64, "base64")
  };
}
