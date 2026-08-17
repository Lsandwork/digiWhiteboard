/**
 * Live smoke test for TL Digi Board Gingr sync.
 * Requires TL_GINGR_KEY. Does not print the key.
 */
import { syncTlDigiBoardState } from "../lib/tl-digi-board/sync";

async function main() {
  if (!process.env.TL_GINGR_KEY?.trim()) {
    console.error("TL_GINGR_KEY required");
    process.exit(1);
  }
  const snap = await syncTlDigiBoardState(null as never, { forceRefresh: true });
  console.log(
    JSON.stringify(
      {
        generatedAt: snap.generatedAt,
        summary: snap.summary,
        meta: snap.meta,
        overdueCount: snap.overdue.length,
        currentCount: snap.current.length,
        medCount: snap.medications.length,
        sample: snap.medications.slice(0, 8).map((m) => ({
          dog: m.dogName,
          med: m.medicationName,
          schedule: m.gingrScheduleLabel,
          kind: m.scheduleKind,
          dosage: m.dosage,
          lodging: m.lodgingLabel,
          status: m.administrationStatus
        })),
        overdueSample: snap.overdue.slice(0, 5).map((m) => ({
          dog: m.dogName,
          med: m.medicationName,
          schedule: m.gingrScheduleLabel,
          lodging: m.lodgingLabel
        })),
        currentSample: snap.current.slice(0, 8).map((m) => ({
          dog: m.dogName,
          med: m.medicationName,
          status: m.displayStatus,
          lodging: m.lodgingLabel
        }))
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
