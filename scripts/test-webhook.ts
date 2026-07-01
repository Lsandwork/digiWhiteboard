import { createHmac } from "crypto";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const key = process.env.GINGR_WEBHOOK_SIGNATURE_KEY;

if (!key) {
  throw new Error("GINGR_WEBHOOK_SIGNATURE_KEY is required.");
}

const signatureKey = key;

function sign(webhookType: string, entityId: string, entityType: string) {
  return createHmac("sha256", signatureKey).update(`${webhookType}${entityId}${entityType}`).digest("hex");
}

async function postWebhook(webhookType: string, entityId: string, animalName: string) {
  const entityType = "reservation";
  const payload = {
    webhook_type: webhookType,
    entity_id: entityId,
    entity_type: entityType,
    signature: sign(webhookType, entityId, entityType),
    entity_data: {
      reservation_id: entityId,
      animal_id: "atlas-001",
      animal_name: animalName,
      owner_name: "Victoria",
      reservation_type: "Daycare",
      room: webhookType.includes("out") ? "Front Desk Pickup" : "Front Desk Arrival",
      flags: { vip: true, daycare: true },
      notes: "Harness"
    }
  };

  const response = await fetch(`${baseUrl}/api/gingr/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`${webhookType} failed with ${response.status}: ${await response.text()}`);
  }
}

async function getBoard() {
  const response = await fetch(`${baseUrl}/api/live-board`, { cache: "no-store" });
  if (!response.ok) throw new Error(`live-board failed with ${response.status}`);
  return response.json() as Promise<{ checking_in: unknown[]; checking_out: unknown[] }>;
}

async function expectCount(kind: "checking_in" | "checking_out", count: number) {
  const board = await getBoard();
  if (board[kind].length !== count) {
    throw new Error(`Expected ${kind} count ${count}, got ${board[kind].length}`);
  }
}

async function run() {
  await postWebhook("checking_in", "reservation-test-001", "Atlas");
  await expectCount("checking_in", 1);
  await postWebhook("check_in", "reservation-test-001", "Atlas");
  await expectCount("checking_in", 1);
  await postWebhook("checking_out", "reservation-test-001", "Atlas");
  await expectCount("checking_out", 1);
  await postWebhook("check_out", "reservation-test-001", "Atlas");
  await expectCount("checking_out", 0);
  console.log("Webhook flow passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
