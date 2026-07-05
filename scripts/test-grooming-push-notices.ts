import assert from "node:assert/strict";
import {
  formatGroomingCountdown,
  groomingInstruction,
  normalizeGroomingPushNoticeInput,
  ownerDisplayLabel
} from "../lib/staff/grooming-push-notices";

function testNormalizeInput() {
  const normalized = normalizeGroomingPushNoticeInput({
    dog_name: "  Milo ",
    groomer_name: "Sarah",
    service: "Bath + Brush",
    owner_name: "Rebecca Martinez",
    safety_tags: ["Use slip lead", "Use slip lead"]
  });
  assert.equal(normalized.dog_name, "Milo");
  assert.equal(normalized.groomer_name, "Sarah");
  assert.equal(normalized.owner_initial, "R");
  assert.equal(normalized.safety_tags.length, 1);
}

function testCountdown() {
  const now = Date.now();
  const expiresAt = new Date(now + 5 * 60 * 1000).toISOString();
  assert.match(formatGroomingCountdown(expiresAt, now), /^05:0[0-1]$/);
  assert.equal(formatGroomingCountdown(expiresAt, now + 60 * 1000), "04:00");
  assert.equal(formatGroomingCountdown(expiresAt, now + 5 * 60 * 1000), "00:00");
}

function testInstructionAndOwner() {
  assert.match(groomingInstruction({ dog_name: "Milo" }), /Milo/);
  assert.equal(ownerDisplayLabel({ owner_name: "Rebecca Martinez", owner_initial: "R" }), "Rebecca Martinez");
  assert.equal(ownerDisplayLabel({ owner_name: null, owner_initial: "R" }), "Owner: R.");
}

testNormalizeInput();
testCountdown();
testInstructionAndOwner();
console.log("grooming push notice tests passed");
