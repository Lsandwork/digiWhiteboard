import assert from "node:assert/strict";
import { buildExportFileName, deriveItemStatus } from "../lib/photo-upload-queue/process";
import { suggestedBatchName } from "../lib/photo-upload-queue/types";
import { sanitizePhotoFileName } from "../lib/photo-upload-queue/storage";

assert.equal(deriveItemStatus({ dogCount: 0, hasDuplicate: false, duplicateOverride: false, excluded: false }), "needs_dog_assignment");
assert.equal(deriveItemStatus({ dogCount: 1, hasDuplicate: true, duplicateOverride: false, excluded: false }), "needs_review");
assert.equal(deriveItemStatus({ dogCount: 1, hasDuplicate: true, duplicateOverride: true, excluded: false }), "ready_for_gingr");
assert.equal(deriveItemStatus({ dogCount: 2, hasDuplicate: false, duplicateOverride: false, excluded: false }), "ready_for_gingr");
assert.equal(deriveItemStatus({ dogCount: 1, hasDuplicate: false, duplicateOverride: false, excluded: true }), "excluded");

const exportName = buildExportFileName({
  serviceDate: "2026-07-18",
  dogNames: ["Buddy", "Max"],
  category: "Daycare",
  index: 1
});
assert.match(exportName, /^2026-07-18_Buddy-Max_Daycare_001\.jpg$/);

assert.equal(suggestedBatchName("2026-07-18", "Marketing"), "Fitdog Photos – 2026-07-18 – Marketing");
assert.ok(sanitizePhotoFileName("Buddy!! Photo #1.jpg").length > 0);

console.log("photo-upload-queue unit tests passed");
