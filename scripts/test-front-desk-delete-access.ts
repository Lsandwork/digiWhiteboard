import assert from "node:assert/strict";
import { canDeleteFrontDeskLogEntry } from "@/lib/staff/front-desk-log";

const entry = {
  created_by: "alex@fitdog.com",
  submitted_by: "alex@fitdog.com"
};

assert.equal(
  canDeleteFrontDeskLogEntry(entry, { email: "alex@fitdog.com", adminUserId: null, role: "front_desk_coordinator" }),
  true,
  "creator can delete own entry"
);

assert.equal(
  canDeleteFrontDeskLogEntry(entry, { email: "other@fitdog.com", adminUserId: null, role: "front_desk_coordinator" }),
  false,
  "other staff cannot delete"
);

assert.equal(
  canDeleteFrontDeskLogEntry(entry, { email: "boss@fitdog.com", adminUserId: null, role: "owner_admin" }),
  true,
  "super admin can delete"
);

assert.equal(
  canDeleteFrontDeskLogEntry(entry, { email: "boss@fitdog.com", adminUserId: null, role: "manager_admin" }),
  true,
  "admin can delete"
);

assert.equal(
  canDeleteFrontDeskLogEntry(entry, { email: "mgr@fitdog.com", adminUserId: null, role: "assistant_manager" }),
  true,
  "management can delete"
);

assert.equal(
  canDeleteFrontDeskLogEntry(
    { created_by: "user-123", submitted_by: null },
    { email: null, adminUserId: "user-123", role: "trainer" }
  ),
  true,
  "creator matched by admin user id"
);

console.log("front desk delete access tests passed");
