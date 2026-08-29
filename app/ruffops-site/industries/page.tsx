import type { Metadata } from "next";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SiteLink } from "@/components/ruffops-site/SiteLink";

export const metadata: Metadata = {
  title: "Dog Facility Consulting by Industry",
  description:
    "RuffOps helps dog daycares, hotels, boarding, grooming, rescues, shelters, trainers, transportation, and multi-service facilities operate smarter."
};

const industries = [
  {
    name: "Dog Daycares",
    blurb: "Group play, staff ratios, behavior notes, yard management, owner updates, incident prevention.",
    pain: [
      "High-arousal playgroups with inconsistent notes",
      "Staff ratios and grouping decisions made on the fly",
      "Owners asking for updates staff cannot quickly answer"
    ],
    help: [
      "Behavior documentation that flags escalating dogs early",
      "Clear grouping and yard-management protocols",
      "Faster, consistent owner communication"
    ]
  },
  {
    name: "Dog Hotels",
    blurb: "Premium boarding, overnight care, stress behavior, and white-glove owner communication.",
    pain: [
      "Premium expectations with thin overnight coverage",
      "Stress behavior that goes undocumented",
      "Inconsistent updates for high-value clients"
    ],
    help: ["Overnight workflows and check protocols", "Stress and behavior tracking", "Concierge-level communication systems"]
  },
  {
    name: "Boarding Facilities",
    blurb: "Boarding handoffs, feeding, medication, stress behavior, cleaning schedules, overnight care.",
    pain: [
      "Feeding and medication instructions lost between teams",
      "Stress signals missed overnight",
      "Cleaning and care schedules drifting under volume"
    ],
    help: ["Structured boarding handoff workflows", "Medication and feeding checklists", "Reliable overnight documentation"]
  },
  {
    name: "Grooming Centers",
    blurb: "Add-on strategy, scheduling, owner communication, grooming notes, daycare integration.",
    pain: [
      "Add-on opportunities missed at the front desk",
      "Scheduling gaps and no-shows",
      "Grooming notes disconnected from daycare/boarding"
    ],
    help: ["Add-on prompts tied to daycare and boarding", "Tighter scheduling and reminders", "Connected grooming records"]
  },
  {
    name: "Dog Rescues",
    blurb: "Intake notes, behavior tracking, foster communication, adoption readiness, risk patterns.",
    pain: [
      "Intake and behavior history scattered across volunteers",
      "Foster communication gaps",
      "Adoption readiness decisions without clear data"
    ],
    help: [
      "Centralized intake and behavior tracking",
      "Foster and volunteer communication flows",
      "Risk-pattern visibility for safer placements"
    ]
  },
  {
    name: "Animal Shelters",
    blurb: "High volume, staff consistency, behavior documentation, and safe handling at scale.",
    pain: [
      "High volume with rotating staff and volunteers",
      "Inconsistent behavior documentation",
      "Safety risks from missed information"
    ],
    help: [
      "Standardized documentation at scale",
      "Role-based workflows for staff and volunteers",
      "Earlier detection of risk patterns"
    ]
  },
  {
    name: "Training Facilities",
    blurb: "Training notes, owner homework, progress tracking, behavior insights, follow-up communication.",
    pain: [
      "Progress notes that do not carry between sessions",
      "Owner homework rarely followed up",
      "No clear view of behavior trends"
    ],
    help: [
      "Structured training and progress records",
      "Owner follow-up and homework reminders",
      "Behavior insights across the program"
    ]
  },
  {
    name: "Transportation Services",
    blurb: "Driver routing, pickup/drop-off status, owner communication, safety protocols, route visibility.",
    pain: [
      "Drivers, desk, and owners out of sync",
      "No live pickup/drop-off visibility",
      "Safety protocols inconsistently followed"
    ],
    help: ["Driver dispatch and routing visibility", "Live status updates for owners and staff", "Documented safety protocols"]
  },
  {
    name: "Multi-Service Facilities",
    blurb: "Connecting daycare, boarding, grooming, training, transportation, and retail into one system.",
    pain: [
      "Each service running on its own island",
      "Data and revenue falling between departments",
      "No single operational picture"
    ],
    help: [
      "One connected operational system",
      "Cross-service add-on and revenue visibility",
      "Unified dog, client, and staff records"
    ]
  }
];

export default function IndustriesPage() {
  return (
    <>
      <PageHero
        eyebrow="Industries"
        title="Built for Every Serious Dog Operation"
        description="Different facilities, same truth: the business runs on dogs, staff, and clients moving through your building every day. Here is how we help each one."
      />
      <section className="container-page grid gap-5 pb-8 lg:grid-cols-2">
        {industries.map((industry) => (
          <Reveal key={industry.name} className="card p-6">
            <h2 className="text-xl font-semibold text-white">{industry.name}</h2>
            <p className="mt-2 text-sm text-slate-400">{industry.blurb}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-red-300">Pain points</p>
                <ul className="mt-2 space-y-2 text-sm text-slate-400">
                  {industry.pain.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">How we help</p>
                <ul className="mt-2 space-y-2 text-sm text-slate-400">
                  {industry.help.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <SiteLink href="/contact" className="btn-secondary mt-5">
              Request an Operations Review
            </SiteLink>
          </Reveal>
        ))}
      </section>
      <MidCta />
      <FinalCta />
    </>
  );
}
