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

export type FitdogWebchatAction = {
  id: string;
  label: string;
  url: string;
  primary?: boolean;
};

export const FITDOG_WEBCHAT_ACTIONS: FitdogWebchatAction[] = [
  {
    id: "assessment",
    label: "Book $20 assessment",
    url: FITDOG_BOOKING.assessmentUrl,
    primary: true
  },
  {
    id: "club_signup",
    label: "Create Fitdog account",
    url: FITDOG_BOOKING.clubSignupUrl
  },
  {
    id: "training_consult",
    label: "Book free training consult",
    url: FITDOG_BOOKING.trainingConsultUrl
  },
  {
    id: "sports_signup",
    label: "Join Fitdog Sports",
    url: FITDOG_BOOKING.sportsSignupUrl
  }
];

export function actionsForUrls(urls: string[]): FitdogWebchatAction[] {
  const wanted = new Set(urls.map((url) => url.replace(/\/$/, "").toLowerCase()));
  return FITDOG_WEBCHAT_ACTIONS.filter((action) => wanted.has(action.url.replace(/\/$/, "").toLowerCase()));
}

export function extractUrls(text: string): string[] {
  const matches = String(text || "").match(/https?:\/\/[^\s<>"']+/g) || [];
  return [...new Set(matches.map((url) => url.replace(/[.,!?);:]+$/g, "")))];
}

/** Clean prose for chat bubbles — remove raw URLs (buttons carry the links). */
export function stripUrlsFromReply(text: string): string {
  return String(text || "")
    .replace(/https?:\/\/[^\s<>"']+/g, "")
    .replace(/\s+(here|at|via)\s*[:.]?\s*$/gi, ".")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/:\s*\./g, ".")
    .replace(/\.\s*\./g, ".")
    .trim();
}

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
