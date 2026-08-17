/**
 * Live smoke: fetch medication report history for overnight reservations.
 * Requires TL_GINGR_KEY.
 *
 *   TL_GINGR_KEY=... npx tsx scripts/smoke-tl-medication-report-history.ts [reservation_id]
 */
import {
  extractAdministrationRecordsFromHistory,
  fetchGingrMedicationReportHistory,
  isAdministeredReportStatus,
  resolveAdministrationForSchedule
} from "../lib/tl-digi-board/gingr-medication-report";
import { requireTlGingrApiKey } from "../lib/tl-digi-board/gingr-auth";
import { laServiceDate } from "../lib/tl-digi-board/medication-windows";

async function main() {
  requireTlGingrApiKey();
  const reservationId = process.argv[2] || "208116";
  const serviceDate = laServiceDate(new Date());
  console.log({ reservationId, serviceDate });

  const history = await fetchGingrMedicationReportHistory(reservationId);
  const records = extractAdministrationRecordsFromHistory(history);
  console.log(
    JSON.stringify(
      {
        recordCount: records.length,
        records: records.map((row) => ({
          date: row.date,
          scheduleId: row.animalMedicationScheduleId,
          statusValue: row.statusValue,
          statusLabel: row.statusLabel,
          administered: isAdministeredReportStatus(row.statusValue, row.statusLabel),
          by: row.lastEditedBy,
          at: row.lastEditedAtUnix
        })),
        sampleResolved: records.slice(0, 5).map((row) =>
          resolveAdministrationForSchedule({
            records,
            animalMedicationScheduleId: row.animalMedicationScheduleId,
            serviceDate
          })
        )
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
