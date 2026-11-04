export const SITE = {
  name: "ruffOPS",
  shortName: "ruffOPS",
  lockup: "One board. One truth. Happier dogs.",
  tagline: "Ops software for dog daycares that already ran out of whiteboards.",
  description:
    "ruffOPS is the operations platform and digital whiteboard stack for dog daycares, boarding hotels, grooming, training, and multi-service pet facilities — management tools, staff boards, and lobby TVs that finally agree on what’s happening.",
  url: "https://www.ruffops.com",
  email: "hello@ruffops.com",
  phoneDisplay: "(855) 783-3677",
  phoneHref: "tel:+18557833677",
  location: "Santa Monica, CA",
  serviceArea:
    "Nationwide online · On-site in Santa Monica, CA and within 10 miles",
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
  { label: "Management Platform", href: "/solutions/management-platform" },
  { label: "Digital Whiteboards", href: "/solutions/digital-whiteboards" },
  { label: "Advertising Screens", href: "/solutions/advertising" },
  { label: "Support", href: "/support" }
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
      "The command center owners and floor staff actually share — live check-ins, schedules, handoffs, alerts, and department workflows without another group chat archaeology dig.",
    bullets: [
      "Live check-ins and dog/room status",
      "Staff messaging and scheduling that sticks",
      "Reports you can read before the next rush",
      "Runs on desk, tablet, and floor devices",
      "Front desk, yard, boarding, grooming, and transport flows",
      "Role-based access so leadership and floor see the right slice"
    ],
    note: "For facilities that need the whole team on one story — not another login nobody opens.",
    cta: "See the Platform",
    href: "/solutions/management-platform",
    image: "/assets/crossover-dashboard/hero-mockup-reference.png",
    imageAlt: "ruffOPS management platform on desktop and mobile"
  },
  {
    id: "kiosk-whiteboards",
    tag: "Digital Whiteboards",
    featured: false,
    name: "Custom Kiosk Digital Whiteboards",
    price: "Lobby + department displays",
    audience: "For lobby & floor",
    summary:
      "Custom digital whiteboards for lobby TVs and staff kiosks — built around your brand, your rooms, and the Saturday crush, not a waiting-room slideshow.",
    bullets: [
      "Branded for your facility, not a template farm",
      "Synced live with the platform",
      "Something worth staring at while clients wait",
      "Checkout spotlights the floor can see across the room",
      "Staff boards per department",
      "Cast-ready for TV, tablet, and kiosk hardware"
    ],
    note: "The lobby board guests notice — and the boards your team actually runs from.",
    cta: "See the Boards",
    href: "/solutions/digital-whiteboards",
    image: "/assets/lobby-whiteboard/light-v2/reference/Fitdog-Lobby-Whiteboard-Light-Approved-Mockup.png",
    imageAlt: "Custom lobby digital whiteboard showing facility activities"
  },
  {
    id: "advertising-screens",
    tag: "Advertising",
    featured: false,
    name: "Remote Digital Whiteboard Advertising",
    price: "Rental or consulting",
    audience: "Rental or consulting",
    summary:
      "Branded lobby screens with remote content updates, ad management, and setup help — when you want the walls working without babysitting a USB stick.",
    bullets: [
      "Turnkey rental (equipment + support)",
      "Ad creation and day-to-day management",
      "Direct with your facility, not a faceless network",
      "Consulting and setup if you already own screens",
      "Scheduling for lobby and waiting areas"
    ],
    note: "Premium lobby screens without building the display stack yourself.",
    cta: "Talk Screens",
    href: "/solutions/advertising",
    image: "/assets/fitdog-lobby-whiteboard/slideshow/14-show-off-your-dog.png",
    imageAlt: "Lobby advertising display with branded pet facility content"
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
  heroComposite: "/assets/fitdog/blog-help/hero-composite.png",
  advertisingBoard: "/assets/fitdog-lobby-whiteboard/slideshow/14-show-off-your-dog.png",
  pawOrange: "/assets/fitdog/paw-outline-orange.svg",
  staffPreview: "/assets/fitdog/staff-whiteboard/themes/clear-white-preview.png"
} as const;

/** @deprecated aliases */
export const PRODUCT_SHOTS_LEGACY = PRODUCT_SHOTS;
