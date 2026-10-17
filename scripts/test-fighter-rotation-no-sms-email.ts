import assert from "node:assert/strict";
import {
  FIGHTER_ROTATION_SMS_SUPPRESSED_REASON,
  isFighterRotationAlertText,
  isFighterRotationSmsBlocked,
  sendSuperAdminSmsAlert
} from "../lib/staff/super-admin-sms";
import {
  FIGHTER_ROTATION_ALERT_EMAIL_SUBJECT,
  FIGHTER_ROTATION_ALERT_EMAIL_TO,
  buildFighterRotationEmail,
  buildFighterRotationEmailFromNotice,
  sendFighterRotationEmail
} from "../lib/staff/fighter-rotation-email";
import type { EmailProvider } from "../lib/integrations/email/provider";

async function main() {
  // --- SMS block: every Fighter/Rotation shape is blocked ---
  assert.equal(isFighterRotationSmsBlocked({ source: "fighter_rotation" }), true);
  assert.equal(isFighterRotationSmsBlocked({ source: " Fighter_Rotation " }), true);
  assert.equal(isFighterRotationSmsBlocked({ title: "FIGHTER / ROTATIONS" }), true);
  assert.equal(isFighterRotationSmsBlocked({ title: "URGENT: FIGHTER / ROTATIONS" }), true);
  assert.equal(isFighterRotationSmsBlocked({ title: "Fighter/Rotations" }), true);
  assert.equal(isFighterRotationSmsBlocked({ title: "fighter-rotation icon" }), true);
  assert.equal(
    isFighterRotationSmsBlocked({ title: "Urgent", message: "Notes from the Fighter / Rotation icon: keep apart" }),
    true
  );
  assert.equal(isFighterRotationAlertText("Fighter/Rotations: separate yards"), true);
  console.log("ok - fighter/rotation source, title, and body shapes are SMS-blocked");

  // --- SMS block: unrelated urgent alerts are NOT blocked ---
  assert.equal(isFighterRotationSmsBlocked({ title: "URGENT: Heat Alert" }), false);
  assert.equal(isFighterRotationSmsBlocked({ title: "URGENT: Dog fight in yard 2" }), false);
  assert.equal(isFighterRotationSmsBlocked({ title: "URGENT: Sick dog", message: "Not eating" }), false);
  assert.equal(isFighterRotationSmsBlocked({ source: "heat_alert", title: "Heat Alert" }), false);
  console.log("ok - unrelated urgent alerts (incl. generic dog-fight incidents) still SMS");

  // --- Choke point: sendSuperAdminSmsAlert can never SMS a fighter alert ---
  {
    const fighter = await sendSuperAdminSmsAlert({
      kind: "urgent_alert",
      title: "URGENT: FIGHTER / ROTATIONS",
      detail: "Bella is checking in. Fighter/Rotations: keep away from Max",
      idempotencyKey: "test-fighter-choke"
    });
    assert.deepEqual(fighter, { ok: false, skipped: true, error: FIGHTER_ROTATION_SMS_SUPPRESSED_REASON });

    const normal = await sendSuperAdminSmsAlert({
      kind: "urgent_alert",
      title: "URGENT: Heat Alert",
      detail: "Yard temp high",
      idempotencyKey: "test-normal-choke"
    });
    assert.notEqual(normal.error, FIGHTER_ROTATION_SMS_SUPPRESSED_REASON);
    console.log("ok - SMS choke point suppresses fighter alerts for every caller");
  }

  // --- Email: exact recipient/subject, every icon comment verbatim ---
  {
    const comments = ["Bella: Must be separated from Max — lunges at fence (Gingr icon note #1)", "Max: Rotation only, no yard 2"];
    const email = buildFighterRotationEmail({
      arrivingDogName: "Bella",
      relatedDogNames: ["Max"],
      comments,
      checkedInAt: new Date("2026-10-17T00:00:00.000Z")
    });
    assert.equal(email.to, "contact@fitdog.com");
    assert.equal(FIGHTER_ROTATION_ALERT_EMAIL_TO, "contact@fitdog.com");
    assert.equal(email.subject, "Gingr Fighter / Rotation DOG Checking in");
    assert.equal(FIGHTER_ROTATION_ALERT_EMAIL_SUBJECT, email.subject);
    for (const comment of comments) {
      assert.ok(email.text.includes(comment), "text body carries comment verbatim");
      assert.ok(email.html.includes(comment.replace(/&/g, "&amp;")), "html body carries comment");
    }
    assert.ok(email.text.includes("Bella"));
    assert.ok(email.text.includes("Max"));
    console.log("ok - check-in email addressed/subjected correctly with all icon notes");
  }

  // --- Email from a pushed notice (manual re-push path) carries its notes ---
  {
    const email = buildFighterRotationEmailFromNotice({
      title: "FIGHTER / ROTATIONS",
      message: "Bella is checking in.\nNamed in notes / also checked in: Max.\nFighter/Rotations: Bella: keep apart from Max"
    });
    assert.equal(email.to, "contact@fitdog.com");
    assert.equal(email.subject, "Gingr Fighter / Rotation DOG Checking in");
    assert.ok(email.text.includes("keep apart from Max"));
    assert.ok(email.text.includes("Bella"));
    console.log("ok - notice-based email carries the icon notes too");
  }

  // --- Email sending: provider result is reported, never thrown ---
  {
    const sent: Array<{ to: string; subject: string }> = [];
    const fakeProvider: EmailProvider = {
      id: "fake",
      displayName: "Fake",
      isConfigured: () => true,
      testConnection: async () => ({ ok: true, message: "ok" }),
      send: async (input) => {
        sent.push({ to: input.to, subject: input.subject });
        return { ok: true, providerMessageId: "msg-1" };
      }
    };
    const content = buildFighterRotationEmail({ arrivingDogName: "Bella", relatedDogNames: [], comments: ["note"] });
    const result = await sendFighterRotationEmail(content, fakeProvider);
    assert.deepEqual(result, { ok: true, providerMessageId: "msg-1" });
    assert.deepEqual(sent, [{ to: "contact@fitdog.com", subject: "Gingr Fighter / Rotation DOG Checking in" }]);

    const unconfigured: EmailProvider = {
      ...fakeProvider,
      isConfigured: () => false,
      send: async () => ({ ok: true })
    };
    const skipped = await sendFighterRotationEmail(content, unconfigured);
    assert.equal(skipped.ok, false);
    assert.equal(skipped.skipped, true);
    console.log("ok - email send result is known and reported (no silent success)");
  }

  console.log("test-fighter-rotation-no-sms-email: all assertions passed");
}

void main();
