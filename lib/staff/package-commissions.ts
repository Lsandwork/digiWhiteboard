type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type PackageCommissionStatus = "Pending" | "Approved" | "Paid" | "Needs Review" | "Disputed";

export type PackageCommissionComment = {
  id: string;
  author: string;
  body: string;
  created_at: string;
  concern_type?: string | null;
};

export type PackageCommissionRow = {
  id: string;
  dog_name: string;
  owner_name: string;
  trainer_user_id: string | null;
  trainer_name: string;
  trainer_email: string | null;
  package_type: string;
  gingr_transaction_url: string;
  commission_amount: string;
  sold_at: string;
  status: PackageCommissionStatus;
  notes: string | null;
  created_by: string | null;
  comments: PackageCommissionComment[];
  created_at: string;
  updated_at: string;
};

export type PackageCommissionInput = {
  dog_name?: unknown;
  owner_name?: unknown;
  trainer_name?: unknown;
  trainer_email?: unknown;
  trainer_user_id?: unknown;
  package_type?: unknown;
  gingr_transaction_url?: unknown;
  commission_amount?: unknown;
  sold_at?: unknown;
  status?: unknown;
  notes?: unknown;
  created_by?: unknown;
};

const SETTINGS_STORE_KEY = "package_commissions";

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[<>&"'`/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeUrl(value: unknown) {
  const raw = String(value ?? "").trim().slice(0, 500);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.startsWith("www.") ? `https://${raw}` : raw;
}

type PackageCommissionState = { rows: PackageCommissionRow[] };

async function loadState(supabase: SupabaseClient): Promise<PackageCommissionState> {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) return { rows: [] };
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const raw = settings[SETTINGS_STORE_KEY];
  if (!raw || typeof raw !== "object") return { rows: [] };
  const rows = Array.isArray((raw as { rows?: unknown }).rows)
    ? ((raw as { rows: PackageCommissionRow[] }).rows)
    : [];
  return { rows };
}

async function saveState(supabase: SupabaseClient, state: PackageCommissionState) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) throw new Error("Unable to save package commissions.");
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_STORE_KEY]: state
  };
  const { error: upsertError } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings, updated_at: new Date().toISOString() });
  if (upsertError) throw new Error("Unable to save package commissions.");
}

function sortRows(rows: PackageCommissionRow[]) {
  return [...rows].sort((a, b) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime());
}

function normalizeInput(input: PackageCommissionInput) {
  const dog_name = sanitizeText(input.dog_name, 80);
  const owner_name = sanitizeText(input.owner_name, 80);
  const trainer_name = sanitizeText(input.trainer_name, 80) || "Unassigned";
  const trainer_email = sanitizeText(input.trainer_email, 120) || null;
  const trainer_user_id = sanitizeText(input.trainer_user_id, 120) || null;
  const package_type = sanitizeText(input.package_type, 120);
  const gingr_transaction_url = sanitizeUrl(input.gingr_transaction_url);
  const commission_amount = sanitizeText(input.commission_amount, 40);
  const sold_at = sanitizeText(input.sold_at, 40);
  const statusRaw = sanitizeText(input.status, 40);
  const status = (["Pending", "Approved", "Paid", "Needs Review", "Disputed"] as const).includes(statusRaw as PackageCommissionStatus)
    ? (statusRaw as PackageCommissionStatus)
    : "Pending";
  const notes = sanitizeText(input.notes, 800) || null;
  const created_by = sanitizeText(input.created_by, 120) || null;

  if (!dog_name) throw new Error("Dog name is required.");
  if (!owner_name) throw new Error("Owner name is required.");
  if (!package_type) throw new Error("Package type is required.");
  if (!commission_amount) throw new Error("Commission amount is required.");
  if (!sold_at) throw new Error("Date sold is required.");

  return { dog_name, owner_name, trainer_name, trainer_email, trainer_user_id, package_type, gingr_transaction_url, commission_amount, sold_at, status, notes, created_by };
}

function normalizeRow(row: PackageCommissionRow): PackageCommissionRow {
  return {
    ...row,
    trainer_user_id: row.trainer_user_id ?? null,
    trainer_name: row.trainer_name ?? "Unassigned",
    trainer_email: row.trainer_email ?? null,
    status: row.status ?? "Pending",
    notes: row.notes ?? null,
    created_by: row.created_by ?? null,
    comments: row.comments ?? []
  };
}

export async function listPackageCommissions(supabase: SupabaseClient) {
  const state = await loadState(supabase);
  return sortRows(state.rows.map(normalizeRow));
}

export async function createPackageCommissionRow(supabase: SupabaseClient, input: PackageCommissionInput) {
  const normalized = normalizeInput(input);
  const now = new Date().toISOString();
  const row: PackageCommissionRow = {
    id: newId("pkg"),
    ...normalized,
    comments: [],
    created_at: now,
    updated_at: now
  };
  const state = await loadState(supabase);
  await saveState(supabase, { rows: sortRows([row, ...state.rows]) });
  return row;
}

export async function updatePackageCommissionRow(
  supabase: SupabaseClient,
  id: string,
  input: PackageCommissionInput
) {
  const normalized = normalizeInput(input);
  const now = new Date().toISOString();
  const state = await loadState(supabase);
  let updated: PackageCommissionRow | null = null;
  const next = state.rows.map((row) => {
    if (row.id !== id) return row;
    updated = { ...row, ...normalized, updated_at: now };
    return updated;
  });
  if (!updated) throw new Error("Package commission row not found.");
  await saveState(supabase, { rows: sortRows(next) });
  return updated;
}

export async function deletePackageCommissionRow(supabase: SupabaseClient, id: string) {
  const state = await loadState(supabase);
  const next = state.rows.filter((row) => row.id !== id);
  if (next.length === state.rows.length) throw new Error("Package commission row not found.");
  await saveState(supabase, { rows: next });
}

export async function addPackageCommissionComment(
  supabase: SupabaseClient,
  rowId: string,
  author: string,
  body: string
): Promise<{ row: PackageCommissionRow; comment: PackageCommissionComment }> {
  const trimmed = sanitizeText(body, 800);
  if (!trimmed) throw new Error("Comment is required.");

  const now = new Date().toISOString();
  const comment: PackageCommissionComment = {
    id: newId("pkg-comment"),
    author: sanitizeText(author, 120) || "Trainer",
    body: trimmed,
    created_at: now
  };

  const state = await loadState(supabase);
  let updated: PackageCommissionRow | undefined;
  const next = state.rows.map((row) => {
    if (row.id !== rowId) return row;
    updated = { ...row, comments: [...row.comments, comment], updated_at: now };
    return updated;
  });
  if (!updated) throw new Error("Package commission row not found.");
  await saveState(supabase, { rows: next });
  return { row: updated, comment };
}

export function parsePackageCommissionCsv(text: string): PackageCommissionInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
  const hasHeader = header.some((cell) => cell.includes("dog") || cell.includes("owner") || cell.includes("package"));
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    const cells = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    if (hasHeader) {
      const record: Record<string, string> = {};
      header.forEach((key, index) => {
        record[key] = cells[index] ?? "";
      });
      return {
        dog_name: record.dog_name ?? record.dog ?? record["dog name"] ?? "",
        owner_name: record.owner_name ?? record.owner ?? record["owner name"] ?? "",
        trainer_name: record.trainer_name ?? record.trainer ?? "",
        trainer_email: record.trainer_email ?? "",
        package_type: record.package_type ?? record.package ?? record["package type"] ?? "",
        gingr_transaction_url: record.gingr_transaction_url ?? record.gingr_transaction_link ?? record.gingr_url ?? record.url ?? record.link ?? "",
        commission_amount: record.commission_amount ?? record.commission ?? "",
        sold_at: record.sold_at ?? record.date_package_sold ?? record.date ?? record["date sold"] ?? "",
        status: record.status ?? "Pending",
        notes: record.notes ?? ""
      };
    }
    return {
      dog_name: cells[0] ?? "",
      owner_name: cells[1] ?? "",
      package_type: cells[2] ?? "",
      gingr_transaction_url: cells[3] ?? "",
      commission_amount: cells[4] ?? "",
      sold_at: cells[5] ?? ""
    };
  });
}

export async function importPackageCommissionCsv(supabase: SupabaseClient, text: string) {
  const parsed = parsePackageCommissionCsv(text);
  if (!parsed.length) throw new Error("No rows found in CSV.");
  const created: PackageCommissionRow[] = [];
  for (const input of parsed) {
    created.push(await createPackageCommissionRow(supabase, input));
  }
  return created;
}

export function exportPackageCommissionsCsv(rows: PackageCommissionRow[]) {
  const header = "dog_name,owner_name,trainer_name,trainer_email,package_type,gingr_transaction_link,commission_amount,date_package_sold,status,notes";
  const body = rows.map((row) =>
    [
      row.dog_name,
      row.owner_name,
      row.trainer_name,
      row.trainer_email ?? "",
      row.package_type,
      row.gingr_transaction_url,
      row.commission_amount,
      row.sold_at,
      row.status,
      row.notes ?? ""
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...body].join("\n");
}
