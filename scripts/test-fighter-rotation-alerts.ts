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
assert.match(notice.message, /Fighter\/Rotations:/);
assert.match(notice.message, /Rex is checking in/);

console.log("fighter-rotation-alerts: ok");
