/**
 * RETIRED — do not use.
 *
 * This script previously texted 2139131391 with a hardcoded “departing at 9:08pm”
 * Jasper demo. That behavior shipped into production cron and must never run again.
 */
console.error(
  "Refusing to send. Jasper demo SMS is permanently disabled after the 9:08pm / wrong-time production texts."
);
process.exit(1);
