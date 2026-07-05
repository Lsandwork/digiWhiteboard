import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { EmployeeWriteUpDetails } from "@/lib/staff/management-reports";
import {
  WARNING_NOTICE_VIOLATION_TYPES,
  type WarningNoticeViolationType
} from "@/lib/staff/warning-notice-constants";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public/assets/fitdog/forms/Fitdog-Warning-Notice.pdf"
);

const BLACK = rgb(0, 0, 0);
const FONT_SIZE = 10;
const SMALL_FONT = 9;

type Point = { x: number; y: number };

const CHECKBOX_POSITIONS: Record<WarningNoticeViolationType, Point> = {
  Absenteeism: { x: 76, y: 651 },
  Tardiness: { x: 232, y: 651 },
  "Work Quality": { x: 388, y: 651 },
  Conduct: { x: 76, y: 633 },
  Insubordination: { x: 232, y: 633 },
  Uncooperative: { x: 388, y: 633 },
  Safety: { x: 76, y: 615 },
  Carelessness: { x: 232, y: 615 },
  Other: { x: 388, y: 615 }
};

function wrapText(text: string, maxWidth: number, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, size: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function drawWrappedText(
  page: ReturnType<PDFDocument["getPages"]>[number],
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  text: string,
  x: number,
  topY: number,
  maxWidth: number,
  lineHeight = 12,
  size = FONT_SIZE
) {
  const lines = wrapText(text, maxWidth, font, size);
  lines.forEach((line, index) => {
    page.drawText(line, { x, y: topY - index * lineHeight, size, font, color: BLACK });
  });
}

function drawCheck(page: ReturnType<PDFDocument["getPages"]>[number], font: Awaited<ReturnType<PDFDocument["embedFont"]>>, point: Point) {
  page.drawText("X", { x: point.x, y: point.y, size: SMALL_FONT, font, color: BLACK });
}

function selectedTypes(details: EmployeeWriteUpDetails): WarningNoticeViolationType[] {
  if (details.violation_types?.length) return details.violation_types;
  return [];
}

export async function generateWarningNoticePdf(details: EmployeeWriteUpDetails): Promise<Uint8Array> {
  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const employee = details.employee_name.trim();
  const violationDate = (details.violation_date ?? details.incident_date ?? "").trim();
  const documentedBy = (details.documented_by ?? "").trim();
  const violationTime = (details.violation_time ?? details.incident_time ?? "").trim();
  const statement = (details.statement_of_violation ?? details.incident_description ?? "").trim();
  const employeeStatement = (details.employee_statement ?? "").trim();

  page.drawText(employee, { x: 98, y: 704, size: FONT_SIZE, font, color: BLACK });
  page.drawText(violationDate, { x: 430, y: 704, size: FONT_SIZE, font, color: BLACK });
  page.drawText(documentedBy, { x: 132, y: 679, size: FONT_SIZE, font, color: BLACK });
  page.drawText(violationTime, { x: 440, y: 679, size: FONT_SIZE, font, color: BLACK });

  for (const type of selectedTypes(details)) {
    const position = CHECKBOX_POSITIONS[type];
    if (position) drawCheck(page, bold, position);
  }

  if (details.violation_types?.includes("Other") && details.violation_other?.trim()) {
    page.drawText(details.violation_other.trim(), { x: 430, y: 615, size: FONT_SIZE, font, color: BLACK });
  }

  drawWrappedText(page, font, statement, 72, 548, 468, 12);
  drawWrappedText(page, font, employeeStatement, 72, 448, 468, 12);

  page.drawText((details.date_of_warning ?? "").trim(), { x: 132, y: 365, size: FONT_SIZE, font, color: BLACK });
  page.drawText((details.type_of_warning ?? "").trim(), { x: 282, y: 365, size: FONT_SIZE, font, color: BLACK });
  page.drawText((details.employee_number ?? "").trim(), { x: 412, y: 365, size: FONT_SIZE, font, color: BLACK });
  page.drawText((details.employee_department ?? "").trim(), { x: 502, y: 365, size: FONT_SIZE, font, color: BLACK });

  const warningRows = details.previous_warnings?.length ? details.previous_warnings : [];
  const rowYs = [325, 305, 285];
  warningRows.slice(0, 3).forEach((row, index) => {
    const y = rowYs[index];
    page.drawText(row.date.trim(), { x: 72, y, size: SMALL_FONT, font, color: BLACK });
    if (row.verbal) drawCheck(page, bold, { x: 158, y });
    if (row.written) drawCheck(page, bold, { x: 218, y });
    page.drawText(row.by_whom.trim(), { x: 272, y, size: SMALL_FONT, font, color: BLACK });
    drawWrappedText(page, font, row.violation_details.trim(), 350, y + 2, 210, 10, SMALL_FONT);
  });

  drawWrappedText(
    page,
    font,
    (details.action_to_be_taken ?? details.corrective_action ?? "").trim(),
    72,
    228,
    468,
    12
  );

  page.drawText((details.employee_signature ?? "").trim(), { x: 122, y: 155, size: FONT_SIZE, font, color: BLACK });
  page.drawText((details.employee_signature_date ?? "").trim(), { x: 282, y: 155, size: FONT_SIZE, font, color: BLACK });
  page.drawText((details.manager_signature ?? details.team_lead_signature ?? "").trim(), { x: 122, y: 125, size: FONT_SIZE, font, color: BLACK });
  page.drawText((details.manager_signature_date ?? "").trim(), { x: 282, y: 125, size: FONT_SIZE, font, color: BLACK });

  return pdfDoc.save();
}

export { WARNING_NOTICE_VIOLATION_TYPES };
