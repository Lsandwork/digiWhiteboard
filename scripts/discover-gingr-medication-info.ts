/**
 * Discover Gingr medication API response shape for Fitdog.
 * Requires GINGR_API_KEY (and optional GINGR_SUBDOMAIN, GINGR_LOCATION_ID).
 *
 * Usage:
 *   GINGR_API_KEY=... npx tsx scripts/discover-gingr-medication-info.ts [animal_id]
 */
import { createGingrClient } from "../lib/integrations/gingr/client";
import { fetchCurrentlyCheckedInDogsRobust } from "../lib/gingr-checked-in-dogs";

async function main() {
  const animalIdArg = process.argv[2];
  const client = createGingrClient();

  let animalId = animalIdArg;
  if (!animalId) {
    const { dogs } = await fetchCurrentlyCheckedInDogsRobust({ force: true });
    animalId = dogs[0]?.animalId ?? null;
    if (!animalId) {
      console.error("No checked-in animal found. Pass an animal_id argument.");
      process.exit(1);
    }
    console.log(`Using first checked-in animal: ${dogs[0].dogName} (${animalId})`);
  }

  const subdomain = process.env.GINGR_SUBDOMAIN?.trim() || "fitdog";
  const key = process.env.GINGR_API_KEY?.trim();
  if (!key) {
    console.error("GINGR_API_KEY is required.");
    process.exit(1);
  }

  const url = `https://${subdomain}.gingrapp.com/api/v1/get_medication_info?${new URLSearchParams({
    key,
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
