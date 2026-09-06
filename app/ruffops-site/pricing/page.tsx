import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SiteLink } from "@/components/ruffops-site/SiteLink";
import { PACKAGES, SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "Pricing — Custom Solutions for Pet Facilities",
  description:
    "ruffOPS pricing is consultative and tailored to your facility. Explore platform, digital whiteboard, and advertising offerings — then request a solution fit for your operation.",
  openGraph: {
    title: `Pricing | ${SITE.name}`,
    description:
      "Let’s build the right solution for your business — platform, whiteboards, advertising screens, or a focused operations review."
  }
};

const faqs = [
  {
    q: "Why don’t you list monthly prices?",
    a: "Every facility has a different mix of departments, screens, locations, and staffing models. Publishing invented tiers would not reflect how engagements are scoped. We price after understanding your operation."
  },
  {
    q: "What do most facilities start with?",
    a: "Many begin with lobby whiteboards, the management platform, or a combined operations + display review. We recommend based on where coordination breaks down today."
  },
  {
    q: "Do you support multi-location businesses?",
    a: "Yes. We discuss single-location and multi-location needs during the intake process, including display deployment and management access patterns."
  }
];

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Let’s build the right solution for your business"
        description="ruffOPS engagements are scoped to your facility — platform modules, custom digital whiteboards, advertising screens, or a focused operations review. No invented monthly rates. Clear offerings. Real next steps."
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
              Transparent process, tailored scope
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-600">
              Tell us about your facility, locations, and priorities. We map the right mix of platform and display work,
              then follow up with a clear recommendation — not a pressure pitch.
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

      <MidCta title="Ready for a tailored recommendation?" />
      <FinalCta />
    </>
  );
}
