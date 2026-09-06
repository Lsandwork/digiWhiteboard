export const SITE = {
  name: "ruffOPS",
  shortName: "ruffOPS",
  lockup: "Operations Platform",
  tagline: "The ultimate operations platform for pet businesses.",
  description:
    "ruffOPS is the all-in-one operations platform for dog daycares, boarding hotels, grooming, training, and multi-service pet facilities — connecting management and staff, powering custom lobby and department digital whiteboards, and keeping clients engaged from anywhere.",
  url: "https://www.ruffops.com",
  email: "hello@ruffops.com",
  phoneDisplay: "(855) 783-3677",
  phoneHref: "tel:+18557833677",
  location: "Santa Monica, CA",
  serviceArea:
    "Built for pet facilities nationwide · On-site support in Santa Monica, CA and within 10 miles",
  /** Real staff Digi-Board authentication — not a fake marketing login. */
  loginHref: "https://staff.ruffops.com/admin/login",
  /** @deprecated Prefer loginHref — kept for older chrome references. */
  clientLoginHref: "https://staff.ruffops.com/admin/login",
  attuneDemoHref: "https://www.ruffops.com/attune/demo/"
} as const;

/** Global marketing navigation matching the production redesign. */
export const NAV = [
  { label: "Home", href: "/" },
  { label: "Solutions", href: "/solutions" },
  { label: "Why ruffOPS", href: "/why-ruffops" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Support", href: "/support" }
] as const;

export const PRIMARY_CTA = {
  label: "Get Started",
  href: "/get-started"
} as const;

export const SECONDARY_CTA = {
  label: "Login",
  href: "https://staff.ruffops.com/admin/login"
} as const;

export const FOOTER_PRODUCT_LINKS = [
  { label: "Powerful SaaS Platform", href: "/solutions/management-platform" },
  { label: "Digital Whiteboards", href: "/solutions/digital-whiteboards" },
  { label: "Advertising Screens", href: "/solutions/advertising" },
  { label: "Expert Support", href: "/support" }
] as const;

/** Consultative pricing — no invented monthly rates. */
export const PACKAGES = [
  {
    id: "ops-platform",
    tag: "SaaS Platform",
    featured: true,
    name: "Custom SaaS Management Platform",
    price: "Custom facility pricing",
    audience: "For managers & staff",
    summary:
      "One operations command center for owners, managers, and staff — live status, schedules, handoffs, alerts, and department workflows in one place.",
    bullets: [
      "Management dashboards and staff workspaces",
      "Live check-in / check-out status and facility visibility",
      "Shift handoffs, alerts, and task clarity",
      "Department workflows for front desk, yard, boarding, grooming, and transport",
      "Role-based access for leadership and floor teams",
      "Multi-device access for office, lobby, and floor"
    ],
    note: "Built for facilities that need the whole team aligned — not another forgotten login.",
    cta: "Explore the Platform",
    href: "/solutions/management-platform"
  },
  {
    id: "kiosk-whiteboards",
    tag: "Digital Whiteboards",
    featured: false,
    name: "Custom Kiosk Digital Whiteboards",
    price: "Lobby + department displays",
    audience: "For lobby activities",
    summary:
      "Fully custom digital whiteboards for lobby TVs and staff kiosks — designed for your brand, rooms, and daily flow.",
    bullets: [
      "Lobby check-in / check-out showcase boards",
      "Live dog information and lobby activity displays",
      "Staff whiteboards for every department",
      "Brand-matched themes, motion, and content zones",
      "Cast-ready layouts for TV, tablet, and kiosk hardware",
      "Always-on displays readable across the room"
    ],
    note: "The board guests see in the lobby — and the boards your team actually runs from.",
    cta: "See Whiteboard Solutions",
    href: "/solutions/digital-whiteboards"
  },
  {
    id: "advertising-screens",
    tag: "Advertising",
    featured: false,
    name: "Remote Digital Whiteboard Advertising",
    price: "Rental or consulting",
    audience: "Rental or consulting services",
    summary:
      "Deploy branded display screens with remote content updates, advertising management, and setup consulting for pet facilities.",
    bullets: [
      "Screen deployment and mounting guidance",
      "Remote content and advertising updates",
      "Content scheduling for lobby and waiting areas",
      "Equipment recommendations and support",
      "Setup consulting for single or multi-location facilities"
    ],
    note: "Ideal when you want premium lobby screens without building the display stack alone.",
    cta: "Talk About Screens",
    href: "/solutions/advertising"
  }
] as const;

export const BUSINESS_TYPES = [
  "Dog Daycare",
  "Dog Hotel",
  "Boarding Facility",
  "Grooming Business",
  "Dog Rescue",
  "Animal Shelter",
  "Training Facility",
  "Transportation Service",
  "Veterinary",
  "Multi-Service Pet Facility",
  "Other"
] as const;

export const SERVICE_OPTIONS = [
  "Daycare",
  "Boarding",
  "Grooming",
  "Training",
  "Transportation",
  "Hikes / Outings",
  "Rescue / Adoption",
  "Retail",
  "Other"
] as const;

export const INTEREST_OPTIONS = [
  "SaaS Management Platform",
  "Custom Kiosk Digital Whiteboards",
  "Advertising / Display Screens",
  "Operations + Display Review",
  "Not sure — need guidance"
] as const;

/** Real product imagery from this repository — never invent fake dashboards. */
export const PRODUCT_SHOTS = {
  lobbyBoard:
    "/assets/lobby-whiteboard/light-v2/reference/Fitdog-Lobby-Whiteboard-Light-Approved-Mockup.png",
  lobbyCheckout:
    "/assets/fitdog-lobby-whiteboard/09-mockup-reference/fitdog-lobby-checkout-board-layout-reference-with-provided-logo.png",
  lobbyCoastal:
    "/assets/fitdog-lobby-whiteboard/02-backgrounds/fitdog-lobby-tv-bg-coastal-light-1920x1080.png",
  lobbyDark:
    "/assets/fitdog-lobby-whiteboard/02-backgrounds/fitdog-lobby-tv-bg-dark-active-1920x1080.png",
  dashboardHero: "/assets/crossover-dashboard/hero-mockup-reference.png",
  heroDogs: "/assets/login/fitdog-login-dogs.webp",
  pawOrange: "/assets/fitdog/paw-outline-orange.svg",
  staffPreview: "/assets/fitdog/staff-whiteboard/themes/clear-white-preview.png"
} as const;

/** @deprecated aliases */
export const PRODUCT_SHOTS_LEGACY = PRODUCT_SHOTS;
