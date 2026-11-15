/** CSV is produced by the existing exporter. PDF and Excel are rendered from the same rows. */

function xml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pdfText(value: string) {
  const folded = value
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...");
  let out = "";
  for (const ch of folded) {
    const code = ch.codePointAt(0) ?? 63;
    if (code === 40 || code === 41 || code === 92) out += `\\${ch}`;
    else if (code >= 32 && code <= 126) out += ch;
    else if (code >= 160 && code <= 255) out += `\\${code.toString(8).padStart(3, "0")}`;
    else out += "?";
  }
  return out;
}

function wrap(text: string, width: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [""];
  const lines: string[] = [];
  let rest = clean;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(" ", width);
    if (cut < 24) cut = width;
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  lines.push(rest);
  return lines;
}

function pagesOf(lines: string[], size = 46) {
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += size) pages.push(lines.slice(index, index + size));
  return pages.length ? pages : [[""]];
}

export function toSpreadsheetMl(title: string, header: string[], rows: unknown[][]) {
  const sheet = xml(title).replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Report";
  const renderRow = (cells: unknown[]) =>
    `<Row>${cells
      .map((cell) => {
        if (typeof cell === "number" && Number.isFinite(cell)) {
          return `<Cell><Data ss:Type="Number">${cell}</Data></Cell>`;
        }
        return `<Cell><Data ss:Type="String">${xml(cell)}</Data></Cell>`;
      })
      .join("")}</Row>`;
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${sheet}"><Table>
${renderRow(header)}
${rows.map((row) => renderRow(row)).join("\n")}
</Table></Worksheet></Workbook>`;
}

export function toPdf(title: string, header: string[], rows: unknown[][]): Uint8Array {
  const capped = rows.slice(0, 400);
  const lines = [title, "Engagement activity is not a job-performance evaluation.", header.join("  |  ")];
  for (const row of capped) {
    lines.push(...wrap(row.map((cell) => String(cell ?? "")).join("  |  "), 110));
  }
  if (rows.length > capped.length) {
    lines.push(`Showing the first ${capped.length} of ${rows.length} rows. Download CSV for the full export.`);
  }
  if (rows.length === 0) lines.push("No rows matched this report.");
  const pages = pagesOf(lines.flatMap((line) => wrap(line, 110)));
  const objects: string[] = [];
  const pageIds: number[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((page, index) => {
    const contentId = 4 + index * 2;
    const pageId = contentId + 1;
    pageIds.push(pageId);
    const commands = ["BT", "/F1 9 Tf", "40 760 Td", "14 TL"];
    for (const line of page) commands.push(`(${pdfText(line)}) Tj`, "T*");
    commands.push("ET");
    const stream = commands.join("\n");
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R >> >> /MediaBox [0 0 612 792] /Contents ${contentId} 0 R >>`
    );
  });
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(body);
}

export function renderTabularExport(input: {
  format: unknown;
  baseName: string;
  title: string;
  header: string[];
  rows: unknown[][];
  csv: string;
}) {
  if (input.format === "xls") {
    return {
      filename: `${input.baseName}.xls`,
      contentType: "application/vnd.ms-excel",
      body: toSpreadsheetMl(input.title, input.header, input.rows) as string | Uint8Array
    };
  }
  if (input.format === "pdf") {
    return {
      filename: `${input.baseName}.pdf`,
      contentType: "application/pdf",
      body: toPdf(input.title, input.header, input.rows) as string | Uint8Array
    };
  }
  return {
    filename: `${input.baseName}.csv`,
    contentType: "text/csv; charset=utf-8",
    body: input.csv as string | Uint8Array
  };
}
