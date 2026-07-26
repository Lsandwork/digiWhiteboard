/**
 * Verify live Fitdog Route Generator pull (not fixtures).
 * Usage: npx tsx scripts/verify-fitdog-live-pull.ts [YYYY-MM-DD]
 */
import { loadEnvFiles } from "./load-env-local";
import { fitdogRouteReportProvider } from "../lib/route-generator/fitdog-provider";

loadEnvFiles();

async function main() {
  const date =
    process.argv[2] ||
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(
      new Date(Date.now() + 24 * 60 * 60 * 1000)
    );

  const pull = await fitdogRouteReportProvider.pullForDate({ date, sourceMode: "api" });
  const byService = new Map<string, number>();
  for (const item of pull.pickupItems) {
    const key = item.serviceCanonical || item.serviceRaw || "unknown";
    byService.set(key, (byService.get(key) || 0) + 1);
  }

  console.log(
    JSON.stringify(
      {
        date,
        sourceMode: pull.sourceMode,
        pickupCount: pull.pickupItems.length,
        dropoffCount: pull.dropoffItems.length,
        services: Object.fromEntries(byService),
        sampleDogs: pull.pickupItems.slice(0, 8).map((i) => ({
          dog: i.dogName,
          owner: i.ownerFullName,
          service: i.serviceCanonical,
          address: i.addressRaw,
          size: i.dogSize,
          status: i.validationStatus
        })),
        warnings: pull.warnings
      },
      null,
      2
    )
  );

  if (pull.sourceMode !== "api") {
    throw new Error(`Expected sourceMode=api, got ${pull.sourceMode}`);
  }
  if (!pull.pickupItems.length) {
    console.warn("No scheduled route dogs for this date (still a valid live API response).");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
