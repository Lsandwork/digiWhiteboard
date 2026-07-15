/** Shared Gingr invoice + legacy Fitdog commission CSV parsing (no DB writes). */

export type PackageCommissionCsvInput = {
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
};

export type PackageCommissionTrainerOption = {
  id: string;
  full_name: string;
  email: string;
};

export type ParsePackageCommissionCsvOptions = {
  trainers?: PackageCommissionTrainerOption[];
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
  input: PackageCommissionCsvInput,
  trainers: PackageCommissionTrainerOption[] | undefined
): PackageCommissionCsvInput {
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
): PackageCommissionCsvInput | null {
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

function mapLegacyNamedRow(cells: string[], headerKeys: string[]): PackageCommissionCsvInput {
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

function mapLegacyPositionalRow(cells: string[]): PackageCommissionCsvInput {
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
): PackageCommissionCsvInput[] {
  const outputs: PackageCommissionCsvInput[] = [];
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
): PackageCommissionCsvInput[] {
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
): PackageCommissionCsvInput[] {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];

  const hasInvoiceHeader = rows.some((cells) => isInvoiceHeader(cells));
  if (hasInvoiceHeader) {
    return parseInvoiceCommissionCsv(rows, options.trainers);
  }
  return parseLegacyCommissionCsv(rows, options.trainers);
}
