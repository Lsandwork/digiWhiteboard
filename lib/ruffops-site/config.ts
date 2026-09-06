export const SITE = {
  name: "RuffOps",
  shortName: "RuffOps",
  lockup: "Operations Platform",
  tagline: "The operations platform and digital whiteboard system for modern dog facilities.",
  description:
    "RuffOps is the SaaS operations platform for dog daycares, boarding hotels, grooming, training, and multi-service pet facilities. Give management and staff one command center — plus fully custom kiosk digital whiteboards for lobby TVs and every department.",
  url: "https://www.ruffops.com",
  email: "hello@ruffops.com",
  phoneDisplay: "(855) 783-3677",
  phoneHref: "tel:+18557833677",
  location: "Santa Monica, CA",
  serviceArea:
    "Built for dog facilities nationwide · On-site support in Santa Monica, CA and within 10 miles",
  clientLoginHref: "https://www.ruffops.com/client-login.html",
  attuneDemoHref: "https://www.ruffops.com/attune/demo/",
  behaviorAddonHref: "/assets/downloads/ruffops-dog-behavior-ai-addon.zip"
} as const;

/** Primary header nav — kept short so the bar never collapses into distortion. */
export const NAV = [
  { label: "Platform", href: "/ai-platform" },
  { label: "Whiteboards", href: "/services" },
  { label: "Industries", href: "/industries" },
  { label: "Attune™", href: "/attune" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" }
] as const;

export const PRIMARY_CTA = {
  label: "Book a Product Demo",
  href: "/contact"
} as const;

export const PACKAGES = [
  {
    id: "ops-platform",
    tag: "SaaS Core",
    featured: true,
    name: "RuffOps Platform",
    price: "Custom facility pricing",
    summary:
      "One operations command center for owners, managers, and staff — schedules, handoffs, alerts, SOPs, and live facility status in one place.",
    bullets: [
      "Management dashboards and staff workspaces",
      "Live alerts, shift handoffs, and task clarity",
      "Department workflows for front desk, yard, boarding, grooming, and transport",
      "Owner communication and follow-up systems",
      "Role-based access for leadership and floor teams"
    ],
    note: "Built for facilities that need the whole team aligned — not another forgotten login.",
    cta: "See the Platform"
  },
  {
    id: "kiosk-whiteboards",
    tag: "Signature Product",
    featured: false,
    name: "Custom Kiosk Whiteboards",
    price: "Lobby + department displays",
    summary:
      "Fully custom digital whiteboards for lobby TVs and staff kiosks — designed for your brand, your rooms, and your daily flow.",
    bullets: [
      "Lobby check-in / check-out showcase boards",
      "Staff whiteboards for every department",
      "Cast-ready layouts for TV, tablet, and kiosk hardware",
      "Brand-matched themes, motions, and content zones",
      "Always-on displays that stay readable across the room"
    ],
    note: "The board guests see in the lobby — and the boards your team actually runs from.",
    cta: "Design My Boards"
  },
  {
    id: "strategy-session",
    tag: "Fast Clarity",
    featured: false,
    name: "Operations + Display Review",
    price: "$497 per session",
    summary:
      "A focused working session to map your facility flow, staff needs, and which RuffOps boards + platform modules will create the fastest lift.",
    bullets: [
      "90-minute private review",
      "Lobby and staff display recommendations",
      "Ops bottlenecks and staffing friction audit",
      "Clear rollout roadmap",
      "Best next-step plan for software, boards, or both"
    ],
    note: "Ideal before you invest in screens, hardware, or a full rollout.",
    cta: "Book My Review"
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

/** Product imagery — always render inside fixed aspect frames (never stretch). */
export const PRODUCT_SHOTS = {
  lobbyBoard:
    "/assets/lobby-whiteboard/light-v2/reference/Fitdog-Lobby-Whiteboard-Light-Approved-Mockup.png",
  lobbyCheckout:
    "/assets/fitdog-lobby-whiteboard/09-mockup-reference/fitdog-lobby-checkout-board-layout-reference-with-provided-logo.png",
  lobbyCoastal:
    "/assets/fitdog-lobby-whiteboard/02-backgrounds/fitdog-lobby-tv-bg-coastal-light-1920x1080.png",
  lobbyDark:
    "/assets/fitdog-lobby-whiteboard/02-backgrounds/fitdog-lobby-tv-bg-dark-active-1920x1080.png"
} as const;
