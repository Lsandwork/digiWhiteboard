import type { Metadata } from "next";
import { ChecklistForm } from "@/components/ruffops-site/ContactForm";
import { FinalCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "Online Workshops & Resources",
  description:
    "RuffOps online workshops, private sessions, FAQ, and the Dog Facility Operations Risk Checklist. Santa Monica based, available nationwide online."
};

const faqs = [
  ["Do I need technical skills to work with you?", "No. We handle the technical setup, build the systems with your team, and train your staff so it works in real daily operations."],
  ["What types of businesses do you help?", "Dog daycares, boarding, dog hotels, grooming, rescues, trainers, transportation, and animal care companies."],
  ["How quickly will I see results?", "Most clients see operational improvements within the first 30 to 90 days."],
  ["Do you offer ongoing support?", "Yes — one-time intensives, monthly mastermind, and private strategy sessions."],
  [
    "Do you work with businesses outside Santa Monica?",
    "Yes. We provide on-site, boots-on-the-floor consulting throughout Santa Monica, CA and within 10 miles, and we work with pet businesses nationwide across the USA through online workshops and private sessions."
  ],
  ["Is this just software?", "No. We combine hands-on consulting, staff training, and AI-powered systems."]
];

export default function ResourcesPage() {
  return (
    <>
      <PageHero
        eyebrow="Online Programs"
        title="Workshops & Sessions That Turn Strategy Into Execution"
        description="Built for owners, trainers, managers, and consultants who need practical systems they can apply this week. Santa Monica based. Nationwide online."
        secondaryLabel="Call RuffOps"
        secondaryHref={SITE.phoneHref}
      />
      <section className="container-page grid gap-4 pb-10 lg:grid-cols-3">
        {[
          ["1", "Owner Control Workshop", "Reduce owner overload, delegate better, and build management rhythm that protects quality."],
          ["2", "Trainer & Team Systems", "Upgrade service delivery, communication standards, and structure for stronger consistency."],
          ["3", "Consultant Implementation", "For industry consultants who want repeatable frameworks and better client outcomes."]
        ].map(([num, title, copy]) => (
          <Reveal key={title} className="card p-6">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ro-electric font-bold text-white">
              {num}
            </span>
            <h2 className="mt-4 text-xl font-semibold text-white">{title}</h2>
            <p className="mt-3 text-sm text-slate-400">{copy}</p>
          </Reveal>
        ))}
      </section>
      <section className="container-page grid gap-4 pb-10 sm:grid-cols-2">
        {[
          ["Live Online Workshops", "Structured training with templates and implementation checkpoints."],
          ["Private Strategy Sessions", "Focused support for owners and leadership handling urgent breakdowns."],
          ["Hybrid Support", "Combine online guidance with on-site implementation when needed."],
          ["AI Toolkits", "Custom GPTs, SOP libraries, and automations you keep and reuse."]
        ].map(([title, copy]) => (
          <div key={title} className="card p-6">
            <h3 className="font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm text-slate-400">{copy}</p>
          </div>
        ))}
      </section>
      <section className="container-page pb-10" id="checklist">
        <div className="card p-8">
          <p className="eyebrow">Free Download</p>
          <h2 className="mt-4 text-2xl font-bold text-white">Dog Facility Operations Risk Checklist</h2>
          <p className="mt-3 max-w-2xl text-slate-400">
            Spot the gaps in safety, staffing, compliance, and revenue that quietly cost dog businesses every month.
          </p>
          <ChecklistForm />
        </div>
      </section>
      <section className="container-page pb-16" id="faq">
        <h2 className="text-3xl font-bold text-white">Frequently Asked Questions</h2>
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {faqs.map(([q, a]) => (
            <details key={q} className="card p-5">
              <summary className="cursor-pointer font-semibold text-white">{q}</summary>
              <p className="mt-3 text-sm text-slate-400">{a}</p>
            </details>
          ))}
        </div>
      </section>
      <FinalCta />
    </>
  );
}
