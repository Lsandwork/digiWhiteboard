import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function run() {
  const response = await fetch(`${baseUrl}/api/gingr/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      webhook_type: "checking_in",
      entity_id: "bad-signature-test",
      entity_type: "reservation",
      signature: "not-a-valid-signature",
      entity_data: {
        reservation_id: "bad-signature-test",
        animal_name: "Atlas"
      }
    })
  });

  if (response.status !== 403) {
    throw new Error(`Expected 403, received ${response.status}: ${await response.text()}`);
  }

  console.log("Bad signature test passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
