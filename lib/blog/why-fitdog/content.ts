/** Verified Why Fitdog page content — Santa Monica SEO focus. No fabricated metrics or quotes. */

import type { FitdogBookingAction } from "@/lib/blog/booking-config";

export const WHY_FITDOG_PATH = "/why-fitdog";

export const WHY_FITDOG_SEO = {
  title: "Why Choose Fitdog? Dog Daycare, Boarding & Training in Santa Monica",
  description:
    "Discover Fitdog dog daycare, boarding, training, grooming, outings, sports classes and transportation in Santa Monica, CA. Find the right service for your dog.",
  h1: "Why Santa Monica Dog Parents Choose Fitdog",
  canonicalPath: WHY_FITDOG_PATH
} as const;

export const FITDOG_BUSINESS = {
  name: "Fitdog",
  legalName: "Fitdog Sports Club",
  streetAddress: "1712 21st Street",
  addressLocality: "Santa Monica",
  addressRegion: "CA",
  postalCode: "90404",
  country: "US",
  telephone: "+1-310-828-3647",
  telephoneDisplay: "(310) 828-3647",
  email: "contact@fitdog.com",
  website: "https://www.fitdog.com/",
  lobbyHours: "7am – 8pm Daily (Closed Christmas & Thanksgiving)",
  foundedYear: 2010,
  serviceAreaNote: "Serving Santa Monica and approved surrounding Los Angeles communities"
} as const;

export const WHY_FITDOG_HERO = {
  eyebrow: "WHY FITDOG",
  h1Lead: "Why Santa Monica Dog Parents Choose ",
  h1Brand: "Fitdog",
  subhead: "Premium care. Real results. Happier, healthier dogs.",
  body:
    "Fitdog brings daycare, boarding, grooming, training, transportation, sports classes and structured outings together for dog owners in Santa Monica, CA. Our team helps you choose the right mix of activity, care, enrichment and rest for your individual dog.",
  trustPoints: [
    "Established dog-care services in Santa Monica since 2010",
    "Thoughtful activity, enrichment and rest for each dog",
    "Multiple services coordinated around your dog’s day"
  ],
  heroImage: {
    src: "/assets/fitdog/social-moments/posters/social-moment-02.jpg",
    alt: "Dog enjoying an outdoor outing — Fitdog enrichment in Santa Monica, CA"
  },
  heroCard: {
    title: "Not sure which service fits your dog?",
    body: "Our Santa Monica team can help you choose the best place to start — daycare assessment, training consult, grooming, or an outing conversation."
  }
} as const;

export type WhyFitdogServiceCard = {
  id: string;
  title: string;
  description: string;
  image: { src: string; alt: string };
  primaryAction: FitdogBookingAction;
  primaryLabel: string;
  secondaryAction: FitdogBookingAction;
  secondaryLabel: string;
  icon: "home" | "bed" | "scissors" | "grad" | "dumbbell" | "car";
};

export const WHY_FITDOG_SERVICES: WhyFitdogServiceCard[] = [
  {
    id: "daycare",
    title: "Dog Daycare in Santa Monica",
    description:
      "Supervised open play, enrichment activities, and rest in a structured daytime routine — designed for dogs who thrive with friends and space to move.",
    image: {
      src: "/assets/fitdog/social-moments/posters/social-moment-01.jpg",
      alt: "Dogs at Fitdog daycare play in Santa Monica"
    },
    primaryAction: "assessment",
    primaryLabel: "Book an Assessment",
    secondaryAction: "daycareInfo",
    secondaryLabel: "Learn About Daycare",
    icon: "home"
  },
  {
    id: "boarding",
    title: "Dog Boarding in Santa Monica",
    description:
      "Overnight stays with private sleeping areas, familiar daytime routines, and attentive overnight care so travel days stay as consistent as possible for your dog.",
    image: {
      src: "/assets/fitdog/social-moments/posters/social-moment-08.jpg",
      alt: "Comfortable Fitdog boarding environment in Santa Monica"
    },
    primaryAction: "boarding",
    primaryLabel: "Request Boarding",
    secondaryAction: "boardingInfo",
    secondaryLabel: "Learn About Boarding",
    icon: "bed"
  },
  {
    id: "grooming",
    title: "Dog Grooming in Santa Monica",
    description:
      "Full-service grooming — baths, brush-outs, cuts and styles — with gentle handling and coat care tailored to your dog’s breed and needs.",
    image: {
      src: "/assets/fitdog/social-moments/posters/social-moment-05.jpg",
      alt: "Dog ready for Fitdog grooming services in Santa Monica"
    },
    primaryAction: "grooming",
    primaryLabel: "Book Grooming",
    secondaryAction: "groomingInfo",
    secondaryLabel: "Explore Grooming",
    icon: "scissors"
  },
  {
    id: "training",
    title: "Dog Training in Santa Monica",
    description:
      "Positive-reinforcement training partners and programs — from manners to day training. Start with a consultation to match goals to the right path.",
    image: {
      src: "/assets/fitdog/social-moments/posters/social-moment-03.jpg",
      alt: "Dog training and learning at Fitdog in Santa Monica"
    },
    primaryAction: "trainingConsult",
    primaryLabel: "Book Training Consult",
    secondaryAction: "trainingInfo",
    secondaryLabel: "Explore Training",
    icon: "grad"
  },
  {
    id: "sports",
    title: "Dog Sports Classes",
    description:
      "Skill-building group classes and sports activities that give your dog exercise, focus, and enrichment — even when you’re at work.",
    image: {
      src: "/assets/fitdog/social-moments/posters/social-moment-07.jpg",
      alt: "Dogs in Fitdog sports and group classes"
    },
    primaryAction: "sportsClass",
    primaryLabel: "Book Sports Class",
    secondaryAction: "sportsClassInfo",
    secondaryLabel: "View Classes",
    icon: "dumbbell"
  },
  {
    id: "outings",
    title: "Sports & Enrichment Outings",
    description:
      "Hikes, beach excursions, and structured outings led by Fitdog’s enrichment team — real activity in and around Santa Monica.",
    image: {
      src: "/assets/fitdog/social-moments/posters/social-moment-06.jpg",
      alt: "Dog enrichment outing near Santa Monica with Fitdog"
    },
    primaryAction: "sportsEnrichmentConsult",
    primaryLabel: "Book an Outing Consultation",
    secondaryAction: "outingsInfo",
    secondaryLabel: "Explore Outings",
    icon: "car"
  }
];

export const WHY_FITDOG_TAXI = {
  title: "Fitdog Taxi",
  seoTitle: "Dog Pickup and Drop-Off in Santa Monica",
  description:
    "Convenient pickup and drop-off for club services and enrichment — serving Santa Monica and approved surrounding service areas. Ask us about availability for your neighborhood.",
  primaryAction: "taxi" as FitdogBookingAction,
  primaryLabel: "Book Taxi Service",
  secondaryAction: "contact" as FitdogBookingAction,
  secondaryLabel: "Check Service Area"
};

export const WHY_FITDOG_DIFFERENT = [
  {
    title: "Thoughtful Safety Practices",
    body: "Secure facilities, trained staff, and routines built around supervised play, rest, and clear communication with owners.",
    icon: "shield" as const
  },
  {
    title: "Individual Attention",
    body: "We look at your dog’s energy, social style, and goals so care feels personal — not one-size-fits-all.",
    icon: "people" as const
  },
  {
    title: "Experienced Care Team",
    body: "Handlers, hikers, groomers, and training partners who work with dogs every day at our Santa Monica club.",
    icon: "expert" as const
  },
  {
    title: "Enrichment with Purpose",
    body: "Open play, puzzle time, sports classes, and outings that give dogs mental and physical outlets — not just time apart.",
    icon: "leaf" as const
  },
  {
    title: "Clear Owner Communication",
    body: "Report cards, webcams where available, and a team you can reach when you need updates about your dog’s day.",
    icon: "phone" as const
  },
  {
    title: "Convenience Across Services",
    body: "Daycare, boarding, grooming, training, outings, and taxi options coordinated from one Santa Monica location.",
    icon: "clock" as const
  }
];

/** Public reviews published on fitdog.com (names only; no invented cities). */
export const WHY_FITDOG_TESTIMONIALS = [
  {
    quote:
      "Fitdog Sports Club is amazing! Their staff genuinely cares about pets and go the extra mile to make sure they get a lot of attention and care.",
    attribution: "Matthew F.",
    context: "Fitdog member"
  },
  {
    quote: "Rome has turned into the dog I've always wanted and I have Fitdog and Jeff Soto to thank for that.",
    attribution: "Katrina M.",
    context: "Training"
  },
  {
    quote:
      "If you are looking for a daycare or people to take care of your dogs they don't make them more compassionate and caring than Fitdog.",
    attribution: "David B.",
    context: "Fitdog member"
  }
] as const;

export const WHY_FITDOG_TRUST_STRIP = [
  { label: "Serving Santa Monica Dog Owners", detail: "Home base at 1712 21st Street" },
  { label: "Multiple Care Services", detail: "Daycare, boarding, grooming & more" },
  { label: "Structured Enrichment Options", detail: "Classes, hikes & outings" },
  { label: "Pickup and Drop-Off Available", detail: "Ask about your neighborhood" }
] as const;

export const WHY_FITDOG_CONVENIENCE = [
  { label: "Pickup and Drop-Off", detail: "Taxi service available" },
  { label: "Flexible Scheduling", detail: "Lobby open 7am–8pm daily" },
  { label: "Multiple Services in One Place", detail: "Care + enrichment together" },
  { label: "Santa Monica Location", detail: "1712 21st Street, CA 90404" }
] as const;

export const WHY_FITDOG_FAQS = [
  {
    question: "How do I choose the right Fitdog service for my dog?",
    answer:
      "Start with what your dog needs most — daytime play, overnight care, grooming, skills, or enrichment outings. Book a daycare assessment for club services, or a training consultation if you’re exploring training, sports, or structured outings. Our Santa Monica team can help you decide."
  },
  {
    question: "Does my dog need an assessment before daycare in Santa Monica?",
    answer:
      "Yes. New daycare dogs complete a tour and assessment so our team can evaluate play style, comfort, and fit before regular attendance."
  },
  {
    question: "How do I request boarding?",
    answer:
      "Review overnight options on our boarding page, then contact Fitdog or request boarding through the Why Fitdog page so we can check availability for your dates."
  },
  {
    question: "How do I book a training consultation?",
    answer:
      "Use Book Training Consult to open Fitdog’s training consultation flow. You’ll discuss goals and which training path fits your dog."
  },
  {
    question: "How do I discuss sports and enrichment outings?",
    answer:
      "Use the Sports & Enrichment Outing consultation button to schedule through the same training-consultation destination Fitdog uses for training consults. The conversation helps the team learn about your dog and recommend the most appropriate outing or enrichment option. Clicking does not by itself book a specific outing date."
  },
  {
    question: "Does Fitdog offer pickup and drop-off in Santa Monica?",
    answer:
      "Yes — Fitdog Taxi supports pickup and drop-off for eligible services. Service area includes Santa Monica and approved surrounding communities. Contact us to confirm your neighborhood."
  },
  {
    question: "How do I book grooming?",
    answer:
      "Visit our grooming page or use Book Grooming to start a request. Share coat type, preferences, and any handling notes so we can schedule appropriately."
  },
  {
    question: "What should I share before my dog’s first visit?",
    answer:
      "Vaccination records, feeding and medication notes, temperament around other dogs, and any training goals. For daycare, the assessment is the main first step."
  }
] as const;

export const WHY_FITDOG_LEAD_SERVICES = [
  { value: "daycare", label: "Daycare" },
  { value: "boarding", label: "Boarding" },
  { value: "grooming", label: "Grooming" },
  { value: "training", label: "Training" },
  { value: "taxi", label: "Taxi" },
  { value: "sports_class", label: "Sports classes" },
  { value: "sports_enrichment_outing", label: "Sports & enrichment outings" },
  { value: "not_sure", label: "Not sure yet" }
] as const;
