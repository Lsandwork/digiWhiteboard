import { ArrowRight, Hexagon, PawPrint } from "lucide-react";
import { PRIMARY_CTA, SITE } from "@/lib/ruffops-site/config";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SiteLink } from "@/components/ruffops-site/SiteLink";

export function PageHero({
  eyebrow,
  title,
  description,
  primaryLabel = PRIMARY_CTA.label,
  primaryHref = PRIMARY_CTA.href,
  secondaryLabel,
  secondaryHref
}: {
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}) {
  return (
    <section className="relative overflow-hidden pt-16 sm:pt-20">
      <div className="pointer-events-none absolute inset-0 bg-radial-accent" />
      <div className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:46px_46px] opacity-60" />
      <div className="container-page relative pb-14">
        <Reveal>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
            {title}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">{description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <SiteLink href={primaryHref} className="btn-primary">
              {primaryLabel}
              <ArrowRight className="h-4 w-4" />
            </SiteLink>
            {secondaryLabel && secondaryHref ? (
              secondaryHref.startsWith("http") || secondaryHref.startsWith("tel:") || secondaryHref.startsWith("mailto:") ? (
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

export function MidCta({
  title = "See the platform and the boards your facility would actually run.",
  description = "We’ll map management views, staff department boards, and lobby kiosk layouts to your rooms, brand, and daily flow.",
  secondaryLabel = "Explore the Platform",
  secondaryHref = "/ai-platform"
}: {
  title?: string;
  description?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}) {
  return (
    <section className="container-page py-16">
      <Reveal className="card bg-radial-electric p-8 sm:p-12">
        <h2 className="max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
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
    <section className="container-page pb-20">
      <div className="card border-ro-accent/40 bg-radial-accent p-8 text-center sm:p-14">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Ready for a lobby board that wows — and staff boards that stick?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-slate-400">
          Book a product demo to see RuffOps for management, staff, and fully custom kiosk whiteboards.
        </p>
        <SiteLink href={PRIMARY_CTA.href} className="btn-primary mt-8">
          {PRIMARY_CTA.label}
          <ArrowRight className="h-4 w-4" />
        </SiteLink>
      </div>
    </section>
  );
}

/** Shared brand mark used by header/footer. */
export function BrandMark() {
  return (
    <>
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-ro-line bg-ro-700/70 shadow-[0_0_0_1px_rgba(56,189,248,0.18),0_18px_60px_-25px_rgba(56,189,248,0.45)]">
        <Hexagon className="absolute h-9 w-9 text-ro-electric/30" strokeWidth={1.2} />
        <PawPrint className="h-4 w-4 text-ro-accent" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-sm font-bold tracking-tight text-white">{SITE.name}</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-ro-electric/80">{SITE.lockup}</span>
      </span>
    </>
  );
}
