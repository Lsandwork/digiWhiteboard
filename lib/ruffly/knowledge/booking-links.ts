/**
 * Canonical Fitdog booking / signup destinations for Ruffly customer chat.
 * Keep these URLs exact — webchat replies should send owners here.
 */
export const FITDOG_BOOKING = {
  assessmentUrl: "https://www.fitdog.com/daycare-assessment/",
  assessmentFee: "$20",
  assessmentIncludes:
    "daycare until 8:00 p.m. on the day of the assessment if the dog passes",
  trainingConsultUrl: "https://www.fitdog.com/dog-training/",
  trainingConsultFee: "free",
  /** Daycare, boarding, grooming, private training account signup */
  clubSignupUrl: "https://fitdog.portal.gingrapp.com/public/new_customer",
  /** Sports: beach excursions, adventure hikes, group classes */
  sportsSignupUrl: "https://app.fitdog.com/sign-up"
} as const;

export function fitdogBookingKnowledgeContent(): string {
  return [
    "Use these exact Fitdog links when owners ask how to book, schedule, assess, or sign up:",
    "",
    `Daycare or boarding assessment / tour: ${FITDOG_BOOKING.assessmentUrl}`,
    `Assessments are ${FITDOG_BOOKING.assessmentFee} and include ${FITDOG_BOOKING.assessmentIncludes}.`,
    "",
    `Training consultation: ${FITDOG_BOOKING.trainingConsultUrl}`,
    `Training consults are ${FITDOG_BOOKING.trainingConsultFee}.`,
    "",
    `Create a Fitdog club account for daycare, boarding, grooming, or private training: ${FITDOG_BOOKING.clubSignupUrl}`,
    "",
    `Sign up for Sports (beach excursions, adventure hikes, group classes): ${FITDOG_BOOKING.sportsSignupUrl}`,
    "",
    "If an owner asks about daycare or boarding and has not been assessed yet, send them to the assessment link first.",
    "If they already passed assessment and need an account for daycare/boarding/grooming/private training, send the club signup link.",
    "If they ask about sports, beach trips, adventure hikes, or group classes, send the Sports signup link."
  ].join("\n");
}
