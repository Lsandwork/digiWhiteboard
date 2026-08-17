/**
 * Discover Gingr medication API response shape for Fitdog.
 * Requires TL_GINGR_KEY (and optional GINGR_SUBDOMAIN, GINGR_LOCATION_ID).
 *
 * Usage:
 *   TL_GINGR_KEY=... npx tsx scripts/discover-gingr-medication-info.ts [animal_id]
 */
import { createGingrClient } from "../lib/integrations/gingr/client";
import { fetchCurrentlyCheckedInDogsRobust } from "../lib/gingr-checked-in-dogs";
import { requireTlGingrApiKey, tlGingrClientConfig } from "../lib/tl-digi-board/gingr-auth";

async function main() {
  const animalIdArg = process.argv[2];
  const apiKey = requireTlGingrApiKey();
  const { subdomain } = tlGingrClientConfig();
  const client = createGingrClient({ apiKey, subdomain });

  let animalId = animalIdArg;
  if (!animalId) {
    // Optional helper when GINGR_API_KEY is also present for checked-in discovery.
    const { dogs } = await fetchCurrentlyCheckedInDogsRobust({ force: true }).catch(() => ({
      dogs: [] as Array<{ animalId: string; dogName: string }>
    }));
    animalId = dogs[0]?.animalId ?? "";
    if (!animalId) {
      console.error("No checked-in animal found. Pass an animal_id argument.");
      process.exit(1);
    }
    console.log(`Using first checked-in animal: ${dogs[0].dogName} (${animalId})`);
  }

  const url = `https://${subdomain}.gingrapp.com/api/v1/get_medication_info?${new URLSearchParams({
    key: apiKey,
    animal_id: String(animalId)
  }).toString()}`;

  const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  const text = await response.text();
  console.log("HTTP", response.status);
  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.log(text.slice(0, 4000));
  }
  void client;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
