/**
 * Central Fitdog public booking destinations for Why Fitdog and related CTAs.
 * Training consult and Sports & Enrichment Outing consult share one URL by design.
 */

import { FITDOG_PUBLIC_URLS } from "@/lib/blog/brand";

export type FitdogBookingAction =
  | "assessment"
  | "boarding"
  | "grooming"
  | "trainingConsult"
  | "sportsEnrichmentConsult"
  | "taxi"
  | "sportsClass"
  | "contact"
  | "services"
  | "outingsInfo"
  | "daycareInfo"
  | "boardingInfo"
  | "groomingInfo"
  | "trainingInfo"
  | "sportsClassInfo";

export type FitdogServiceInterest =
  | "daycare"
  | "boarding"
  | "grooming"
  | "training"
  | "taxi"
  | "sports_class"
  | "sports_enrichment_outing"
  | "not_sure";

type BookingEntry = {
  url: string;
  label: string;
  available: boolean;
  destinationType: string;
};

function envUrl(key: string, fallback: string) {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : fallback;
}

/**
 * Verified Fitdog training-consultation destination.
 * Prefer NEXT_PUBLIC_FITDOG_TRAINING_CONSULT_URL when a Calendly (or other) URL is configured.
 * Default is Fitdog’s live training inquiry page (no Calendly URL exists in-repo).
 */
export function getTrainingConsultUrl() {
  return envUrl("NEXT_PUBLIC_FITDOG_TRAINING_CONSULT_URL", "https://fitdog.wpenginepowered.com/training-inquiry/");
}

/** Sports & Enrichment Outing consult uses the same destination as training consult. */
export function getSportsEnrichmentConsultUrl() {
  return getTrainingConsultUrl();
}

export function getFitdogBookingActions(): Record<FitdogBookingAction, BookingEntry> {
  const trainingConsultUrl = getTrainingConsultUrl();
  const assessment = envUrl("NEXT_PUBLIC_FITDOG_ASSESSMENT_URL", FITDOG_PUBLIC_URLS.book);
  const boarding = envUrl("NEXT_PUBLIC_FITDOG_BOARDING_BOOK_URL", FITDOG_PUBLIC_URLS.boarding);
  const grooming = envUrl("NEXT_PUBLIC_FITDOG_GROOMING_BOOK_URL", FITDOG_PUBLIC_URLS.grooming);
  const taxi = envUrl("NEXT_PUBLIC_FITDOG_TAXI_URL", FITDOG_PUBLIC_URLS.contact);
  const sportsClass = envUrl("NEXT_PUBLIC_FITDOG_SPORTS_CLASS_URL", "https://www.fitdog.com/search-training/");
  const contact = envUrl("NEXT_PUBLIC_FITDOG_CONTACT_URL", FITDOG_PUBLIC_URLS.contact);

  return {
    assessment: {
      url: assessment,
      label: "Book an Assessment",
      available: Boolean(assessment),
      destinationType: "daycare_assessment"
    },
    boarding: {
      url: boarding,
      label: "Request Boarding",
      available: Boolean(boarding),
      destinationType: "boarding_info"
    },
    grooming: {
      url: grooming,
      label: "Book Grooming",
      available: Boolean(grooming),
      destinationType: "grooming_info"
    },
    trainingConsult: {
      url: trainingConsultUrl,
      label: "Book Training Consult",
      available: Boolean(trainingConsultUrl),
      destinationType: "training_consult"
    },
    sportsEnrichmentConsult: {
      url: trainingConsultUrl,
      label: "Book an Outing Consultation",
      available: Boolean(trainingConsultUrl),
      destinationType: "training_consult"
    },
    taxi: {
      url: taxi,
      label: "Book Taxi Service",
      available: Boolean(taxi),
      destinationType: "taxi_contact"
    },
    sportsClass: {
      url: sportsClass,
      label: "Book Sports Class",
      available: Boolean(sportsClass),
      destinationType: "sports_class_booking"
    },
    contact: {
      url: contact,
      label: "Contact Fitdog",
      available: Boolean(contact),
      destinationType: "contact"
    },
    services: {
      url: FITDOG_PUBLIC_URLS.services,
      label: "Explore Fitdog Services",
      available: true,
      destinationType: "services"
    },
    outingsInfo: {
      url: FITDOG_PUBLIC_URLS.hikes,
      label: "Explore Outings",
      available: true,
      destinationType: "outings_info"
    },
    daycareInfo: {
      url: FITDOG_PUBLIC_URLS.daycare,
      label: "Learn About Daycare",
      available: true,
      destinationType: "daycare_info"
    },
    boardingInfo: {
      url: FITDOG_PUBLIC_URLS.boarding,
      label: "Learn About Boarding",
      available: true,
      destinationType: "boarding_info"
    },
    groomingInfo: {
      url: FITDOG_PUBLIC_URLS.grooming,
      label: "Explore Grooming",
      available: true,
      destinationType: "grooming_info"
    },
    trainingInfo: {
      url: FITDOG_PUBLIC_URLS.training,
      label: "Explore Training",
      available: true,
      destinationType: "training_info"
    },
    sportsClassInfo: {
      url: FITDOG_PUBLIC_URLS.hikes,
      label: "View Classes",
      available: true,
      destinationType: "sports_class_info"
    }
  };
}

export function bookingActionForInterest(interest: FitdogServiceInterest): FitdogBookingAction {
  switch (interest) {
    case "daycare":
      return "assessment";
    case "boarding":
      return "boarding";
    case "grooming":
      return "grooming";
    case "training":
      return "trainingConsult";
    case "taxi":
      return "taxi";
    case "sports_class":
      return "sportsClass";
    case "sports_enrichment_outing":
      return "sportsEnrichmentConsult";
    default:
      return "assessment";
  }
}

export function analyticsEventForAction(action: FitdogBookingAction): {
  event: string;
  serviceInterest: FitdogServiceInterest | "general";
  destinationType: string;
} {
  const actions = getFitdogBookingActions();
  const entry = actions[action];
  switch (action) {
    case "trainingConsult":
      return {
        event: "fitdog_training_consult_clicked",
        serviceInterest: "training",
        destinationType: entry.destinationType
      };
    case "sportsEnrichmentConsult":
      return {
        event: "fitdog_outing_consult_clicked",
        serviceInterest: "sports_enrichment_outing",
        destinationType: entry.destinationType
      };
    case "assessment":
      return { event: "fitdog_assessment_clicked", serviceInterest: "daycare", destinationType: entry.destinationType };
    case "boarding":
      return { event: "fitdog_boarding_clicked", serviceInterest: "boarding", destinationType: entry.destinationType };
    case "grooming":
      return { event: "fitdog_grooming_clicked", serviceInterest: "grooming", destinationType: entry.destinationType };
    case "taxi":
      return { event: "fitdog_taxi_clicked", serviceInterest: "taxi", destinationType: entry.destinationType };
    case "sportsClass":
      return {
        event: "fitdog_sports_class_clicked",
        serviceInterest: "sports_class",
        destinationType: entry.destinationType
      };
    case "contact":
      return { event: "fitdog_contact_clicked", serviceInterest: "general", destinationType: entry.destinationType };
    default:
      return { event: "fitdog_cta_clicked", serviceInterest: "general", destinationType: entry.destinationType };
  }
}

/** Confirm training + outing share one destination URL (defined once). */
export function trainingAndOutingShareDestination() {
  const actions = getFitdogBookingActions();
  return actions.trainingConsult.url === actions.sportsEnrichmentConsult.url && actions.trainingConsult.url.length > 0;
}
