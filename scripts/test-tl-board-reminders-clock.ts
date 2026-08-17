/**
 * TL board daily reminder visibility + live clock formatting.
 */
import assert from "node:assert/strict";
import {
  isReminderVisibleOnTlBoard,
  TL_BOARD_REMINDER_LEAD_MINUTES
} from "../lib/tl-digi-board/reminders";
import { formatLaBoardLiveClock } from "../lib/tl-digi-board/medication-windows";

const zone = "America/Los_Angeles";

function reminderAt(time: string) {
  return {
    scheduled_time: time,
    is_active: true,
    audience: ["team_lead"] as const,
    active_days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    requires_swing_handler: false
  };
}

// Monday Aug 17, 2026 — 5:00 PM LA push → visible from 4:30 PM
{
  const pushAt5pm = new Date("2026-08-17T23:55:00.000Z"); // ~4:55 PM PDT
  assert.equal(
    isReminderVisibleOnTlBoard(reminderAt("17:00:00"), {
      timeZone: zone,
      now: pushAt5pm,
      dayKey: "monday",
      swingHandlerPresent: true,
      todayStatus: "pending_today"
    }),
    true
  );

  const tooEarly = new Date("2026-08-17T23:20:00.000Z"); // ~4:20 PM PDT
  assert.equal(
    isReminderVisibleOnTlBoard(reminderAt("17:00:00"), {
      timeZone: zone,
      now: tooEarly,
      dayKey: "monday",
      swingHandlerPresent: true,
      todayStatus: "pending_today"
    }),
    false
  );

  const afterPush = new Date("2026-08-18T00:05:00.000Z"); // ~5:05 PM PDT
  assert.equal(
    isReminderVisibleOnTlBoard(reminderAt("17:00:00"), {
      timeZone: zone,
      now: afterPush,
      dayKey: "monday",
      swingHandlerPresent: true,
      todayStatus: "pending_today"
    }),
    false
  );
}

// Already sent to staff whiteboard → hidden on TL board
{
  const inWindow = new Date("2026-08-17T23:55:00.000Z");
  assert.equal(
    isReminderVisibleOnTlBoard(reminderAt("17:00:00"), {
      timeZone: zone,
      now: inWindow,
      dayKey: "monday",
      swingHandlerPresent: true,
      todayStatus: "sent_automatic_today"
    }),
    false
  );
}

// Handler-only reminders never appear on TL board
{
  assert.equal(
    isReminderVisibleOnTlBoard(
      {
        ...reminderAt("17:00:00"),
        audience: ["dog_handler"]
      },
      {
        timeZone: zone,
        now: new Date("2026-08-17T23:55:00.000Z"),
        dayKey: "monday",
        swingHandlerPresent: true,
        todayStatus: "pending_today"
      }
    ),
    false
  );
}

assert.equal(TL_BOARD_REMINDER_LEAD_MINUTES, 30);

// Live clock includes seconds
{
  const formatted = formatLaBoardLiveClock(new Date("2026-08-17T23:00:42.000Z"));
  assert.match(formatted, /:\d{2}\s*(AM|PM)/);
}

console.log("test-tl-board-reminders-clock: ok");
