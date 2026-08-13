import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertHrWriteUpUploadFile,
  geminiInlineMimeForWriteUp,
  inferHrWriteUpUploadContentType,
  sanitizeHrWriteUpUploadFilename
} from "../lib/hr/upload-write-up";
import { isHtmlDateValue, normalizeHtmlDateValue, pacificHtmlDate } from "../lib/dates/html-date";
import { humanizeUnknownError } from "../lib/safe-url";

{
  assert.equal(inferHrWriteUpUploadContentType("scan.pdf", "application/pdf"), "application/pdf");
  assert.equal(inferHrWriteUpUploadContentType("photo.JPG", "image/jpeg"), "image/jpeg");
  assert.equal(inferHrWriteUpUploadContentType("write-up.png", ""), "image/png");
  assert.equal(inferHrWriteUpUploadContentType("photo.jpg", "image/jpg"), "image/jpeg");
  assert.equal(inferHrWriteUpUploadContentType("scan.pdf", "application/pdf; charset=binary"), "application/pdf");
  assert.equal(inferHrWriteUpUploadContentType("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), null);
  assert.equal(geminiInlineMimeForWriteUp("scan.HEIC", "image/heic"), "image/heic");
  assert.equal(geminiInlineMimeForWriteUp("notes.docx", ""), null);
}

{
  assert.equal(sanitizeHrWriteUpUploadFilename("C:\\hr\\Paper Write Up.pdf"), "Paper_Write_Up.pdf");
  assert.equal(sanitizeHrWriteUpUploadFilename(""), "write-up");
}

{
  const pdf = assertHrWriteUpUploadFile({ name: "manual.pdf", type: "application/pdf", size: 1200 });
  assert.equal(pdf.contentType, "application/pdf");
  assert.equal(pdf.filename, "manual.pdf");

  const photo = assertHrWriteUpUploadFile({ name: "scan.jpg", type: "", size: 80_000 });
  assert.equal(photo.contentType, "image/jpeg");

  assert.throws(
    () => assertHrWriteUpUploadFile({ name: "notes.docx", type: "", size: 1000 }),
    /PDF or image/
  );
  assert.throws(
    () => assertHrWriteUpUploadFile({ name: "huge.pdf", type: "application/pdf", size: 9 * 1024 * 1024 }),
    /8 MB/
  );
  assert.throws(() => assertHrWriteUpUploadFile({ name: "empty.pdf", type: "application/pdf", size: 0 }), /Choose a write-up/);
}

{
  const today = pacificHtmlDate();
  assert.equal(isHtmlDateValue(today), true);
  assert.equal(normalizeHtmlDateValue("2026/08/13"), "2026-08-13");
  assert.equal(normalizeHtmlDateValue("8/13/2026"), "2026-08-13");
  assert.equal(normalizeHtmlDateValue("\u20662026\u2069-\u206608\u2069-\u206613\u2069"), "2026-08-13");
  assert.equal(isHtmlDateValue("2026/08/13"), false);
  assert.equal(
    humanizeUnknownError(new Error("The string did not match the expected pattern."), "Unable to upload write-up."),
    "Unable to upload write-up."
  );
  assert.equal(
    humanizeUnknownError(new Error("The string did not match the expected pattern."), "Unable to load admin dashboard. Reload and try again."),
    "Unable to load admin dashboard. Reload and try again."
  );
}

{
  const panel = readFileSync(join(process.cwd(), "components/admin/HrHubPanel.tsx"), "utf8");
  assert.match(panel, /Upload write-up/);
  assert.match(panel, /\/api\/admin\/hr\/upload-write-up/);
  assert.match(panel, /entered outside RuffOps|entered manually/);
  assert.match(panel, /pacificHtmlDate/);
  assert.match(panel, /noValidate/);
}

{
  const dashboard = readFileSync(join(process.cwd(), "components/admin/AdminDashboard.tsx"), "utf8");
  assert.match(dashboard, /humanizeUnknownError/);
  assert.match(dashboard, /Unable to load admin dashboard/);
}

{
  const recovery = readFileSync(join(process.cwd(), "components/ChunkLoadRecovery.tsx"), "utf8");
  assert.match(recovery, /did not match the expected pattern/);
  assert.match(recovery, /unregister/);
}

{
  const route = readFileSync(join(process.cwd(), "app/api/admin/hr/upload-write-up/route.ts"), "utf8");
  assert.match(route, /createManualUploadedWriteUp/);
  assert.match(route, /saveWriteUpAttachment/);
}

{
  const reports = readFileSync(join(process.cwd(), "lib/staff/management-reports.ts"), "utf8");
  assert.match(reports, /source: "hr_upload"/);
  assert.match(reports, /createManualUploadedWriteUp/);
}

console.log("hr upload write-up checks passed");
