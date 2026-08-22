import assert from "node:assert/strict";
import { resolveActiveBoardWebhookType } from "../lib/gingr";

assert.equal(resolveActiveBoardWebhookType("checking_in"), "checking_in");
assert.equal(resolveActiveBoardWebhookType("checking_out"), "checking_out");
assert.equal(resolveActiveBoardWebhookType("added_to_basket"), "checking_out");
assert.equal(resolveActiveBoardWebhookType("add_to_basket"), "checking_out");
assert.equal(resolveActiveBoardWebhookType("checkout_basket_added"), "checking_out");
assert.equal(resolveActiveBoardWebhookType("animal_edited"), null);
assert.equal(resolveActiveBoardWebhookType("email_sent"), null);

console.log("board webhook type checks passed");
