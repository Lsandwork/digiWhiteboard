import type { Metadata } from "next";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SiteLink } from "@/components/ruffops-site/SiteLink";

export const metadata: Metadata = {
  title: "Dog Daycare Operations Consulting & AI Services",
  description:
    "RuffOps consulting services for pet businesses in Santa Monica, CA and within 10 miles, plus online nationwide: operations turnaround, staff training, software integration, and AI-powered systems."
};

const services = [
  {
    name: "Dog Facility Operations Audit",
    problem: "Most owners feel the chaos but cannot name exactly where their operation is breaking down day to day.",
    improve: [
      "Current systems and software fit",
      "Staff flow and handoffs",
      "Dog handling and grouping process",
      "Client communication and follow-ups",
      "Safety procedures and incident readiness",
      "Daily bottlenecks and revenue opportunities"
    ],
    outcomes: [
      "A prioritized list of the highest-risk operational gaps",
      "Quick wins you can implement in the first week",
      "A clear roadmap for systems and AI support"
    ]
  },
  {
    name: "AI Operations Setup",
    problem: "Information lives in too many heads and too many places, so patterns are missed until something goes wrong.",
    improve: [
      "AI-supported documentation and behavior notes",
      "Staff update and shift-handoff workflows",
      "Client follow-up automation",
      "Incident prevention prompts",
      "Daily reporting and visibility"
    ],
    outcomes: [
      "Consistent notes that surface patterns early",
      "Fewer dropped follow-ups",
      "Faster, calmer daily operations"
    ]
  },
  {
    name: "Staff Training Systems",
    problem: "Experienced staff know what to do, but new staff guess — and consistency disappears under pressure.",
    improve: [
      "Role-specific SOPs",
      "Onboarding and ramp-up flows",
      "Accountability checkpoints",
      "Decision support for the yard and front desk"
    ],
    outcomes: ["New staff get productive faster", "Fewer judgment-call mistakes", "A repeatable standard across every shift"]
  },
  {
    name: "Incident Prevention",
    problem: "Incidents are usually the end of a pattern that no one documented — found too late, after the damage.",
    improve: [
      "Yard and playgroup management",
      "Boarding handoffs",
      "Dog grouping logic",
      "Behavior tracking and escalation",
      "Incident reporting and review"
    ],
    outcomes: [
      "Earlier detection of escalating dogs",
      "Clearer escalation paths for staff",
      "Documentation that protects dogs, staff, and your business"
    ]
  },
  {
    name: "Client Communication Workflows",
    problem: "Clients leave over communication, not care quality. Updates are inconsistent and reactive.",
    improve: [
      "Owner updates and report cards",
      "Incident communication",
      "Grooming and service updates",
      "Reminders and re-booking nudges"
    ],
    outcomes: ["Higher trust and retention", "Fewer “why didn’t anyone tell me” moments", "A communication standard that scales"]
  },
  {
    name: "Revenue Strategy",
    problem: "Revenue leaks quietly through missed add-ons, weak packaging, and no retention system.",
    improve: [
      "Service packaging and tiers",
      "Grooming and daycare add-ons",
      "Boarding upsells and transportation offers",
      "Memberships and retention loops"
    ],
    outcomes: ["More revenue per existing client", "Add-ons offered consistently", "Predictable recurring revenue"]
  },
  {
    name: "Transportation / Driver Routing",
    problem: "Drivers, front desk, and owners are rarely aligned on pickup and drop-off status.",
    improve: [
      "Pickup and drop-off tracking",
      "Driver route assignments",
      "Live status updates",
      "Owner transportation communication"
    ],
    outcomes: ["Fewer missed or late pickups", "Clear visibility across the team", "A safer, more professional transport experience"]
  },
  {
    name: "Custom App / Software Workflow Consulting",
    problem: "Off-the-shelf software rarely matches how a real dog facility actually runs.",
    improve: [
      "Dashboards and daily visibility",
      "Booking flows and owner portals",
      "Staff tools and role-based access",
      "AI-supported internal systems"
    ],
    outcomes: ["Software that matches your operation", "Less duplicate data entry", "Tools your team will actually use"]
  }
];

export default function ServicesPage() {
  return (
    <>
      <PageHero
        eyebrow="Services"
        title="Consulting and AI Systems for Dog Operations"
        description="Every engagement is built around the real daily pressure of a dog facility — staff handoffs, dog behavior, client communication, incidents, service packaging, safety, and execution."
      />
      <section className="container-page grid gap-6 pb-8">
        {services.map((service) => (
          <Reveal key={service.name} className="card grid gap-6 p-6 lg:grid-cols-3">
            <div>
              <h2 className="text-xl font-semibold text-white">{service.name}</h2>
              <p className="mt-3 text-sm font-medium uppercase tracking-wider text-ro-electric">The problem it solves</p>
              <p className="mt-2 text-sm text-slate-400">{service.problem}</p>
              <SiteLink href="/contact" className="btn-primary mt-5">
                Request an Operations Review
              </SiteLink>
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-500">What we improve</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {service.improve.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-500">Example outcomes</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {service.outcomes.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card p-6">
            <h3 className="font-semibold text-white">SOP Development</h3>
            <p className="mt-2 text-sm text-slate-400">Document the way your best shift runs so every shift can repeat it.</p>
          </div>
          <div className="card p-6">
            <h3 className="font-semibold text-white">Dog Behavior Documentation Systems</h3>
            <p className="mt-2 text-sm text-slate-400">Structured behavior notes that detect arousal and stress trends over time.</p>
          </div>
        </div>
      </section>
      <MidCta />
      <FinalCta />
    </>
  );
}
