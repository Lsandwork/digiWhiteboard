import assert from "node:assert/strict";
import { createAdminSessionToken, verifyAdminSessionToken } from "../lib/admin/session";
import { verifyAdminSessionTokenEdge } from "../lib/admin/session-edge";

async function main() {
  const token = createAdminSessionToken({
    email: "lonnie@fitdog.com",
    role: "owner_admin",
    adminUserId: "00000000-0000-0000-0000-000000000001"
  });

  const node = verifyAdminSessionToken(token);
  const edge = await verifyAdminSessionTokenEdge(token);

  assert.ok(node, "node verifier accepts token signed by node");
  assert.ok(edge, "edge verifier accepts token signed by node");
  assert.equal(node?.email, edge?.email);
  assert.equal(node?.role, edge?.role);
  console.log("session edge/node parity tests passed");
}

void main();
