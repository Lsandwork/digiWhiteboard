import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadGitignoredLocalEnv() {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[name]) process.env[name] = value;
  }
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function main() {
  loadGitignoredLocalEnv();
  const { generateLobbyAd, plannedDurationSeconds } = await import("../lib/video-generation/pipeline");
  const { formatCostUsd, providerSnapshot } = await import("../lib/video-generation");
  const { FINAL_AD_FILE } = await import("../lib/video-generation/constants");

  const generate = hasFlag("--generate");
  const snapshot = providerSnapshot();

  console.log("Fitdog lobby ad — The Miraculous Recovery");
  console.log(`Provider: ${snapshot.id}`);
  console.log(`Model: ${snapshot.model}`);
  console.log(`Credentials: ${snapshot.configured ? "present" : "MISSING"}`);
  if (!snapshot.configured) {
    console.log(`Set one of: ${snapshot.missingCredentialEnvVars.join(", ")}`);
  }
  console.log(`Target duration: ${plannedDurationSeconds()}s (15–20s window)`);
  console.log(`Output: ${FINAL_AD_FILE}`);

  const result = await generateLobbyAd({
    generate,
    outputPath: FINAL_AD_FILE
  });

  console.log(`Estimated API cost: ${formatCostUsd(result.cost.estimatedUsd)} for ${result.cost.billedSeconds} billed seconds`);
  for (const note of result.cost.notes) console.log(`- ${note}`);
  console.log(`End card: ${result.endCardPath}`);
  console.log(`Cached scenes: ${result.skippedCached.join(", ") || "(none)"}`);

  if (result.dryRun) {
    console.log("Dry run complete. Re-run with --generate to call the video provider (one take per uncached scene).");
    if (!snapshot.configured) process.exitCode = 2;
    return;
  }

  for (const clip of result.generated) {
    console.log(`${clip.sceneId}: ${clip.cached ? "cache" : "generated"} ${clip.filePath} job=${clip.jobId}`);
  }
  console.log(`Final MP4: ${result.outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
