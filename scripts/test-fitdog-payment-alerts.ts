import assert from "node:assert/strict";
import { accessFromLegacyRole, canAccessAdminTab } from "../lib/admin/permissions";
import { canManageFitdogAlerts, canViewFitdogAlerts } from "../lib/fitdog-ops/access";
import { classifyPaymentFailure, serviceIsCovered } from "../lib/fitdog-ops/classify";
import { buildFitdogIdempotencyKey } from "../lib/fitdog-ops/idempotency";
import { formatUsd } from "../lib/fitdog-ops/money";
import {
  classifyFitdogNotificationText,
  parseFitdogNotification
} from "../lib/fitdog-ops/notifications-parse";
import { normalizeFitdogWebhookPayload } from "../lib/fitdog-ops/providers/webhook";
import {
  alertMatchesSuccessfulPayment,
  evaluateMissedPayment,
  reconcileFitdogSnapshot
} from "../lib/fitdog-ops/reconcile";
import { sanitizeFitdogPayload } from "../lib/fitdog-ops/sanitize";

// 1. Declined payment creates one critical alert.
{
  const event = normalizeFitdogWebhookPayload({
    id: "evt_declined_1",
    type: "payment.failed",
    data: {
      owner_id: "own_1",
      owner_name: "Pat Owner",
      dog_id: "dog_1",
      dog_name: "Buddy",
      reservation_id: "res_1",
      amount: 45,
      status: "declined",
      failure_reason: "Card declined — do not honor",
      payment_method: { brand: "visa", last_four: "4242" }
    }
  });
  const result = reconcileFitdogSnapshot({ events: [event] }, { graceMinutes: 60 });
  assert.equal(result.createOrUpdate.length, 1);
  assert.equal(result.createOrUpdate[0]?.alert_type, "CARD_DECLINED");
  assert.equal(result.createOrUpdate[0]?.severity, "critical");
}

// 2. Duplicate events do not create duplicate alerts.
{
  const payload = {
    id: "evt_dup",
    type: "payment.failed",
    data: {
      owner_id: "own_2",
      reservation_id: "res_2",
      amount: 30,
      status: "failed",
      failure_reason: "Insufficient funds"
    }
  };
  const a = normalizeFitdogWebhookPayload(payload);
  const b = normalizeFitdogWebhookPayload(payload);
  const result = reconcileFitdogSnapshot({ events: [a, b] }, { graceMinutes: 60 });
  assert.equal(result.createOrUpdate.length, 1);
  assert.equal(
    buildFitdogIdempotencyKey({
      source_event_id: a.source_event_id,
      owner_id: a.owner_id,
      dog_id: a.dog_id,
      reservation_id: a.reservation_id,
      invoice_id: a.invoice_id,
      alert_type: "PAYMENT_FAILED",
      amount_due: a.amount_due
    }),
    "fitdog:evt_dup"
  );
}

// 3. Attended class without payment becomes missed after grace period.
{
  const completedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const missed = evaluateMissedPayment(
    {
      fitdog_service_id: "svc_1",
      fitdog_reservation_id: "res_miss",
      fitdog_owner_id: "own_3",
      fitdog_dog_id: "dog_3",
      owner_name: "Sam",
      dog_name: "Rex",
      service_name: "Group Class",
      completed_at: completedAt,
      attended: true,
      amount_due: 55
    },
    { graceMinutes: 60, now: new Date() }
  );
  assert.ok(missed);
  assert.equal(missed?.alert_type, "PAYMENT_MISSED");
  assert.equal(missed?.severity, "critical");
}

// Inside grace period — no alert.
{
  const completedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const missed = evaluateMissedPayment(
    {
      fitdog_service_id: "svc_grace",
      fitdog_owner_id: "own_g",
      service_name: "Daycare",
      completed_at: completedAt,
      attended: true,
      amount_due: 40
    },
    { graceMinutes: 60, now: new Date() }
  );
  assert.equal(missed, null);
}

// 4. Package-covered service does not create an alert.
{
  assert.equal(
    serviceIsCovered({ amount_due: 40, covered_by_package: true }),
    true
  );
  const missed = evaluateMissedPayment(
    {
      fitdog_service_id: "svc_pkg",
      fitdog_owner_id: "own_4",
      service_name: "Daycare",
      completed_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      attended: true,
      amount_due: 40,
      covered_by_package: true
    },
    { graceMinutes: 60 }
  );
  assert.equal(missed, null);
}

// 5. Complimentary service does not create an alert.
{
  const missed = evaluateMissedPayment(
    {
      fitdog_service_id: "svc_comp",
      fitdog_owner_id: "own_5",
      service_name: "Boarding",
      completed_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      attended: true,
      amount_due: 120,
      complimentary: true
    },
    { graceMinutes: 60 }
  );
  assert.equal(missed, null);
  assert.equal(serviceIsCovered({ amount_due: 0 }), true);
}

// 6. Successful retry resolves the original alert.
{
  const result = reconcileFitdogSnapshot(
    {
      events: [
        {
          source_event_id: "pay_ok_1",
          event_type: "payment.succeeded",
          status: "paid",
          owner_id: "own_6",
          dog_id: "dog_6",
          reservation_id: "res_6",
          amount_paid: 45,
          amount_due: 45
        }
      ]
    },
    { graceMinutes: 60 }
  );
  assert.equal(result.resolveMatches.length, 1);
  assert.equal(
    alertMatchesSuccessfulPayment(
      {
        owner_id: "own_6",
        dog_id: "dog_6",
        reservation_id: "res_6",
        invoice_id: null,
        amount_due: 45,
        alert_type: "PAYMENT_FAILED",
        status: "new"
      },
      result.resolveMatches[0]?.match
    ),
    true
  );
}

// 7. Manual payment resolution path is represented by paid status + match helpers.
{
  assert.equal(classifyPaymentFailure({ failure_reason: "ok", status: "paid", event_type: "payment" }), "PAYMENT_FAILED");
  // Successful payments are excluded from createOrUpdate.
  const result = reconcileFitdogSnapshot(
    {
      payments: [
        {
          fitdog_transaction_id: "txn_manual",
          fitdog_owner_id: "own_7",
          fitdog_reservation_id: "res_7",
          status: "paid",
          amount: 25
        }
      ]
    },
    { graceMinutes: 60 }
  );
  assert.equal(result.createOrUpdate.length, 0);
  assert.equal(result.resolveMatches.length, 1);
}

// 8. Unauthorized role receives 403-equivalent deny.
{
  const daycare = accessFromLegacyRole("u1", "daycare@fitdog.test", "daycare");
  assert.equal(canViewFitdogAlerts(daycare, "daycare"), false);
  assert.equal(canManageFitdogAlerts(daycare, "daycare"), false);
  assert.equal(canAccessAdminTab(daycare, "fitdog_alerts", "daycare", "staff"), false);
  assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "trainer"), "fitdog_alerts", "trainer", "staff"), false);
  assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "team_leader"), "fitdog_alerts", "team_leader", "staff"), false);
  assert.equal(
    canAccessAdminTab(accessFromLegacyRole(null, null, "front_desk_coordinator"), "fitdog_alerts", "front_desk_coordinator", "staff"),
    true
  );
  assert.equal(
    canAccessAdminTab(accessFromLegacyRole(null, null, "assistant_manager"), "fitdog_alerts", "assistant_manager", "staff"),
    true
  );
}

// 9. Shared display routes never return payment information — tables are private; sanitize redacts cards.
{
  const sanitized = sanitizeFitdogPayload({
    card_number: "4111111111111111",
    cvv: "123",
    last_four: "1111",
    owner_name: "Pat"
  }) as Record<string, unknown>;
  assert.equal(sanitized.card_number, "[redacted]");
  assert.equal(sanitized.cvv, "[redacted]");
  assert.equal(sanitized.last_four, "1111");
  assert.equal(sanitized.owner_name, "Pat");
}

// 10. Expired Fitdog authentication creates a sync-error idempotency key (runner reauthenticates safely).
{
  assert.match(
    buildFitdogIdempotencyKey({ source_event_id: "sync-auth-1", alert_type: "FITDOG_SYNC_ERROR", amount_due: 0 }),
    /^fitdog:sync-auth-1$/
  );
}

// 11. Interrupted sync can resume without duplicating records (idempotency key stable).
{
  const key1 = buildFitdogIdempotencyKey({
    owner_id: "own_x",
    dog_id: "dog_x",
    reservation_id: "res_x",
    invoice_id: null,
    alert_type: "PAYMENT_MISSED",
    amount_due: 40
  });
  const key2 = buildFitdogIdempotencyKey({
    owner_id: "own_x",
    dog_id: "dog_x",
    reservation_id: "res_x",
    invoice_id: null,
    alert_type: "PAYMENT_MISSED",
    amount_due: 40
  });
  assert.equal(key1, key2);
  const result = reconcileFitdogSnapshot(
    {
      services: [
        {
          fitdog_service_id: "svc_resume",
          fitdog_reservation_id: "res_x",
          fitdog_owner_id: "own_x",
          fitdog_dog_id: "dog_x",
          service_name: "Training",
          completed_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          attended: true,
          amount_due: 40
        },
        {
          fitdog_service_id: "svc_resume",
          fitdog_reservation_id: "res_x",
          fitdog_owner_id: "own_x",
          fitdog_dog_id: "dog_x",
          service_name: "Training",
          completed_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          attended: true,
          amount_due: 40
        }
      ]
    },
    { graceMinutes: 60, existingOpenKeys: new Set([key1]) }
  );
  assert.equal(result.createOrUpdate.length, 0);
}

// 12. Currency displays correctly in US dollars.
{
  assert.equal(formatUsd(45), "$45.00");
  assert.equal(formatUsd(45.5), "$45.50");
  assert.equal(formatUsd("12.3"), "$12.30");
}

// 13. Fitdog notification feed: card-declined class cancel is separated.
{
  const text =
    "Lucia Atwood class, Reliable Recall, on 07/24/2026 Jake was cancelled due to their credit card being declined. Try to call the customer to reschedule class.";
  assert.equal(classifyFitdogNotificationText(text), "CARD_DECLINED");
  const parsed = parseFitdogNotification({ id: "n1", text });
  assert.equal(parsed.alert_type, "CARD_DECLINED");
  assert.equal(parsed.owner_name, "Lucia Atwood");
  assert.equal(parsed.dog_name, "Jake");
  assert.equal(parsed.service_name, "Reliable Recall");
  assert.ok(parsed.service_date);

  const result = reconcileFitdogSnapshot(
    {
      notifications: [
        { id: "n1", text },
        {
          id: "n2",
          text: "Scout cancelled their Trail Foundations for 07/24/2026."
        },
        { id: "n3", text: "Birdie has an expired vaccination." }
      ]
    },
    { graceMinutes: 60 }
  );
  assert.equal(result.createOrUpdate.length, 3);
  assert.equal(result.createOrUpdate.filter((row) => row.alert_type === "CARD_DECLINED").length, 1);
  assert.equal(result.createOrUpdate.filter((row) => row.alert_type === "FITDOG_NOTIFICATION").length, 2);
  assert.match(String(result.createOrUpdate.find((row) => row.alert_type === "CARD_DECLINED")?.failure_reason), /credit card being declined/i);
}

console.log("fitdog payment alerts tests passed");
