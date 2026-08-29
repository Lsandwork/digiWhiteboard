import type { Metadata } from "next";
import { ContactForm } from "@/components/ruffops-site/ContactForm";
import { FinalCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "Dog Facility Operations Review — Contact",
  description: `Request an operations review from RuffOps. ${SITE.phoneDisplay} · ${SITE.email} · Santa Monica on-site and nationwide online.`
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Request an Operations Review"
        description="Tell us what is happening inside your dog business. We will review your operation and identify where AI-powered systems and real-world consulting can make the fastest impact."
        secondaryLabel={`Call ${SITE.phoneDisplay}`}
        secondaryHref={SITE.phoneHref}
      />
      <section className="container-page grid gap-8 pb-16 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-semibold text-white">What happens next</h2>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-slate-400">
              <li>We review your facility type, services, and biggest operational challenge.</li>
              <li>We identify the highest-impact gaps — staff, dogs, clients, or systems.</li>
              <li>We follow up with the next best step: audit, AI setup, or a focused strategy call.</li>
            </ol>
          </div>
          <div className="card p-6">
            <h2 className="font-semibold text-white">Reach us directly</h2>
            <p className="mt-3">
              <a className="text-ro-accent-soft hover:underline" href={`mailto:${SITE.email}`}>
                {SITE.email}
              </a>
            </p>
            <p className="mt-2">
              <a className="text-ro-accent-soft hover:underline" href={SITE.phoneHref}>
                {SITE.phoneDisplay}
              </a>
            </p>
            <p className="mt-4 text-sm text-slate-400">{SITE.serviceArea}</p>
            <p className="mt-2 text-sm text-slate-500">Phone support is available as part of your operations review follow-up.</p>
          </div>
        </div>
        <ContactForm />
      </section>
      <FinalCta />
    </>
  );
}
