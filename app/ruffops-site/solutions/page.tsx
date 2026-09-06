import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SiteLink } from "@/components/ruffops-site/SiteLink";
import { PACKAGES, PRODUCT_SHOTS, SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "Solutions — Platform, Digital Whiteboards & Advertising",
  description:
    "Explore ruffOPS solutions for pet businesses: custom SaaS management platform, lobby and department digital whiteboards, and remote advertising display services.",
  openGraph: {
    title: `Solutions | ${SITE.name}`,
    description: "One connected ecosystem for pet facility operations, custom kiosk whiteboards, and lobby advertising screens."
  }
};

export default function SolutionsPage() {
  return (
    <>
      <PageHero
        eyebrow="Solutions"
        title="One platform. Screens that match how you operate."
        description="ruffOPS connects management and staff workflows with fully custom digital whiteboards for lobby TVs and every department — plus optional advertising display services when you need screens deployed and managed remotely."
        secondaryLabel="See Pricing"
        secondaryHref="/pricing"
      />

      <section className="container-page pb-16">
        <div className="ro-solution-grid">
          {PACKAGES.map((pkg, index) => (
            <Reveal key={pkg.id} delay={index * 60} className="ro-solution-card !bg-[#0f131c] !border-[var(--ro-line)]">
              <span className="meta !text-orange-300">{pkg.audience}</span>
              <h3 className="!text-white">{pkg.name}</h3>
              <p className="!text-slate-400">{pkg.summary}</p>
              <ul className="ro-check-list">
                {pkg.bullets.slice(0, 5).map((item) => (
                  <li key={item} className="!text-slate-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                    {item}
                  </li>
                ))}
              </ul>
              <SiteLink href={pkg.href} className="card-cta mt-auto inline-flex items-center gap-2 !text-orange-300">
                {pkg.cta}
                <ArrowRight className="h-4 w-4" />
              </SiteLink>
            </Reveal>
          ))}
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          <Reveal className="ro-shot">
            <Image src={PRODUCT_SHOTS.lobbyBoard} alt="ruffOPS lobby digital whiteboard" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
          </Reveal>
          <Reveal delay={80} className="ro-shot">
            <Image src={PRODUCT_SHOTS.dashboardHero} alt="ruffOPS operations dashboard" fill className="object-cover object-top" sizes="(max-width: 1024px) 100vw, 50vw" />
          </Reveal>
        </div>
      </section>

      <MidCta
        title="Not sure where to start?"
        description="Most facilities begin with either the management platform, lobby whiteboards, or a focused operations review. We’ll help you choose based on how your team actually works day to day."
      />
      <FinalCta />
    </>
  );
}
