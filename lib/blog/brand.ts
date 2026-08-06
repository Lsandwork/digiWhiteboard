/** Public Fitdog blog brand tokens and navigation. */

import { publicBlogHref } from "@/lib/blog/public-path";

export const FITDOG_BLOG_ORANGE = "#ff6f26";

export const FITDOG_BLOG_LOGO = {
  mark: "/assets/lobby-whiteboard/light-v2/branding/fitdog-dog-logo-exact.png",
  markCircle: "/assets/fitdog/brand/fitdog-logo-circle-badge-128.png",
  wordmark: "/assets/fitdog/brand/fitdog-wordmark-horizontal.png",
  lockupDark: "/assets/fitdog-lobby-whiteboard/01-brand/logo/fitdog-logo-lockup-dark-transparent.png"
} as const;

export const FITDOG_PUBLIC_URLS = {
  home: process.env.NEXT_PUBLIC_FITDOG_SITE_URL?.trim() || "https://www.fitdog.com",
  services: process.env.NEXT_PUBLIC_FITDOG_SERVICES_URL?.trim() || "https://www.fitdog.com/club-home/",
  whyFitdog: process.env.NEXT_PUBLIC_FITDOG_WHY_URL?.trim() || "https://www.fitdog.com/why-fitdog",
  locations: process.env.NEXT_PUBLIC_FITDOG_LOCATIONS_URL?.trim() || "https://www.fitdog.com/locations",
  members:
    process.env.NEXT_PUBLIC_FITDOG_MEMBERS_URL?.trim() || "https://fitdog.portal.gingrapp.com/public/login",
  about: process.env.NEXT_PUBLIC_FITDOG_ABOUT_URL?.trim() || "https://www.fitdog.com/about",
  contact: process.env.NEXT_PUBLIC_FITDOG_CONTACT_URL?.trim() || "https://www.fitdog.com/contact",
  book: process.env.NEXT_PUBLIC_FITDOG_BOOK_URL?.trim() || "https://www.fitdog.com/daycare-assessment/",
  daycare: process.env.NEXT_PUBLIC_FITDOG_DAYCARE_URL?.trim() || "https://www.fitdog.com/club-home/",
  boarding: process.env.NEXT_PUBLIC_FITDOG_BOARDING_URL?.trim() || "https://www.fitdog.com/cat/caringdog/boarding",
  training: process.env.NEXT_PUBLIC_FITDOG_TRAINING_URL?.trim() || "https://www.fitdog.com/dog-training/",
  hikes: process.env.NEXT_PUBLIC_FITDOG_HIKES_URL?.trim() || "https://www.fitdog.com/los-angeles-outings/",
  grooming:
    process.env.NEXT_PUBLIC_FITDOG_GROOMING_URL?.trim() || "https://fitdog.wpenginepowered.com/club-home/grooming/",
  transportation:
    process.env.NEXT_PUBLIC_FITDOG_TRANSPORT_URL?.trim() || "https://www.fitdog.com/daycare-assessment/",
  instagram: process.env.NEXT_PUBLIC_FITDOG_INSTAGRAM_URL?.trim() || "https://www.instagram.com/fitdogsm",
  facebook: process.env.NEXT_PUBLIC_FITDOG_FACEBOOK_URL?.trim() || "https://www.facebook.com/fitdogsm",
  tiktok: process.env.NEXT_PUBLIC_FITDOG_TIKTOK_URL?.trim() || "https://www.tiktok.com/@fitdogsm",
  youtube: process.env.NEXT_PUBLIC_FITDOG_YOUTUBE_URL?.trim() || "https://www.youtube.com/@fitdogsm",
  socialHandle: "@fitdogsm"
} as const;

export const FITDOG_BLOG_NAV = [
  { label: "Services", href: FITDOG_PUBLIC_URLS.services, external: true },
  { label: "Why Fitdog", href: FITDOG_PUBLIC_URLS.whyFitdog, external: true },
  { label: "Members", href: FITDOG_PUBLIC_URLS.members, external: true },
  { label: "Blog", href: publicBlogHref(), external: false },
  { label: "About Us", href: FITDOG_PUBLIC_URLS.about, external: true },
  { label: "Contact", href: FITDOG_PUBLIC_URLS.contact, external: true }
] as const;

export const FITDOG_BLOG_BENEFITS = [
  {
    title: "Safety First",
    description: "Supervised play with trained care pros.",
    href: FITDOG_PUBLIC_URLS.daycare,
    icon: "shield"
  },
  {
    title: "Happy Dogs",
    description: "Enrichment, exercise & lots of love.",
    href: FITDOG_PUBLIC_URLS.whyFitdog,
    icon: "heart"
  },
  {
    title: "All Day Fun",
    description: "Daycare, hikes, beach & more adventures.",
    href: FITDOG_PUBLIC_URLS.hikes,
    icon: "paw"
  },
  {
    title: "Pickup & Drop-off",
    description: "Convenient service across LA.",
    href: FITDOG_PUBLIC_URLS.transportation,
    icon: "van"
  }
] as const;

export const FITDOG_FOOTER_SERVICES = [
  { label: "Daycare", href: FITDOG_PUBLIC_URLS.daycare },
  { label: "Boarding", href: FITDOG_PUBLIC_URLS.boarding },
  { label: "Training", href: FITDOG_PUBLIC_URLS.training },
  { label: "Hikes & Adventures", href: FITDOG_PUBLIC_URLS.hikes },
  { label: "Grooming", href: FITDOG_PUBLIC_URLS.grooming },
  { label: "Transportation", href: FITDOG_PUBLIC_URLS.transportation }
] as const;
