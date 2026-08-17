/**
 * Live audit: verify Gingr completion fields for all 11 TL additional service types.
 * Requires TL_GINGR_KEY. Does not print the key.
 *
 *   TL_GINGR_KEY=... npx tsx scripts/audit-tl-additional-services-gingr.ts
 */
import {
  assertTlAdditionalServicesAuditPasses,
  runTlAdditionalServicesCompletionAudit
} from "../lib/tl-digi-board/additional-services-audit";
import { requireTlGingrApiKey } from "../lib/tl-digi-board/gingr-auth";
import { TL_BOARD_REQUIRED_ADDITIONAL_SERVICES } from "../lib/tl-digi-board/tl-service-names";

async function main() {
  requireTlGingrApiKey();
  const audit = await runTlAdditionalServicesCompletionAudit();

  console.log(
    JSON.stringify(
      {
        requiredTypes: TL_BOARD_REQUIRED_ADDITIONAL_SERVICES,
        allReliable: audit.allReliable,
        allRequiredTypesPass: audit.allRequiredTypesPass,
        serviceDate: audit.serviceDate,
        reservationCount: audit.reservationCount,
        perType: audit.perType,
        issues: audit.issues,
        documentationPath: audit.documentationPath
      },
      null,
      2
    )
  );

  try {
    assertTlAdditionalServicesAuditPasses(audit);
    console.log("\naudit-tl-additional-services-gingr: PASS");
  } catch (error) {
    console.error("\naudit-tl-additional-services-gingr: FAIL");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
