import type { Metadata } from "next";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "Support",
  description: `Get help with ruffOPS products and accounts. Email ${SITE.email}, call ${SITE.phoneDisplay}, or request product support for platform and digital whiteboard questions.`,
  openGraph: {
    title: `Support | ${SITE.name}`,
    description: "Product support, account assistance, and FAQs for ruffOPS facilities."
  }
};

const channels = [
  {
    title: "Email support",
    copy: `Reach the team at ${SITE.email} for product questions, account assistance, and follow-ups on existing engagements.`
  },
  {
    title: "Phone support",
    copy: `Call ${SITE.phoneDisplay}. Phone support is available as part of operations review follow-up and active customer assistance.`
  },
  {
    title: "Product guidance",
    copy: "Need help with platform modules, lobby boards, department displays, or cast setups? Tell us which product area and we will route the right next step."
  },
  {
    title: "New facility inquiries",
    copy: "If you are evaluating ruffOPS for the first time, use Get Started so we can capture facility details and respond with a tailored recommendation."
  }
];

const faqs = [
  {
    q: "How do I log into the staff platform?",
    a: "Use the Login button in the site header, which opens the real Digi-Board / staff authentication experience. We do not replace working authentication with a marketing form."
  },
  {
    q: "Who do I contact about lobby or staff whiteboard displays?",
    a: "Email or call us with your facility name and which board or TV is affected. Include whether the issue is content, casting, theme, or hardware when possible."
  },
  {
    q: "Do you offer on-site help?",
    a: `${SITE.serviceArea}. Online support is available nationwide.`
  },
  {
    q: "Is there a public ticket portal?",
    a: "Support is handled through the real channels above. We intentionally do not add a fake ticketing system to the marketing site."
  }
];

export default function SupportPage() {
  return (
    <>
      <PageHero
        eyebrow="Support"
        title="Help for teams running ruffOPS"
        description="Product support, account assistance, and guidance for facilities using the management platform and digital whiteboards — through the same real channels we use every day."
        secondaryLabel={`Email ${SITE.email}`}
        secondaryHref={`mailto:${SITE.email}`}
      />

      <section className="container-page pb-16">
        <div className="ro-feature-grid">
          {channels.map((item) => (
            <Reveal key={item.title}>
              <article className="ro-feature-card h-full">
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <div className="card mt-10 p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-white">Direct contacts</h2>
          <p className="mt-4">
            <a className="text-orange-300 hover:underline" href={`mailto:${SITE.email}`}>
              {SITE.email}
            </a>
          </p>
          <p className="mt-2">
            <a className="text-orange-300 hover:underline" href={SITE.phoneHref}>
              {SITE.phoneDisplay}
            </a>
          </p>
          <p className="mt-4 text-sm text-slate-400">{SITE.serviceArea}</p>
        </div>
      </section>

      <section className="container-page pb-16">
        <h2 className="text-2xl font-bold text-white">FAQ</h2>
        <div className="ro-faq mt-6 grid gap-3">
          {faqs.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <MidCta title="Need help getting started?" secondaryLabel="Get Started" secondaryHref="/get-started" />
      <FinalCta />
    </>
  );
}
