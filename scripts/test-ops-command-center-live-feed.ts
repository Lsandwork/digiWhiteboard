import assert from "node:assert/strict";
import {
  alertToWorkItem,
  followUpToWorkItem,
  issueToWorkItem,
  openLogToWorkItem
} from "../lib/ops-command-center/adapters/staff-ops-feed";
import type { ActiveIssue, CrossoverMessage, OwnerFollowUp } from "../lib/staff/admin-ops";
import type { OperationsAlert } from "../lib/fitdog-ops/types";

const followUp = followUpToWorkItem({
  id: "fu-1",
  subject: "Call about late pickup",
  owner_name: "Alex Owner",
  dog_name: "Milo",
  logged_by: "Front Desk",
  assigned_to: null,
  department: "Front Desk",
  priority: "Urgent",
  due_date: new Date().toISOString(),
  status: "Open",
  follow_up_notes: "Needs callback",
  source: "manual",
  source_id: null,
  urgent: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  resolved_at: null
} as OwnerFollowUp);

assert.equal(followUp.kind, "owner_follow_up");
assert.equal(followUp.priority, "critical");
assert.equal(followUp.hrefTab, "owner_follow_up");
assert.equal(followUp.completable, false);

const issue = issueToWorkItem({
  id: "is-1",
  title: "Gate latch sticky",
  category: "Facility Issue",
  source: "Manual",
  source_id: null,
  source_table: null,
  reported_by: "Team Lead",
  assigned_to: null,
  priority: "High",
  reported_at: new Date().toISOString(),
  due_at: null,
  status: "Open",
  notes: "Yard 2",
  resolution_notes: null,
  related_owner_name: null,
  related_dog_name: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  resolved_at: null
} as ActiveIssue);

assert.equal(issue.kind, "active_issue");
assert.equal(issue.priority, "high");
assert.equal(issue.hrefTab, "active_issues");

const alert = alertToWorkItem({
  id: "al-1",
  source: "fitdog",
  source_event_id: null,
  source_record_id: null,
  idempotency_key: "k1",
  alert_type: "CARD_DECLINED",
  severity: "critical",
  owner_id: null,
  owner_name: "Sam",
  dog_id: null,
  dog_name: "Rex",
  reservation_id: null,
  invoice_id: null,
  transaction_id: null,
  service_name: "Daycare",
  service_date: null,
  amount_due: 49,
  amount_paid: 0,
  currency: "USD",
  failure_reason: "Card declined",
  payment_attempt_count: 1,
  payment_method_brand: null,
  payment_method_last_four: null,
  status: "open",
  assigned_user_id: null,
  assigned_user_name: null,
  detected_at: new Date().toISOString()
} as OperationsAlert);

assert.equal(alert.kind, "payment_alert");
assert.equal(alert.priority, "critical");
assert.equal(alert.hrefTab, "fitdog_alerts");
assert.match(alert.detail || "", /\$49\.00 due/);

const openLog = openLogToWorkItem({
  id: "ol-1",
  subject: "Watch Milo overnight",
  message: "Limping",
  details: "Limping",
  log_type: "Dog Update",
  from_department: "Team Lead",
  to_department: "Team Leaders",
  priority: "High",
  status: "Open",
  related_dog_name: "Milo",
  related_owner_name: null,
  related_route: null,
  traffic_weather_issue: null,
  template_title: null,
  template_field_values: null,
  created_by: "Brian",
  submitted_by: "Brian",
  assigned_to: "Halle",
  assigned_team: "Team Leaders",
  reported_to: null,
  department_area: "Team Lead",
  urgent: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  resolved_at: null
} as CrossoverMessage);
assert.equal(openLog.kind, "open_log");
assert.equal(openLog.hrefTab, "crossover_communication");
assert.equal(openLog.priority, "high");

console.log("ops-command-center-live-feed: ok");
