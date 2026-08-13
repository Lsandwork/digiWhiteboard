import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertHrWriteUpUploadFile,
  inferHrWriteUpUploadContentType,
  sanitizeHrWriteUpUploadFilename
} from "../lib/hr/upload-write-up";

{
  assert.equal(inferHrWriteUpUploadContentType("scan.pdf", "application/pdf"), "application/pdf");
  assert.equal(inferHrWriteUpUploadContentType("photo.JPG", "image/jpeg"), "image/jpeg");
  assert.equal(inferHrWriteUpUploadContentType("write-up.png", ""), "image/png");
  assert.equal(inferHrWriteUpUploadContentType("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), null);
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
  const panel = readFileSync(join(process.cwd(), "components/admin/HrHubPanel.tsx"), "utf8");
  assert.match(panel, /Upload write-up/);
  assert.match(panel, /\/api\/admin\/hr\/upload-write-up/);
  assert.match(panel, /entered outside RuffOps|entered manually/);
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
