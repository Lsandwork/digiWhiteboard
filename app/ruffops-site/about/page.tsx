import type { Metadata } from "next";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "About — Real Dog Facility Operators, Not Generic Consultants",
  description:
    "RuffOps was created by operators who have lived the dog yard, the front desk, boarding chaos, incidents, and client complaints. Santa Monica on-site, nationwide online."
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About"
        title="We Are Operators First, Consultants Second"
        description="We created this company because dog facilities are managing daycare, boarding, grooming, training, transportation, and client expectations all at once — and most software was never built for that reality."
      />
      <section className="container-page grid gap-4 pb-10 lg:grid-cols-2">
        {[
          ["Why we exist", "Dog businesses are under more pressure than ever. Owners expect better communication, staff need clearer systems, and dogs arrive with more complex behavior needs — all at once."],
          ["What we believe", "Most tools do not understand the real daily pressure of a dog operation. Better operations protect dogs, staff, clients, reputation, and revenue at the same time."],
          ["Why AI matters", "Used correctly, AI organizes information, detects patterns, supports staff decisions, and exposes hidden gaps and revenue — so experienced operators can act earlier."],
          ["Why experience matters more", "AI without facility experience is just noise. We have lived the dog yard, the front desk, boarding chaos, incidents, and client complaints, so the systems we build actually fit."]
        ].map(([title, copy]) => (
          <article key={title} className="card p-6">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <p className="mt-3 text-slate-400">{copy}</p>
          </article>
        ))}
      </section>
      <section className="container-page pb-10">
        <div className="card p-8">
          <h2 className="text-2xl font-bold text-white">Who we help</h2>
          <p className="mt-3 max-w-3xl text-slate-400">
            Operators ready to modernize without losing control. From single-location daycares to multi-service facilities,
            we help teams that take dog care and client trust seriously.
          </p>
          <p className="mt-4 max-w-3xl text-slate-400">
            Dog daycare, hotel, and boarding owners; grooming and training businesses; rescues and shelters; transportation
            services; multi-service facilities; and operators who want to grow without the wheels coming off. If you run a
            real dog operation, we built this for you.
          </p>
          <p className="mt-6 text-sm text-slate-500">{SITE.serviceArea}</p>
        </div>
      </section>
      <MidCta />
      <FinalCta />
    </>
  );
}
