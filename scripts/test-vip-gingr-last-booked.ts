import assert from "node:assert/strict";

function normalizeName(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function ownerNamesMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const leftParts = left.split(" ");
  const rightParts = right.split(" ");
  const leftLast = leftParts[leftParts.length - 1];
  const rightLast = rightParts[rightParts.length - 1];
  if (leftLast && rightLast && leftLast === rightLast && leftLast.length >= 3) {
    const leftFirst = leftParts[0];
    const rightFirst = rightParts[0];
    if (leftFirst && rightFirst && (leftFirst[0] === rightFirst[0] || leftFirst === rightFirst)) return true;
  }
  return false;
}

assert.equal(normalizeName("Nina Saxon"), "nina saxon");
assert.equal(ownerNamesMatch("Nina Saxon", "Nina Saxon"), true);
assert.equal(ownerNamesMatch("Nina Saxon", "N Saxon"), true);
assert.equal(ownerNamesMatch("Nina Saxon", "Peyton"), false);
assert.equal(normalizeName("Gracie"), "gracie");

console.log("vip gingr last-booked match checks passed");
