import type { Metadata } from "next";
import { PageHero } from "@/components/ruffops-site/PageChrome";
import { SiteLink } from "@/components/ruffops-site/SiteLink";

export const metadata: Metadata = {
  title: "Dog Facility Operations Insights — Blog",
  description: "Operational insights for dog daycares, boarding, grooming, and multi-service pet facilities."
};

export default function InsightsPage() {
  return (
    <>
      <PageHero
        eyebrow="Insights"
        title="Dog Facility Operations Insights"
        description="Practical notes on staff systems, AI, incident prevention, and revenue for serious dog operations."
      />
      <section className="container-page grid gap-4 pb-20">
        {[
          ["Operations Risk", "The gaps that quietly cost dog businesses every month — and how to spot them early."],
          ["AI for the Front Desk", "How to use AI without creating another tool nobody opens."],
          ["Attune™ Behavioral Intelligence", "Why behavior notes only work when they are consistent across shifts."]
        ].map(([title, copy]) => (
          <article key={title} className="card p-6">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <p className="mt-2 text-sm text-slate-400">{copy}</p>
            <SiteLink href="/contact" className="mt-4 inline-block text-sm text-ro-accent-soft hover:underline">
              Talk with RuffOps about this →
            </SiteLink>
          </article>
        ))}
      </section>
    </>
  );
}
