import assert from "node:assert/strict";
import {
  buildActorNameLookup,
  displayActorLabel,
  looksLikeEmail,
  resolveDirectoryActorLabel
} from "@/lib/admin/actor-display";
import { shiftLogSubmittedByLabel } from "@/lib/staff/front-desk-log";

assert.equal(looksLikeEmail("alex@fitdog.com"), true);
assert.equal(looksLikeEmail("Alex Rivera"), false);

const lookup = buildActorNameLookup([
  { name: "Alex Rivera", email: "alex@fitdog.com", id: "user-1" }
]);

assert.equal(displayActorLabel("alex@fitdog.com", lookup), "Alex Rivera");
assert.equal(displayActorLabel("Alex Rivera", lookup), "Alex Rivera");
assert.equal(displayActorLabel("unknown@fitdog.com", lookup), "Unknown");
assert.equal(displayActorLabel(null, lookup), "Staff");

assert.equal(
  resolveDirectoryActorLabel("alex@fitdog.com", [
    { name: "Alex Rivera", email: "alex@fitdog.com", admin_user_id: "user-1" }
  ]),
  "Alex Rivera"
);

assert.equal(
  shiftLogSubmittedByLabel(
    {
      id: "1",
      subject: "Test",
      message: "Details",
      details: "Details",
      log_type: "General Shift Note",
      from_department: "Front Desk",
      to_department: "Front Desk Team",
      priority: "Normal",
      status: "Open",
      related_dog_name: null,
      related_owner_name: null,
      related_route: null,
      traffic_weather_issue: null,
      template_title: null,
      template_id: null,
      template_field_values: null,
      created_by: "alex@fitdog.com",
      submitted_by: "alex@fitdog.com",
      assigned_to: null,
      assigned_team: null,
      reported_to: null,
      department_area: null,
      due_at: null,
      reminder_at: null,
      needs_management_review: false,
      linked_owner_follow_up_id: null,
      linked_active_issue_id: null,
      management_alerted_at: null,
      urgent: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resolved_at: null,
      archived_at: null
    },
    [{ name: "Alex Rivera", email: "alex@fitdog.com", admin_user_id: "user-1" }]
  ),
  "Alex Rivera"
);

console.log("actor display name tests passed");
