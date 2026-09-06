import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, CheckCircle2, LayoutDashboard, MonitorPlay, RadioTower } from "lucide-react";
import { FinalCta } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SiteLink } from "@/components/ruffops-site/SiteLink";
import { PACKAGES, PRIMARY_CTA, PRODUCT_SHOTS, SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: `${SITE.name} | Smarter Operations. Happier Pets.`,
  description: SITE.description,
  openGraph: {
    title: `${SITE.name} | Smarter Operations. Happier Pets.`,
    description: SITE.description
  }
};

const solutionCards = [
  { icon: LayoutDashboard, ...PACKAGES[0] },
  { icon: MonitorPlay, ...PACKAGES[1] },
  { icon: RadioTower, ...PACKAGES[2] }
];

export default async function RuffopsHomePage({
  searchParams
}: {
  searchParams: Promise<{ submit?: string }>;
}) {
  await searchParams;

  return (
    <>
      <section className="ro-hero">
        <div className="ro-hero-media">
          <Image
            src={PRODUCT_SHOTS.heroDogs}
            alt="Happy dogs representing premium pet facility care"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
        <div className="ro-hero-shade" />
        <div className="container-page ro-hero-grid">
          <Reveal className="ro-hero-copy">
            <p className="eyebrow">The ultimate operations platform for pet businesses</p>
            <h1>
              Smarter Operations.
              <span className="text-gradient-accent"> Happier Pets.</span>
            </h1>
            <p className="lede">
              ruffOPS is the all-in-one solution that keeps your team connected, your operations running smoothly, and
              your clients engaged — from anywhere, at any time.
            </p>
            <div className="ro-hero-actions">
              <SiteLink href={PRIMARY_CTA.href} className="btn-primary">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </SiteLink>
              <SiteLink href="/solutions" className="btn-secondary">
                Explore Solutions
              </SiteLink>
            </div>
            <ul className="ro-check-list ro-dark-list mt-8 max-w-xl">
              {[
                "Management + staff command center",
                "Custom lobby & department kiosk whiteboards",
                "Cast-ready TV layouts built for real facilities"
              ].map((item) => (
                <li key={item}>
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={100} className="ro-hero-stage">
            <div className="ro-device-desktop">
              <Image
                src={PRODUCT_SHOTS.dashboardHero}
                alt="ruffOPS operations dashboard on desktop"
                fill
                priority
                className="object-cover object-top"
                sizes="(max-width: 1024px) 100vw, 48vw"
              />
            </div>
            <div className="ro-device-phone">
              <Image
                src={PRODUCT_SHOTS.staffPreview}
                alt="ruffOPS staff board on mobile"
                fill
                className="object-cover object-top"
                sizes="160px"
              />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="ro-band-light ro-section">
        <div className="container-page">
          <Reveal className="ro-section-head">
            <p className="eyebrow eyebrow--light">Powerful solutions. One platform.</p>
            <h2>Everything Your Business Needs</h2>
            <p className="lede mt-4">
              ruffOPS connects the software your team runs on with the screens your lobby and departments depend on —
              without generic tools that ignore how pet facilities actually work.
            </p>
          </Reveal>

          <div className="ro-solution-grid">
            {solutionCards.map((card, index) => (
              <Reveal key={card.id} delay={index * 70} className="ro-solution-card">
                <span className="meta">{card.audience}</span>
                <h3>{card.name}</h3>
                <p>{card.summary}</p>
                <ul className="ro-check-list">
                  {card.bullets.slice(0, 4).map((item) => (
                    <li key={item}>
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                      {item}
                    </li>
                  ))}
                </ul>
                <SiteLink href={card.href} className="card-cta inline-flex items-center gap-2">
                  {card.cta}
                  <ArrowRight className="h-4 w-4" />
                </SiteLink>
              </Reveal>
            ))}
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            <Reveal className="ro-shot">
              <Image
                src={PRODUCT_SHOTS.lobbyBoard}
                alt="Custom lobby digital whiteboard mockup"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </Reveal>
            <Reveal delay={80} className="ro-shot">
              <Image
                src={PRODUCT_SHOTS.lobbyCheckout}
                alt="Lobby checkout whiteboard layout"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="ro-cta-dark">
        <div className="ro-cta-dark-media">
          <Image src={PRODUCT_SHOTS.lobbyDark} alt="" fill className="object-cover opacity-40" sizes="100vw" />
        </div>
        <div className="ro-cta-dark-shade" />
        <div className="container-page relative text-center">
          <Reveal>
            <p className="eyebrow">Built for pet businesses. Designed for success.</p>
            <h2 className="mx-auto mt-5">Ready to transform your operations?</h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-300">
              See how ruffOPS fits your facility — platform modules, lobby boards, department displays, or a focused
              operations review.
            </p>
            <SiteLink href={PRIMARY_CTA.href} className="btn-primary mt-8">
              Get Started Today
              <ArrowRight className="h-4 w-4" />
            </SiteLink>
          </Reveal>
        </div>
      </section>

      <FinalCta />
    </>
  );
}
