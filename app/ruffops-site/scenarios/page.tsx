import type { Metadata } from "next";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SiteLink } from "@/components/ruffops-site/SiteLink";

export const metadata: Metadata = {
  title: "Dog Daycare Operational Problems — Operational Scenarios",
  description:
    "Illustrative operational scenarios showing how AI-supported operations and real-world consulting help dog facilities catch problems earlier."
};

const scenarios = [
  {
    name: "The Missed Behavior Pattern",
    problem: "A dog is slowly escalating in group play, but notes are inconsistent across staff and shifts.",
    risk: "An avoidable incident, an injured dog or handler, and a client who loses trust overnight.",
    solution: "AI-supported behavior notes detect repeated arousal triggers and recommend decompression or group changes before it escalates.",
    outcome: "Staff intervene earlier, the dog is grouped correctly, and the incident never happens."
  },
  {
    name: "The Front Desk Breakdown",
    problem: "Clients ask questions staff cannot answer because updates are scattered across people and apps.",
    risk: "Slow, uncertain answers that make a premium facility feel disorganized.",
    solution: "Centralized dashboards make dog status, bookings, notes, and follow-ups easy to access in seconds.",
    outcome: "The front desk answers confidently and the client experience feels effortless."
  },
  {
    name: "The Boarding Handoff Gap",
    problem: "Feeding, medication, stress signals, and owner instructions are not clearly transferred between teams.",
    risk: "A missed medication or feeding instruction — the kind of mistake that ends a client relationship.",
    solution: "Structured boarding workflows make every handoff explicit and reduce missed information.",
    outcome: "Care is consistent across every shift, and nothing critical falls through the cracks."
  },
  {
    name: "The Grooming Revenue Leak",
    problem: "Dogs in daycare and boarding need grooming, but staff are not prompted to offer it.",
    risk: "Thousands in recurring grooming revenue quietly walking out the door every month.",
    solution: "AI-supported add-on prompts identify grooming opportunities at the right moment.",
    outcome: "Add-ons get offered consistently and revenue per client climbs without more marketing."
  },
  {
    name: "The Transportation Confusion",
    problem: "Drivers, front desk, and owners are not aligned on pickup and drop-off status.",
    risk: "Missed pickups, frustrated owners, and a safety exposure no one wants.",
    solution: "Driver dispatch tools improve visibility and communication across the whole route.",
    outcome: "Everyone sees the same status in real time and transport runs smoothly."
  },
  {
    name: "The Staff Training Problem",
    problem: "Experienced staff know what to do, but new staff are guessing under pressure.",
    risk: "Inconsistent care, avoidable mistakes, and burnout on your most experienced people.",
    solution: "SOPs, dashboards, role-based workflows, and AI-supported notes improve consistency.",
    outcome: "New staff ramp faster and every shift meets the same standard."
  }
];

export default function ScenariosPage() {
  return (
    <>
      <PageHero
        eyebrow="Operational Scenarios"
        title="Every Dog Facility Has Patterns. Most See Them Only After Something Goes Wrong."
        description="These scenarios show how AI-supported operations and real-world consulting can help prevent issues earlier. They are illustrative examples, not claims of specific client results."
      />
      <section className="container-page grid gap-5 pb-8 lg:grid-cols-2">
        {scenarios.map((item) => (
          <Reveal key={item.name} className="card p-6">
            <h2 className="text-xl font-semibold text-white">{item.name}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-ro-electric">Problem</dt>
                <dd className="mt-1 text-slate-400">{item.problem}</dd>
              </div>
              <div>
                <dt className="font-semibold text-amber-400">Risk</dt>
                <dd className="mt-1 text-slate-400">{item.risk}</dd>
              </div>
              <div>
                <dt className="font-semibold text-emerald-400">Solution</dt>
                <dd className="mt-1 text-slate-400">{item.solution}</dd>
              </div>
              <div>
                <dt className="font-semibold text-white">Better outcome</dt>
                <dd className="mt-1 text-slate-400">{item.outcome}</dd>
              </div>
            </dl>
            <SiteLink href="/contact" className="btn-secondary mt-5">
              Request an Operations Review
            </SiteLink>
          </Reveal>
        ))}
      </section>
      <MidCta title="See These Patterns in Your Own Facility Before They Cost You" />
      <FinalCta />
    </>
  );
}
