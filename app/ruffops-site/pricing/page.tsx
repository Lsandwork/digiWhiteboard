import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SiteLink } from "@/components/ruffops-site/SiteLink";
import { PACKAGES, SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "Pricing — Custom Solutions for Pet Facilities",
  description:
    "ruffOPS pricing is consultative and scoped to your facility. Platform, digital whiteboards, and advertising — then a real recommendation, not invented monthly tiers.",
  openGraph: {
    title: `Pricing | ${SITE.name}`,
    description:
      "We’ll scope the right mix for your business — platform, whiteboards, advertising screens, or a focused ops review."
  }
};

const faqs = [
  {
    q: "Why don’t you list monthly prices?",
    a: "Every facility has a different mix of departments, screens, locations, and staffing. Fake tier cards would lie about how engagements are scoped. We price after we understand the operation."
  },
  {
    q: "What do most facilities start with?",
    a: "Lobby whiteboards, the management platform, or a combined ops + display review. We recommend based on where coordination currently leaks."
  },
  {
    q: "Do you support multi-location businesses?",
    a: "Yes. Single-location and multi-location both come up in intake — including how displays get deployed and who gets management access."
  }
];

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="We’ll price the facility you have, not a fantasy org chart"
        description="ruffOPS work is scoped to your place — platform modules, custom digital whiteboards, advertising screens, or a focused ops review. No invented monthly rates. Clear offerings. A next step you can act on."
        secondaryLabel={`Call ${SITE.phoneDisplay}`}
        secondaryHref={SITE.phoneHref}
      />

      <section className="container-page pb-16">
        <div className="ro-pricing-grid">
          {PACKAGES.map((pkg, index) => (
            <Reveal
              key={pkg.id}
              delay={index * 60}
              className={`ro-price-card ${pkg.featured ? "ro-price-card--featured" : ""}`}
            >
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-300">{pkg.tag}</p>
              <h3>{pkg.name}</h3>
              <p className="price">{pkg.price}</p>
              <p className="mt-3 text-sm text-slate-400">{pkg.summary}</p>
              <ul>
                {pkg.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-slate-500">{pkg.note}</p>
              <SiteLink href={pkg.href} className="btn-secondary mt-6 text-sm">
                {pkg.cta}
                <ArrowRight className="h-4 w-4" />
              </SiteLink>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="ro-band-light ro-section">
        <div className="container-page max-w-3xl text-center">
          <Reveal>
            <p className="eyebrow eyebrow--light">How pricing works</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Clear process. Custom scope.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-600">
              Tell us about the facility, locations, and what hurts. We map platform and display work, then follow up
              with a recommendation — not a pressure pitch with a countdown timer.
            </p>
            <SiteLink href="/get-started" className="btn-primary mt-8">
              Request a Solution Fit
              <ArrowRight className="h-4 w-4" />
            </SiteLink>
          </Reveal>
        </div>
      </section>

      <section className="container-page py-16">
        <h2 className="text-2xl font-bold text-white">Pricing FAQ</h2>
        <div className="ro-faq mt-6 grid gap-3">
          {faqs.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <MidCta title="Ready for a recommendation that fits the building?" />
      <FinalCta />
    </>
  );
}
