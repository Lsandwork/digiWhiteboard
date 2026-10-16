import assert from "node:assert/strict";
import {
  isFighterRotationIcon,
  pickFighterRotationIcon
} from "../lib/gingr-custom-animal-icons";
import {
  buildFighterRotationNoticeInput,
  commentMentionsDogName,
  evaluateFighterRotationConflicts,
  findDogsMentionedInComment,
  FIGHTER_ROTATION_NOTICE_TITLE
} from "../lib/staff/fighter-rotation-alerts";

assert.equal(isFighterRotationIcon({ title: "Fighter/Rotations", className: null }), true);
assert.equal(isFighterRotationIcon({ title: "Meds", className: "fa-pills" }), false);
assert.equal(isFighterRotationIcon({ title: "Alert", className: "fa-fighter-jet" }), true);

const picked = pickFighterRotationIcon(
  [
    {
      id: "1",
      animalId: "10",
      title: "Fighter/Rotations",
      comment: "Keep away from Max",
      className: "fa-fighter-jet",
      checkinAlert: true,
      isDeleted: false
    }
  ],
  "10"
);
assert.equal(picked?.comment, "Keep away from Max");

assert.equal(commentMentionsDogName("Keep away from Max during play", "Max"), true);
assert.equal(commentMentionsDogName("Keep away from Maxine", "Max"), false);
assert.equal(commentMentionsDogName("Rotate with <b>Buddy</b>", "Buddy"), true);

const mentioned = findDogsMentionedInComment("No Max or Buddy together", [
  { animalId: "1", dogName: "Max" },
  { animalId: "2", dogName: "Buddy" },
  { animalId: "3", dogName: "Luna" }
]);
assert.deepEqual(
  mentioned.map((dog) => dog.dogName).sort(),
  ["Buddy", "Max"]
);

const namedConflict = evaluateFighterRotationConflicts({
  arrivingAnimalId: "99",
  arrivingDogName: "Rex",
  arrivingIcon: null,
  checkedInDogs: [
    { animalId: "99", dogName: "Rex", ownerName: null, reservationId: null },
    { animalId: "1", dogName: "Max", ownerName: null, reservationId: null }
  ],
  otherIcons: new Map([
    ["1", { animalId: "1", title: "Fighter/Rotations", comment: "Separate from Rex", iconId: "a" }]
  ])
});
assert.ok(namedConflict);
assert.equal(namedConflict?.relatedDogs[0]?.dogName, "Max");
assert.match(namedConflict?.comments[0] ?? "", /Max:/);

const arrivingCommentConflict = evaluateFighterRotationConflicts({
  arrivingAnimalId: "99",
  arrivingDogName: "Rex",
  arrivingIcon: {
    animalId: "99",
    title: "Fighter/Rotations",
    comment: "Small group only — watch energy",
    iconId: "b"
  },
  checkedInDogs: [
    { animalId: "99", dogName: "Rex", ownerName: null, reservationId: null },
    { animalId: "1", dogName: "Max", ownerName: null, reservationId: null }
  ],
  otherIcons: new Map([["1", null]])
});
assert.ok(arrivingCommentConflict, "arriving Fighter/Rotations comment should alert when others are in");
assert.match(arrivingCommentConflict?.comments[0] ?? "", /Rex:/);

const noOthers = evaluateFighterRotationConflicts({
  arrivingAnimalId: "99",
  arrivingDogName: "Rex",
  arrivingIcon: {
    animalId: "99",
    title: "Fighter/Rotations",
    comment: "Small group only",
    iconId: "b"
  },
  checkedInDogs: [{ animalId: "99", dogName: "Rex", ownerName: null, reservationId: null }],
  otherIcons: new Map()
});
assert.equal(noOthers, null);

const notice = buildFighterRotationNoticeInput(namedConflict!);
assert.equal(notice.title, FIGHTER_ROTATION_NOTICE_TITLE);
assert.equal(notice.priority, "urgent");
assert.equal(notice.display_mode, "urgent");
assert.equal(notice.source, "fighter_rotation");
assert.match(notice.message, /Fighter\/Rotations:/);
assert.match(notice.message, /Rex is checking in/);
assert.match(notice.message as string, /Separate from Rex/, "icon comment/note must be in the board message");

// Email to contact@ for every Fighter/Rotation check-in — icon notes displayed in the body.
{
  const { buildFighterRotationCheckInEmail, FIGHTER_ROTATION_EMAIL_SUBJECT, FIGHTER_ROTATION_EMAIL_TO } =
    require("../lib/staff/fighter-rotation-email") as typeof import("../lib/staff/fighter-rotation-email");
  assert.equal(FIGHTER_ROTATION_EMAIL_TO, "contact@fitdog.com");
  assert.equal(FIGHTER_ROTATION_EMAIL_SUBJECT, "Gingr Fighter / Rotation DOG Checking in");
  const email = buildFighterRotationCheckInEmail({
    dogName: "Rex",
    ownerName: "Jane <Owner>",
    comments: ["Rex: Separate from Max — no yard time together", "Max: Watch Rex at the gate <b>closely</b>"],
    checkedInAt: "2026-10-16T12:00:00.000Z"
  });
  assert.equal(email.to, "contact@fitdog.com");
  assert.equal(email.subject, "Gingr Fighter / Rotation DOG Checking in");
  assert.match(email.text, /Rex: Separate from Max/);
  assert.match(email.text, /Max: Watch Rex at the gate closely/, "HTML stripped from icon notes in text body");
  assert.match(email.html, /Rex: Separate from Max/);
  assert.match(email.html, /Jane &lt;Owner&gt;/, "owner name escaped in HTML body");
  assert.doesNotMatch(email.html, /<b>closely<\/b>/, "icon note HTML must not render as markup");

  // Send path: configured provider receives exactly one transactional email to contact@.
  const { sendFighterRotationCheckInEmail } =
    require("../lib/staff/fighter-rotation-email") as typeof import("../lib/staff/fighter-rotation-email");
  let sent: unknown = null;
  void sendFighterRotationCheckInEmail(
    { dogName: "Rex", comments: ["Rex: Separate from Max"] },
    {
      id: "stub",
      displayName: "Stub",
      isConfigured: () => true,
      testConnection: async () => ({ ok: true, message: "ok" }),
      send: async (input: unknown) => {
        sent = input;
        return { ok: true, providerMessageId: "msg-1" };
      }
    }
  ).then((result: { ok: boolean }) => {
    assert.equal(result.ok, true);
    const record = sent as { to: string; subject: string; purpose: string; text: string };
    assert.equal(record.to, "contact@fitdog.com");
    assert.equal(record.subject, "Gingr Fighter / Rotation DOG Checking in");
    assert.equal(record.purpose, "transactional");
    assert.match(record.text, /Separate from Max/);
  });
}

console.log("fighter-rotation-alerts: ok");
