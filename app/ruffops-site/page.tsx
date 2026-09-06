import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, CheckCircle2, Play } from "lucide-react";
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
            alt="Happy dogs in a warm pet facility lobby"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[center_30%]"
          />
        </div>
        <div className="ro-hero-shade" />
        <div className="container-page ro-hero-grid">
          <Reveal className="ro-hero-copy">
            <p className="eyebrow">The ultimate operations platform for pet businesses</p>
            <h1>
              Smarter Operations.
              <br />
              <span className="text-white">Happier Pets.</span>
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
              {/* No official marketing video in-repo — link to real product walkthrough instead of a fake player. */}
              <a href="#solutions" className="btn-video">
                <span className="btn-video-icon" aria-hidden>
                  <Play className="h-3.5 w-3.5 fill-current" />
                </span>
                See Walkthrough
              </a>
            </div>
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
                sizes="180px"
              />
            </div>
          </Reveal>
        </div>
      </section>

      <section id="solutions" className="ro-band-light ro-section">
        <div className="container-page">
          <Reveal className="ro-section-head text-center mx-auto">
            <p className="eyebrow eyebrow--light">Powerful solutions. One platform.</p>
            <h2>Everything Your Business Needs</h2>
          </Reveal>

          <div className="ro-solution-grid">
            {PACKAGES.map((card, index) => (
              <Reveal key={card.id} delay={index * 70} className="ro-solution-card">
                <div className="ro-solution-card-media">
                  <Image
                    src={card.image}
                    alt={card.imageAlt}
                    fill
                    className="object-cover object-top"
                    sizes="(max-width: 900px) 100vw, 33vw"
                  />
                </div>
                <div className="ro-solution-card-body">
                  <span className="meta">{card.audience}</span>
                  <h3>
                    <span className="ro-paw" aria-hidden />
                    {card.name}
                  </h3>
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
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="ro-cta-dark">
        <div className="ro-cta-dark-media">
          <Image
            src={PRODUCT_SHOTS.heroComposite}
            alt=""
            fill
            className="object-cover opacity-45"
            sizes="100vw"
          />
        </div>
        <div className="ro-cta-dark-shade" />
        <div className="container-page relative text-center">
          <Reveal>
            <p className="eyebrow">Built for pet businesses. Designed for success.</p>
            <h2 className="mx-auto mt-5">Ready to transform your operations?</h2>
            <SiteLink href={PRIMARY_CTA.href} className="btn-primary mt-8">
              Get Started Today
              <ArrowRight className="h-4 w-4" />
            </SiteLink>
          </Reveal>
        </div>
      </section>
    </>
  );
}
