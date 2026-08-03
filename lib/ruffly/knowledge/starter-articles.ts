import { FITDOG_BOOKING, fitdogBookingKnowledgeContent } from "@/lib/ruffly/knowledge/booking-links";

export type StarterKnowledgeArticle = {
  title: string;
  category: string;
  content: string;
  source: string;
  location?: string;
};

/**
 * Customer-visible Fitdog articles for Ruffly AI.
 * Sourced from public fitdog.com pages — keep factual; AI must not invent beyond this.
 */
export const RUFFLY_STARTER_KNOWLEDGE_ARTICLES: StarterKnowledgeArticle[] = [
  {
    title: "About Fitdog — location and hours",
    category: "General",
    location: "Santa Monica",
    source: "https://www.fitdog.com/",
    content: [
      "Fitdog is a full-service dog care club in Santa Monica offering daycare, overnight boarding, grooming, training, and enrichment activities.",
      "Address: 1712 21st St, Santa Monica, CA 90404.",
      "Phone: (310) 828-3647.",
      "Email: contact@fitdog.com.",
      "Website: https://www.fitdog.com/",
      "Typical club hours are 7:00 a.m. to 8:00 p.m. daily. Live webcams and daily report cards help owners stay connected during the day.",
      "If a guest asks about something not covered here (custom pricing exceptions, medical decisions, or availability for a specific date), hand off to staff."
    ].join("\n\n")
  },
  {
    title: "Fitdog style and club policies",
    category: "General",
    location: "Santa Monica",
    source: "https://www.fitdog.com/",
    content: [
      "Fitdog style: a warm, high-energy Santa Monica dog club focused on open play, enrichment, and keeping owners connected with live webcams and daily report cards.",
      "Club experience: loving experienced team, personalized care, and structured socialization in a large play yard.",
      "Getting started policy: new daycare and boarding dogs complete a temperament assessment before joining group play.",
      `Assessment policy: ${FITDOG_BOOKING.assessmentFee}, and it includes ${FITDOG_BOOKING.assessmentIncludes}.`,
      "Transparency policy: owners can check in through webcams and receive daily report cards while their dog is at the club.",
      "Safety-first policy: if a dog needs a different setup, or if there is a medical concern, injury, bite, or billing dispute, staff handles it directly — Ruffly should hand off.",
      "Do not invent detailed legal terms, vaccine lists, or unpublished house rules. For specifics beyond this pack, invite the guest to book an assessment or call (310) 828-3647."
    ].join("\n\n")
  },
  {
    title: "How to book and sign up — Fitdog links",
    category: "Onboarding",
    location: "Santa Monica",
    source: FITDOG_BOOKING.assessmentUrl,
    content: fitdogBookingKnowledgeContent()
  },
  {
    title: "Daycare at Fitdog",
    category: "Daycare",
    location: "Santa Monica",
    source: "https://www.fitdog.com/club-home/",
    content: [
      "Fitdog daycare includes open play in a large ~3,000 sq. ft. play yard with enrichment activities offered daily.",
      "Highlights: loving & experienced team, personalized care, and group socialization.",
      "Owners can use live webcams and receive daily report cards.",
      `New dogs need a daycare/boarding assessment before joining. Schedule here: ${FITDOG_BOOKING.assessmentUrl}`,
      `Assessments are ${FITDOG_BOOKING.assessmentFee} and include ${FITDOG_BOOKING.assessmentIncludes}.`,
      `After assessment, create a club account for daycare here: ${FITDOG_BOOKING.clubSignupUrl}`,
      "Do not invent same-day availability. Confirm openings with staff or Gingr when needed."
    ].join("\n\n")
  },
  {
    title: "Overnight boarding",
    category: "Boarding",
    location: "Santa Monica",
    source: "https://www.fitdog.com/club-home/",
    content: [
      "Boarding guests enjoy full access to open-play daycare and a daily group walk, plus their own private sleeping space.",
      "Overnight rates are all-inclusive and billed nightly. Options include Den, Petite Suite, and Suite based on dog size and whether multiple dogs share a room.",
      "From published pricing: Den about $70/night, Petite Suite about $75/night, Suite about $80/night, with weekly and longer-stay discounts listed on fitdog.com/pricing.",
      "Second-dog discounts and multi-night packages are published on the pricing page.",
      `New boarding guests need the same assessment as daycare: ${FITDOG_BOOKING.assessmentUrl} (${FITDOG_BOOKING.assessmentFee}; includes ${FITDOG_BOOKING.assessmentIncludes}).`,
      `Club account signup for boarding: ${FITDOG_BOOKING.clubSignupUrl}`,
      "Always recommend confirming current rates and room availability with staff before promising a booking."
    ].join("\n\n")
  },
  {
    title: "Grooming services",
    category: "Grooming",
    location: "Santa Monica",
    source: "https://www.fitdog.com/club-home/",
    content: [
      "Fitdog offers full-service grooming: cut & style, baths, brush-outs, de-matting, nail trims, flea treatments, and more.",
      "Published package ranges (vary by size, breed, and coat): Bath & Brush Out about $45–80+, Complete Spa about $55–95+, Ultimate Spa about $80–120+.",
      "Add-ons can include nail trim, ear cleaning, anal glands, sani cut, rear feather trim, de-matting, de-shedding, and all-natural flea bath.",
      "Additional charges may apply for long coats, doodles, poodles, de-matting, and de-shedding.",
      `To create a Fitdog account for grooming: ${FITDOG_BOOKING.clubSignupUrl}`,
      "Do not quote a final groom price without noting that coat condition and breed affect the total; offer to connect the guest with staff for an estimate."
    ].join("\n\n")
  },
  {
    title: "Training and sports",
    category: "Training",
    location: "Santa Monica",
    source: FITDOG_BOOKING.trainingConsultUrl,
    content: [
      `Schedule a training consultation here: ${FITDOG_BOOKING.trainingConsultUrl}`,
      `Training consults are ${FITDOG_BOOKING.trainingConsultFee}.`,
      `Private training account signup (club portal): ${FITDOG_BOOKING.clubSignupUrl}`,
      `Sports signup for beach excursions, adventure hikes, and group classes: ${FITDOG_BOOKING.sportsSignupUrl}`,
      "If someone asks about beach trips, adventure hikes, or group classes, send the Sports signup link — not the daycare assessment link.",
      "If someone asks about private training, send the free consult link and the club signup when they are ready to create an account."
    ].join("\n\n")
  },
  {
    title: "Daycare pricing snapshot",
    category: "Pricing",
    location: "Santa Monica",
    source: "https://www.fitdog.com/pricing/",
    content: [
      "Published daycare pricing (confirm on fitdog.com/pricing before promising):",
      "- Hourly: $15",
      "- Half day (less than 5 hours): $37",
      "- Full day: $49",
      "Packages (flexible usage, expire 1 year from first use): 10 Half Day $295; 10 Day $425; 20 Day $755.",
      "Monthly unlimited: $775 (includes one free night of boarding, free group walk, no boarding late fees, standing reservation, preferential wait list).",
      `Assessment to start daycare/boarding: ${FITDOG_BOOKING.assessmentFee} at ${FITDOG_BOOKING.assessmentUrl} (includes ${FITDOG_BOOKING.assessmentIncludes}).`,
      "Ask about new-member specials. For sports classes and individual training programs, use the Training and sports booking links.",
      "If exact package eligibility is unclear, hand off to staff."
    ].join("\n\n")
  },
  {
    title: "Taxi, walks, and add-on activities",
    category: "Services",
    location: "Santa Monica",
    source: "https://www.fitdog.com/pricing/",
    content: [
      "Published add-on activities:",
      "- Private walk: $15+ (about 20 minutes with staff)",
      "- Group walk: $5 (morning, midday, or evening; typically 3–5 dogs)",
      "- Mini bar service: $5+ per item (meal toppers, chews, treats)",
      "- Puzzle playtime: $15 private session (typically 1pm–3pm)",
      "- Taxi service: starting at $20 one-way; pick up & drop off in Santa Monica, generally up to about 7 miles from the Santa Monica location; morning & evening.",
      "Do not invent coverage outside Santa Monica or guarantee a taxi slot without staff confirmation."
    ].join("\n\n")
  },
  {
    title: "How to join — tour and assessment",
    category: "Onboarding",
    location: "Santa Monica",
    source: FITDOG_BOOKING.assessmentUrl,
    content: [
      `New daycare/boarding members schedule an assessment here: ${FITDOG_BOOKING.assessmentUrl}`,
      `Assessments are ${FITDOG_BOOKING.assessmentFee} and include ${FITDOG_BOOKING.assessmentIncludes}.`,
      `After passing, create a club account for daycare, boarding, grooming, or private training: ${FITDOG_BOOKING.clubSignupUrl}`,
      `Training consult (free): ${FITDOG_BOOKING.trainingConsultUrl}`,
      `Sports / group classes / beach / adventure hikes signup: ${FITDOG_BOOKING.sportsSignupUrl}`,
      "Guests can also call (310) 828-3647 or email contact@fitdog.com.",
      "Ruffly should never invent assessment results, temperament outcomes, or guaranteed start dates. Collect the owner's name, dog's name, and preferred contact method, then hand off to staff when needed."
    ].join("\n\n")
  },
  {
    title: "Contact Fitdog Customer Care",
    category: "Support",
    location: "Santa Monica",
    source: "https://www.fitdog.com/",
    content: [
      "Best ways to reach Fitdog:",
      "- Phone: (310) 828-3647",
      "- Email: contact@fitdog.com",
      "- Website: https://www.fitdog.com/",
      `- Daycare/boarding assessment: ${FITDOG_BOOKING.assessmentUrl}`,
      `- Training consult: ${FITDOG_BOOKING.trainingConsultUrl}`,
      `- Club account signup (daycare, boarding, grooming, private training): ${FITDOG_BOOKING.clubSignupUrl}`,
      `- Sports signup (beach, adventure hikes, group classes): ${FITDOG_BOOKING.sportsSignupUrl}`,
      "- Club login: https://fitdog.portal.gingrapp.com/",
      "- Training/classes login: https://app.fitdog.com/",
      "For billing disputes, medical emergencies, aggression incidents, or refunds, escalate to a human staff member immediately."
    ].join("\n\n")
  }
];
