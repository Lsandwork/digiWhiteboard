import type { Metadata } from "next";
import { ContactForm } from "@/components/ruffops-site/ContactForm";
import { FinalCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "Get Started",
  description: `Start with ruffOPS — tell us about your pet facility and what hurts. ${SITE.phoneDisplay} · ${SITE.email}.`,
  openGraph: {
    title: `Get Started | ${SITE.name}`,
    description:
      "Ask for a recommendation on the ruffOPS management platform, digital whiteboards, or advertising displays."
  }
};

export default async function GetStartedPage({
  searchParams
}: {
  searchParams: Promise<{ submit?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <PageHero
        eyebrow="Get Started"
        title="Tell us how the place actually runs"
        description="A few details on your business and what you want to fix. We’ll look at the operation and come back with a next step — platform, whiteboards, advertising screens, or a focused ops review."
        secondaryLabel={`Call ${SITE.phoneDisplay}`}
        secondaryHref={SITE.phoneHref}
      />

      <section className="container-page grid gap-8 pb-16 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-semibold text-white">What happens next</h2>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-slate-400">
              <li>We read your facility type, locations, and what you care about first.</li>
              <li>We point at the highest-impact starting move for your team and screens.</li>
              <li>We follow up within one business day with a clear recommendation — not a fog machine.</li>
            </ol>
          </div>
          <div className="card p-6">
            <h2 className="font-semibold text-white">Prefer to talk first?</h2>
            <p className="mt-3 text-sm text-slate-400">
              Call{" "}
              <a className="text-orange-300 hover:underline" href={SITE.phoneHref}>
                {SITE.phoneDisplay}
              </a>{" "}
              or email{" "}
              <a className="text-orange-300 hover:underline" href={`mailto:${SITE.email}`}>
                {SITE.email}
              </a>
              .
            </p>
            <p className="mt-4 text-sm text-slate-500">{SITE.serviceArea}</p>
          </div>
        </div>
        <ContactForm defaultFormType="Get Started Request" submitLabel="Get Started" initialSuccess={params.submit === "ok"} />
      </section>

      <FinalCta />
    </>
  );
}
