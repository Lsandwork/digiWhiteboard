import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SiteLink } from "@/components/ruffops-site/SiteLink";
import { PRIMARY_CTA } from "@/lib/ruffops-site/config";

type HeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

export function PageHero({
  eyebrow,
  title,
  description,
  primaryLabel = PRIMARY_CTA.label,
  primaryHref = PRIMARY_CTA.href,
  secondaryLabel,
  secondaryHref
}: HeroProps) {
  return (
    <section className="ro-page-hero">
      <div className="container-page">
        <Reveal>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <SiteLink href={primaryHref} className="btn-primary">
              {primaryLabel}
              <ArrowRight className="h-4 w-4" />
            </SiteLink>
            {secondaryLabel && secondaryHref ? (
              secondaryHref.startsWith("http") ||
              secondaryHref.startsWith("tel:") ||
              secondaryHref.startsWith("mailto:") ? (
                <a href={secondaryHref} className="btn-secondary">
                  {secondaryLabel}
                </a>
              ) : (
                <SiteLink href={secondaryHref} className="btn-secondary">
                  {secondaryLabel}
                </SiteLink>
              )
            ) : null}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

type MidCtaProps = {
  title?: string;
  description?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
};

export function MidCta({
  title = "Ready to transform your operations?",
  description = "Tell us about your facility and we’ll map the right mix of platform modules, lobby boards, and department displays.",
  secondaryLabel = "Explore Solutions",
  secondaryHref = "/solutions"
}: MidCtaProps) {
  return (
    <section className="container-page py-16">
      <Reveal className="card bg-[radial-gradient(600px_280px_at_80%_0%,rgba(56,189,248,0.14),transparent_70%)] p-8 sm:p-12">
        <h2 className="ro-display max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
        <p className="mt-4 max-w-2xl text-slate-400">{description}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <SiteLink href={PRIMARY_CTA.href} className="btn-primary">
            {PRIMARY_CTA.label}
            <ArrowRight className="h-4 w-4" />
          </SiteLink>
          <SiteLink href={secondaryHref} className="btn-secondary">
            {secondaryLabel}
          </SiteLink>
        </div>
      </Reveal>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="ro-cta-dark">
      <div className="ro-cta-dark-media" />
      <div className="ro-cta-dark-shade" />
      <div className="container-page relative text-center">
        <p className="eyebrow">Built for pet businesses. Designed for success.</p>
        <h2 className="mx-auto mt-5">Ready to transform your operations?</h2>
        <SiteLink href={PRIMARY_CTA.href} className="btn-primary mt-8">
          Get Started Today
          <ArrowRight className="h-4 w-4" />
        </SiteLink>
      </div>
    </section>
  );
}
