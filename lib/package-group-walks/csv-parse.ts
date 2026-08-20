/**
 * Parse Gingr Outstanding Packages Report CSV.
 *
 * Expected shape:
 *   Row 1: Outstanding Packages Report
 *   Row 2: Owner, Package Type, Location, Number remaining, Expires at,
 *          Purchased At, Expiration email sent[, trailing empty]
 */

export const OUTSTANDING_PACKAGES_REQUIRED_HEADERS = [
  "owner",
  "package type",
  "location",
  "number remaining",
  "expires at",
  "purchased at"
] as const;

export type OutstandingPackageCsvRow = {
  ownerDisplayName: string;
  packageType: string;
  location: string;
  numberRemainingRaw: string;
  expiresAtRaw: string;
  purchasedAtRaw: string;
};

export type OutstandingPackageCsvParseResult =
  | { ok: true; title: string | null; rows: OutstandingPackageCsvRow[]; totalRows: number }
  | { ok: false; error: string };

function normalizeHeader(value: string): string {
  return value.replace(/^\ufeff/, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** RFC4180-ish CSV split that keeps quoted commas and ignores a trailing empty column. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  while (cells.length && cells[cells.length - 1]!.trim() === "") cells.pop();
  return cells.map((cell) => cell.trim());
}

export function parseOutstandingPackagesCsv(text: string): OutstandingPackageCsvParseResult {
  const raw = String(text ?? "").replace(/^\ufeff/, "");
  if (!raw.trim()) {
    return { ok: false, error: "The CSV file is empty." };
  }

  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, error: "The CSV is missing a header row." };
  }

  let title: string | null = null;
  let headerIndex = 0;
  const firstCells = splitCsvLine(lines[0] ?? "");
  const firstJoined = firstCells.map(normalizeHeader).join(" ");
  if (firstCells.length <= 2 && !OUTSTANDING_PACKAGES_REQUIRED_HEADERS.every((header) => firstJoined.includes(header))) {
    title = firstCells[0]?.trim() || null;
    headerIndex = 1;
  }

  const headerLine = lines[headerIndex];
  if (!headerLine) {
    return { ok: false, error: "The CSV is missing a header row." };
  }

  const headers = splitCsvLine(headerLine).map(normalizeHeader);
  const missing = OUTSTANDING_PACKAGES_REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) {
    return {
      ok: false,
      error: `Required columns missing: ${missing.join(", ")}. Expected Owner, Package Type, Location, Number remaining, Expires at, Purchased At.`
    };
  }

  const indexOf = (name: string) => headers.indexOf(name);
  const ownerIdx = indexOf("owner");
  const typeIdx = indexOf("package type");
  const locationIdx = indexOf("location");
  const remainingIdx = indexOf("number remaining");
  const expiresIdx = indexOf("expires at");
  const purchasedIdx = indexOf("purchased at");

  const rows: OutstandingPackageCsvRow[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = splitCsvLine(line);
    if (!cells.some((cell) => cell.length > 0)) continue;
    rows.push({
      ownerDisplayName: cells[ownerIdx] ?? "",
      packageType: cells[typeIdx] ?? "",
      location: cells[locationIdx] ?? "",
      numberRemainingRaw: cells[remainingIdx] ?? "",
      expiresAtRaw: cells[expiresIdx] ?? "",
      purchasedAtRaw: cells[purchasedIdx] ?? ""
    });
  }

  return { ok: true, title, rows, totalRows: rows.length };
}
