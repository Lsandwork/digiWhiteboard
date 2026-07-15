type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type PackageCommissionStatus = "Pending" | "Approved" | "Paid" | "Needs Review" | "Disputed";
export type PackageCommissionSaleCategory = "package" | "class";
export type PackageCommissionMode = "amount" | "percent";

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
  sale_category: PackageCommissionSaleCategory;
  package_type: string;
  gingr_transaction_url: string;
  /** Total price of the package/class sold (used for percent commissions). */
  package_sale_amount: string | null;
  /** Trainer commission payout — always stored as the final dollar amount. */
  commission_amount: string;
  /** Optional percent of package_sale_amount that produced commission_amount. */
  commission_percent: string | null;
  commission_mode: PackageCommissionMode;
  sold_at: string;
  status: PackageCommissionStatus;
  notes: string | null;
  created_by: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  confirmed_by_user_id: string | null;
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
  sale_category?: unknown;
  package_type?: unknown;
  gingr_transaction_url?: unknown;
  package_sale_amount?: unknown;
  commission_amount?: unknown;
  commission_percent?: unknown;
  commission_mode?: unknown;
  sold_at?: unknown;
  status?: unknown;
  notes?: unknown;
  created_by?: unknown;
};

export type PackageCommissionActor = {
  email?: string | null;
  adminUserId?: string | null;
  name?: string | null;
};

export type PackageCommissionViewer = {
  role?: string | null;
  email?: string | null;
  adminUserId?: string | null;
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

function normalizeSaleCategory(value: unknown): PackageCommissionSaleCategory {
  const token = sanitizeText(value, 20).toLowerCase();
  return token === "class" ? "class" : "package";
}

function normalizeCommissionMode(value: unknown): PackageCommissionMode {
  const token = sanitizeText(value, 20).toLowerCase();
  return token === "percent" || token === "percentage" || token === "%" ? "percent" : "amount";
}

/** Strip currency noise → number (empty / invalid → 0). */
export function parseCommissionAmount(value: string) {
  const cleaned = String(value ?? "").replace(/[^0-9.\-]/g, "");
  if (!cleaned) return 0;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCommissionCurrency(amount: number) {
  if (!Number.isFinite(amount)) return "$0.00";
  return `$${amount.toFixed(2)}`;
}

/** Compute trainer commission dollars from package sale total × percent. */
export function calculatePercentCommission(saleTotal: string | null | undefined, percent: string | null | undefined) {
  const sale = parseCommissionAmount(String(saleTotal ?? ""));
  const pct = parseCommissionAmount(String(percent ?? ""));
  if (sale <= 0 || pct < 0) return null;
  return Math.round(sale * (pct / 100) * 100) / 100;
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
  const sale_category = normalizeSaleCategory(input.sale_category);
  const package_type = sanitizeText(input.package_type, 120);
  const gingr_transaction_url = sanitizeUrl(input.gingr_transaction_url);
  const commission_mode = normalizeCommissionMode(input.commission_mode);
  const package_sale_amount_raw = sanitizeText(input.package_sale_amount, 40);
  const commission_percent_raw = sanitizeText(input.commission_percent, 20);
  let commission_amount = sanitizeText(input.commission_amount, 40);
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
  if (!sold_at) throw new Error("Date sold is required.");

  let package_sale_amount: string | null = package_sale_amount_raw || null;
  let commission_percent: string | null = commission_percent_raw || null;

  if (commission_mode === "percent") {
    if (!package_sale_amount_raw) throw new Error("Package / class sale total is required for percentage commissions.");
    if (!commission_percent_raw) throw new Error("Commission percentage is required.");
    const sale = parseCommissionAmount(package_sale_amount_raw);
    const pct = parseCommissionAmount(commission_percent_raw);
    if (sale <= 0) throw new Error("Package / class sale total must be greater than zero.");
    if (pct < 0 || pct > 100) throw new Error("Commission percentage must be between 0 and 100.");
    const computed = calculatePercentCommission(package_sale_amount_raw, commission_percent_raw);
    if (computed == null) throw new Error("Unable to calculate commission from percentage.");
    commission_amount = formatCommissionCurrency(computed);
    package_sale_amount = formatCommissionCurrency(sale);
    commission_percent = String(pct);
  } else {
    if (!commission_amount) throw new Error("Commission amount is required.");
    // Keep optional sale total / percent if provided for context, otherwise clear percent-only noise.
    if (package_sale_amount_raw) {
      const sale = parseCommissionAmount(package_sale_amount_raw);
      package_sale_amount = sale > 0 ? formatCommissionCurrency(sale) : package_sale_amount_raw;
    }
    if (!commission_percent_raw) commission_percent = null;
  }

  return {
    dog_name,
    owner_name,
    trainer_name,
    trainer_email,
    trainer_user_id,
    sale_category,
    package_type,
    gingr_transaction_url,
    package_sale_amount,
    commission_amount,
    commission_percent,
    commission_mode,
    sold_at,
    status,
    notes,
    created_by
  };
}

export function normalizePackageCommissionRow(row: PackageCommissionRow): PackageCommissionRow {
  return {
    ...row,
    trainer_user_id: row.trainer_user_id ?? null,
    trainer_name: row.trainer_name ?? "Unassigned",
    trainer_email: row.trainer_email ?? null,
    sale_category: normalizeSaleCategory(row.sale_category),
    package_sale_amount: row.package_sale_amount ?? null,
    commission_percent: row.commission_percent ?? null,
    commission_mode: normalizeCommissionMode(row.commission_mode ?? (row.commission_percent ? "percent" : "amount")),
    status: row.status ?? "Pending",
    notes: row.notes ?? null,
    created_by: row.created_by ?? null,
    confirmed_at: row.confirmed_at ?? null,
    confirmed_by: row.confirmed_by ?? null,
    confirmed_by_user_id: row.confirmed_by_user_id ?? null,
    comments: row.comments ?? []
  };
}

function actorLabel(actor: PackageCommissionActor) {
  return sanitizeText(actor.name, 120) || sanitizeText(actor.email, 120) || sanitizeText(actor.adminUserId, 120) || "admin";
}

export function filterPackageCommissionsForViewer(rows: PackageCommissionRow[], viewer: PackageCommissionViewer) {
  if (viewer.role !== "trainer") return rows;

  const email = viewer.email?.trim().toLowerCase() ?? "";
  const userId = viewer.adminUserId?.trim() ?? "";

  return rows.filter((row) => {
    if (userId && row.trainer_user_id === userId) return true;
    if (email && row.trainer_email?.trim().toLowerCase() === email) return true;
    return false;
  });
}

export function trainerOwnsCommissionRow(row: PackageCommissionRow, viewer: PackageCommissionViewer) {
  if (viewer.role !== "trainer") return true;
  const email = viewer.email?.trim().toLowerCase() ?? "";
  const userId = viewer.adminUserId?.trim() ?? "";
  if (userId && row.trainer_user_id === userId) return true;
  if (email && row.trainer_email?.trim().toLowerCase() === email) return true;
  return false;
}

export async function listPackageCommissions(supabase: SupabaseClient) {
  const state = await loadState(supabase);
  return sortRows(state.rows.map(normalizePackageCommissionRow));
}

export async function listPackageCommissionsForViewer(supabase: SupabaseClient, viewer: PackageCommissionViewer) {
  const rows = await listPackageCommissions(supabase);
  return filterPackageCommissionsForViewer(rows, viewer);
}

export async function createPackageCommissionRow(supabase: SupabaseClient, input: PackageCommissionInput) {
  const normalized = normalizeInput(input);
  const now = new Date().toISOString();
  const row: PackageCommissionRow = {
    id: newId("pkg"),
    ...normalized,
    confirmed_at: null,
    confirmed_by: null,
    confirmed_by_user_id: null,
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
): Promise<PackageCommissionRow> {
  const normalized = normalizeInput(input);
  const now = new Date().toISOString();
  const state = await loadState(supabase);
  let updated: PackageCommissionRow | null = null;
  const next = state.rows.map((row) => {
    if (row.id !== id) return row;
    const nextRow = normalizePackageCommissionRow({
      ...row,
      ...normalized,
      updated_at: now
    });
    updated = nextRow;
    return nextRow;
  });
  if (!updated) throw new Error("Package commission row not found.");
  await saveState(supabase, { rows: sortRows(next) });
  return updated;
}

export async function confirmPackageCommissionRow(
  supabase: SupabaseClient,
  id: string,
  actor: PackageCommissionActor
): Promise<PackageCommissionRow> {
  const now = new Date().toISOString();
  const state = await loadState(supabase);
  let updated: PackageCommissionRow | null = null;
  const next = state.rows.map((row) => {
    if (row.id !== id) return row;
    const nextRow = normalizePackageCommissionRow({
      ...row,
      status: "Approved",
      confirmed_at: now,
      confirmed_by: actorLabel(actor),
      confirmed_by_user_id: actor.adminUserId ?? null,
      updated_at: now
    });
    updated = nextRow;
    return nextRow;
  });
  if (!updated) throw new Error("Package commission row not found.");
  await saveState(supabase, { rows: sortRows(next) });
  return updated;
}

export async function setPackageCommissionStatus(
  supabase: SupabaseClient,
  id: string,
  status: PackageCommissionStatus,
  actor: PackageCommissionActor
): Promise<PackageCommissionRow> {
  const now = new Date().toISOString();
  const state = await loadState(supabase);
  let updated: PackageCommissionRow | null = null;
  const next = state.rows.map((row) => {
    if (row.id !== id) return row;
    const confirmed =
      status === "Approved"
        ? {
            confirmed_at: row.confirmed_at ?? now,
            confirmed_by: row.confirmed_by ?? actorLabel(actor),
            confirmed_by_user_id: row.confirmed_by_user_id ?? actor.adminUserId ?? null
          }
        : {
            confirmed_at: row.confirmed_at,
            confirmed_by: row.confirmed_by,
            confirmed_by_user_id: row.confirmed_by_user_id
          };
    const nextRow = normalizePackageCommissionRow({
      ...row,
      status,
      ...confirmed,
      updated_at: now
    });
    updated = nextRow;
    return nextRow;
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
  body: string,
  options: { concern_type?: string | null } = {}
): Promise<{ row: PackageCommissionRow; comment: PackageCommissionComment }> {
  const trimmed = sanitizeText(body, 800);
  if (!trimmed) throw new Error("Comment is required.");

  const now = new Date().toISOString();
  const concernType = sanitizeText(options.concern_type, 40) || null;
  const comment: PackageCommissionComment = {
    id: newId("pkg-comment"),
    author: sanitizeText(author, 120) || "Trainer",
    body: trimmed,
    created_at: now,
    concern_type: concernType
  };

  const state = await loadState(supabase);
  let updated: PackageCommissionRow | undefined;
  const next = state.rows.map((row) => {
    if (row.id !== rowId) return row;
    const nextStatus =
      concernType === "dispute" && row.status !== "Paid" ? ("Needs Review" as PackageCommissionStatus) : row.status;
    updated = normalizePackageCommissionRow({
      ...row,
      status: nextStatus,
      comments: [...row.comments, comment],
      updated_at: now
    });
    return updated;
  });
  if (!updated) throw new Error("Package commission row not found.");
  await saveState(supabase, { rows: next });
  return { row: updated, comment };
}

export type PackageCommissionTrainerOption = {
  id: string;
  full_name: string;
  email: string;
};

export type ParsePackageCommissionCsvOptions = {
  trainers?: PackageCommissionTrainerOption[];
};

export type PackageCommissionCsvImportError = {
  line: number;
  message: string;
};

export type PackageCommissionCsvImportResult = {
  created: PackageCommissionRow[];
  errors: PackageCommissionCsvImportError[];
};

/** Split a CSV line into fields, preserving commas inside quotes. */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

/** Parse full CSV text into rows of cells (blank lines dropped). */
export function parseCsvRows(text: string): string[][] {
  return String(text ?? "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvLine);
}

function normalizeTrainerKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchTrainerByName(
  name: string,
  trainers: PackageCommissionTrainerOption[] | undefined
): PackageCommissionTrainerOption | null {
  const needle = normalizeTrainerKey(name);
  if (!needle || !trainers?.length) return null;
  const exact = trainers.find((trainer) => normalizeTrainerKey(trainer.full_name) === needle);
  if (exact) return exact;
  // Soft fallback: unique substring match (e.g. "Amanda Nguyen" vs "Amanda Smith Nguyen")
  const partial = trainers.filter((trainer) => {
    const key = normalizeTrainerKey(trainer.full_name);
    return key.includes(needle) || needle.includes(key);
  });
  return partial.length === 1 ? partial[0] : null;
}

function applyTrainerMatch(
  input: PackageCommissionInput,
  trainers: PackageCommissionTrainerOption[] | undefined
): PackageCommissionInput {
  const name = String(input.trainer_name ?? "").trim();
  if (!name || input.trainer_user_id) return input;
  const matched = matchTrainerByName(name, trainers);
  if (!matched) return input;
  return {
    ...input,
    trainer_name: matched.full_name,
    trainer_email: matched.email,
    trainer_user_id: matched.id
  };
}

function normalizeHeaderKey(cell: string) {
  return cell
    .toLowerCase()
    .replace(/\$/g, "")
    .replace(/%/g, "")
    .replace(/['’]/g, "")
    .replace(/[()]/g, " ")
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isInvoiceHeader(cells: string[]) {
  const keys = cells.map(normalizeHeaderKey);
  const hasOwner = keys.some((key) => key.includes("owner"));
  const hasDog = keys.some((key) => key.includes("dog"));
  const hasClassProgram = keys.some(
    (key) => key === "class program" || key.includes("class program") || key === "class/program"
  );
  const hasShare = keys.some((key) => key.includes("trainer share") || key === "share");
  const hasSales = keys.some((key) => key === "sales");
  // Gingr invoice exports use Class/Program + Sales + Trainer Share — not Fitdog's package_type export.
  return Boolean(hasOwner && hasDog && (hasShare || (hasClassProgram && hasSales)));
}

function isLegacyHeader(cells: string[]) {
  const keys = cells.map(normalizeHeaderKey);
  return keys.some(
    (key) =>
      key.includes("dog") ||
      key.includes("owner") ||
      key.includes("package") ||
      key === "trainer name" ||
      key === "trainer"
  );
}

function isTotalDueRow(cells: string[]) {
  const first = normalizeHeaderKey(cells[0] ?? "");
  return first.startsWith("total due") || first === "total";
}

function looksLikeDateCell(value: string) {
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value.trim()) || /^\d{4}-\d{2}-\d{2}/.test(value.trim());
}

function findHeaderIndex(keys: string[], predicates: Array<(key: string) => boolean>) {
  return keys.findIndex((key) => predicates.some((predicate) => predicate(key)));
}

function mapInvoiceDataRow(
  cells: string[],
  headerKeys: string[],
  trainerName: string
): PackageCommissionInput | null {
  if (isTotalDueRow(cells)) return null;
  if (!cells.some((cell) => cell.trim())) return null;

  const dateIdx = findHeaderIndex(headerKeys, [(key) => key === "date" || key.includes("date")]);
  const ownerIdx = findHeaderIndex(headerKeys, [
    (key) => key === "owners name" || key === "owner name" || key === "owner"
  ]);
  const dogIdx = findHeaderIndex(headerKeys, [(key) => key === "dogs name" || key === "dog name" || key === "dog"]);
  const classIdx = findHeaderIndex(headerKeys, [
    (key) => key.includes("class") || key.includes("program") || key === "package type" || key === "package"
  ]);
  const salesIdx = findHeaderIndex(headerKeys, [(key) => key === "sales" || key.includes("sales")]);
  const percentIdx = findHeaderIndex(headerKeys, [
    (key) => key.includes("trainer commission") || key === "commission" || key.includes("percent")
  ]);
  const shareIdx = findHeaderIndex(headerKeys, [
    (key) => key.includes("trainer share") || key === "share" || key.includes("trainer payout")
  ]);

  const soldAt = (dateIdx >= 0 ? cells[dateIdx] : cells[0]) ?? "";
  if (!looksLikeDateCell(soldAt) && !String(cells[0] ?? "").trim()) return null;
  // Skip non-data rows accidentally under a header (e.g. another trainer name with commas uncommon)
  if (!looksLikeDateCell(soldAt)) return null;

  const dog_name = (dogIdx >= 0 ? cells[dogIdx] : "") ?? "";
  const owner_name = (ownerIdx >= 0 ? cells[ownerIdx] : "") ?? "";
  const package_type = (classIdx >= 0 ? cells[classIdx] : "") ?? "";
  const package_sale_amount = (salesIdx >= 0 ? cells[salesIdx] : "") ?? "";
  const commission_percent = (percentIdx >= 0 ? cells[percentIdx] : "") ?? "";
  const commission_amount = (shareIdx >= 0 ? cells[shareIdx] : "") ?? "";

  if (!dog_name && !owner_name && !package_type && !commission_amount) return null;

  // Invoice already computed Trainer Share — import as amount mode (supports $0.00).
  return {
    dog_name,
    owner_name,
    trainer_name: trainerName || "Unassigned",
    sale_category: "class",
    package_type,
    package_sale_amount,
    commission_mode: "amount",
    commission_percent: commission_percent.replace(/%/g, "").trim(),
    commission_amount: commission_amount || "$0.00",
    sold_at: soldAt,
    status: "Pending",
    notes: ""
  };
}

function mapLegacyNamedRow(cells: string[], headerKeys: string[]): PackageCommissionInput {
  const record: Record<string, string> = {};
  headerKeys.forEach((key, index) => {
    record[key] = cells[index] ?? "";
  });
  const pick = (...aliases: string[]) => {
    for (const alias of aliases) {
      const value = record[alias];
      if (value != null && String(value).trim()) return value;
    }
    return "";
  };

  return {
    dog_name: pick("dog name", "dog_name", "dog"),
    owner_name: pick("owner name", "owner_name", "owner", "owners name"),
    trainer_name: pick("trainer name", "trainer_name", "trainer"),
    trainer_email: pick("trainer email", "trainer_email"),
    trainer_user_id: pick("trainer user id", "trainer_user_id"),
    sale_category: pick("sale category", "sale_category", "category", "type") || "package",
    package_type: pick("package type", "package_type", "package", "class program", "class/program"),
    package_sale_amount: pick("package sale amount", "package_sale_amount", "sale total", "sales"),
    commission_mode: pick("commission mode", "commission_mode", "mode"),
    commission_percent: pick("commission percent", "commission_percent", "percent", "percentage", "trainer commission"),
    gingr_transaction_url: pick(
      "gingr transaction url",
      "gingr_transaction_url",
      "gingr transaction link",
      "gingr_transaction_link",
      "gingr url",
      "gingr_url",
      "url",
      "link"
    ),
    commission_amount: pick("commission amount", "commission_amount", "commission", "trainer share"),
    sold_at: pick("sold at", "sold_at", "date package sold", "date_package_sold", "date", "date sold"),
    status: pick("status") || "Pending",
    notes: pick("notes")
  };
}

function mapLegacyPositionalRow(cells: string[]): PackageCommissionInput {
  return {
    dog_name: cells[0] ?? "",
    owner_name: cells[1] ?? "",
    package_type: cells[2] ?? "",
    gingr_transaction_url: cells[3] ?? "",
    commission_amount: cells[4] ?? "",
    sold_at: cells[5] ?? ""
  };
}

function parseInvoiceCommissionCsv(
  rows: string[][],
  trainers: PackageCommissionTrainerOption[] | undefined
): PackageCommissionInput[] {
  const outputs: PackageCommissionInput[] = [];
  let currentTrainer = "";
  let headerKeys: string[] | null = null;

  for (const cells of rows) {
    if (isTotalDueRow(cells)) continue;

    if (isInvoiceHeader(cells)) {
      headerKeys = cells.map(normalizeHeaderKey);
      continue;
    }

    // Trainer section title: single cell / no date-looking first cell and very few columns
    const nonEmpty = cells.filter((cell) => cell.trim());
    if (
      !headerKeys &&
      nonEmpty.length === 1 &&
      !looksLikeDateCell(nonEmpty[0]) &&
      !isLegacyHeader(cells)
    ) {
      currentTrainer = nonEmpty[0];
      continue;
    }
    if (
      headerKeys &&
      nonEmpty.length === 1 &&
      !looksLikeDateCell(nonEmpty[0]) &&
      !isInvoiceHeader(cells)
    ) {
      // Next trainer section before a new header, or after Total Due
      currentTrainer = nonEmpty[0];
      headerKeys = null;
      continue;
    }

    if (!headerKeys) continue;
    const mapped = mapInvoiceDataRow(cells, headerKeys, currentTrainer);
    if (!mapped) continue;
    outputs.push(applyTrainerMatch(mapped, trainers));
  }

  return outputs;
}

function parseLegacyCommissionCsv(
  rows: string[][],
  trainers: PackageCommissionTrainerOption[] | undefined
): PackageCommissionInput[] {
  if (!rows.length) return [];
  const first = rows[0];
  const headerKeys = first.map(normalizeHeaderKey);
  const hasHeader = isLegacyHeader(first);
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .filter((cells) => !isTotalDueRow(cells) && cells.some((cell) => cell.trim()))
    .map((cells) => {
      const mapped = hasHeader ? mapLegacyNamedRow(cells, headerKeys) : mapLegacyPositionalRow(cells);
      return applyTrainerMatch(mapped, trainers);
    });
}

/**
 * Parse Fitdog package-commission CSV or Gingr trainers invoice export.
 * Invoice format: trainer name line → header → data rows → "Total Due".
 */
export function parsePackageCommissionCsv(
  text: string,
  options: ParsePackageCommissionCsvOptions = {}
): PackageCommissionInput[] {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];

  const hasInvoiceHeader = rows.some((cells) => isInvoiceHeader(cells));
  if (hasInvoiceHeader) {
    return parseInvoiceCommissionCsv(rows, options.trainers);
  }
  return parseLegacyCommissionCsv(rows, options.trainers);
}

export async function importPackageCommissionCsv(
  supabase: SupabaseClient,
  text: string,
  options: ParsePackageCommissionCsvOptions = {}
): Promise<PackageCommissionCsvImportResult> {
  const parsed = parsePackageCommissionCsv(text, options);
  if (!parsed.length) throw new Error("No rows found in CSV.");

  const created: PackageCommissionRow[] = [];
  const errors: PackageCommissionCsvImportError[] = [];

  for (let index = 0; index < parsed.length; index += 1) {
    const input = parsed[index];
    try {
      created.push(await createPackageCommissionRow(supabase, input));
    } catch (error) {
      errors.push({
        line: index + 1,
        message: error instanceof Error ? error.message : "Unable to import row."
      });
    }
  }

  if (!created.length && errors.length) {
    throw new Error(errors[0]?.message || "Unable to import CSV rows.");
  }

  return { created, errors };
}

export function exportPackageCommissionsCsv(rows: PackageCommissionRow[]) {
  const header =
    "dog_name,owner_name,trainer_name,trainer_email,sale_category,package_type,package_sale_amount,commission_mode,commission_percent,gingr_transaction_link,commission_amount,date_package_sold,status,notes,confirmed_at,confirmed_by";
  const body = rows.map((row) =>
    [
      row.dog_name,
      row.owner_name,
      row.trainer_name,
      row.trainer_email ?? "",
      row.sale_category,
      row.package_type,
      row.package_sale_amount ?? "",
      row.commission_mode ?? "amount",
      row.commission_percent ?? "",
      row.gingr_transaction_url,
      row.commission_amount,
      row.sold_at,
      row.status,
      row.notes ?? "",
      row.confirmed_at ?? "",
      row.confirmed_by ?? ""
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...body].join("\n");
}

export function summarizeCommissionRows(rows: PackageCommissionRow[]) {
  const totals = {
    pending: 0,
    approved: 0,
    paid: 0,
    needsReview: 0,
    disputed: 0
  };

  for (const row of rows) {
    const amount = parseCommissionAmount(row.commission_amount);
    if (row.status === "Pending") totals.pending += amount;
    else if (row.status === "Approved") totals.approved += amount;
    else if (row.status === "Paid") totals.paid += amount;
    else if (row.status === "Needs Review") totals.needsReview += amount;
    else if (row.status === "Disputed") totals.disputed += amount;
  }

  return totals;
}
