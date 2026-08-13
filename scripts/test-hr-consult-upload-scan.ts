import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildConversationalStyleHint } from "../lib/ai/sanitizeAiText";
import { isUploadedHrWriteUp, UPLOADED_WRITE_UP_SCAN_PROMPT } from "../lib/hr/write-up-consult-copy";
import { hrRecordContextForConsult } from "../lib/hr/records";
import type { ManagementReport } from "../lib/staff/management-reports";

assert.equal(
  isUploadedHrWriteUp({ report_type: "employee_write_up", source: "hr_upload" }),
  true
);
assert.equal(
  isUploadedHrWriteUp({ report_type: "employee_write_up", source: "team_lead_form" }),
  false
);
assert.equal(
  isUploadedHrWriteUp({ report_type: "groomer_complaint", source: "hr_upload" }),
  false
);

{
  const hint = buildConversationalStyleHint({
    userMessage: "hello",
    priorUserTurns: 0,
    scannedWriteUp: true
  });
  assert.match(hint, /BEST next step/i);
  assert.match(hint, /managers and admins/i);
}

{
  const hint = buildConversationalStyleHint({
    userMessage: "hello",
    priorUserTurns: 0
  });
  assert.match(hint, /follow-up question/i);
  assert.doesNotMatch(hint, /BEST next step/);
}

{
  const report = {
    id: "wu-1",
    report_type: "employee_write_up",
    title: "Uploaded Write-Up — Alex",
    source: "hr_upload",
    summary: "Alex (Daycare) — uploaded write-up.",
    employee_name: "Alex",
    department: "Daycare",
    status: "Needs Review",
    admin_status: "Submitted",
    priority: "Normal",
    created_at: "2026-08-13T20:00:00.000Z",
    created_by: "lonnie@fitdog.com",
    write_up_details: {
      employee_name: "Alex",
      employee_department: "Daycare",
      pdf_filename: "scan.pdf",
      statement_of_violation: "See attached uploaded write-up.",
      text_report: "See attached uploaded write-up."
    }
  } as unknown as ManagementReport;
  const context = hrRecordContextForConsult(report);
  assert.match(context, /uploaded write-up/i);
  assert.match(context, /scan the attached original file/i);
  assert.match(context, /scan\.pdf/i);
}

{
  const consult = readFileSync(join(process.cwd(), "lib/hr/gemini-consult.ts"), "utf8");
  assert.match(consult, /inlineData/);
  assert.match(consult, /BEST next step/);
  assert.match(consult, /scannedWriteUp/);
}

{
  const route = readFileSync(join(process.cwd(), "app/api/admin/hr-consult/route.ts"), "utf8");
  assert.match(route, /isUploadedHrWriteUp/);
  assert.match(route, /loadHrConsultWriteUpAttachment/);
  assert.match(route, /scanned_upload/);
}

{
  const panel = readFileSync(join(process.cwd(), "components/admin/HrConsultPanel.tsx"), "utf8");
  assert.match(panel, /UPLOADED_WRITE_UP_SCAN_PROMPT/);
  assert.match(panel, /Sam will scan the file/);
}

assert.match(UPLOADED_WRITE_UP_SCAN_PROMPT, /best next step/i);

console.log("hr consult upload scan checks passed");
