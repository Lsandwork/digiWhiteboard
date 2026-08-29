export const SITE = {
  name: "RuffOps",
  shortName: "RuffOps",
  lockup: "Dog Operations Consulting",
  tagline: "AI-powered operations consulting for modern dog businesses.",
  description:
    "AI-powered dog business consulting for dog daycares, boarding facilities, dog hotels, rescues, grooming centers, and animal care businesses. Improve operations, staff systems, safety, client communication, revenue, and facility performance.",
  url: "https://www.ruffops.com",
  email: "hello@ruffops.com",
  phoneDisplay: "(855) 783-3677",
  phoneHref: "tel:+18557833677",
  location: "Santa Monica, CA",
  serviceArea:
    "On-site pet business consulting in Santa Monica, CA and within 10 miles · Online consulting nationwide across the USA",
  clientLoginHref: "https://www.ruffops.com/client-login.html",
  attuneDemoHref: "https://www.ruffops.com/attune/demo/",
  behaviorAddonHref: "/assets/downloads/ruffops-dog-behavior-ai-addon.zip"
} as const;

export const NAV = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/services" },
  { label: "AI Platform", href: "/ai-platform" },
  { label: "Attune™", href: "/attune" },
  { label: "Industries", href: "/industries" },
  { label: "Resources", href: "/resources" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" }
] as const;

export const PRIMARY_CTA = {
  label: "Request an Operations Review",
  href: "/contact"
} as const;

export const PACKAGES = [
  {
    id: "ai-starter-intensive",
    tag: "Best for Quick Wins",
    featured: false,
    name: "AI Starter Intensive",
    price: "Starting at $1,997",
    summary:
      "A focused 2-week sprint for dog businesses that need immediate help with messy workflows, slow follow-up, staff confusion, owner communication, or manual admin work.",
    bullets: [
      "Operations, software, forms, and workflow audit",
      "Custom AI tools, GPTs, scripts, SOPs, and templates",
      "Lead follow-up system to reduce missed inquiries",
      "Staff workflow cleanup for front desk, daycare, grooming, boarding, or transport",
      "Quick-win action plan your team can actually use"
    ],
    note: "Best if things are messy and you need fast improvement without a long-term commitment.",
    cta: "Fix My Workflow"
  },
  {
    id: "operational-mastermind",
    tag: "Most Popular",
    featured: true,
    name: "Operational Mastermind",
    price: "Starting at $497/month",
    summary:
      "Ongoing consulting and AI implementation for dog businesses that want RuffOps involved month after month — improving systems, staff execution, revenue, owner communication, and daily decision-making.",
    bullets: [
      "Monthly operations coaching and strategy calls",
      "Custom AI tools, SOPs, checklists, scripts, and workflow library",
      "Support for daycare, boarding, grooming, training, transport, and rescue operations",
      "Revenue improvement opportunities and smarter service packaging",
      "Live Q&A and implementation support",
      "Priority support by phone, email, or video"
    ],
    note: "For businesses that want a real operations partner — not another software login collecting dust.",
    cta: "Build My Ops System"
  },
  {
    id: "strategy-session",
    tag: "Strategic Clarity",
    featured: false,
    name: "1:1 Strategy Session",
    price: "$497 per session",
    summary:
      "A private strategy session for owners who need a clear outside perspective on one major operational problem, growth decision, staffing issue, software mess, or revenue opportunity.",
    bullets: [
      "90-minute private strategy session",
      "Review of your biggest operational bottleneck",
      "Custom recommendations based on your business model",
      "Clear action roadmap after the call",
      "Best next-step plan for systems, staffing, AI, or revenue"
    ],
    note: "Perfect when you need clarity before spending more money, hiring more people, or changing systems.",
    cta: "Book My Strategy Call"
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
