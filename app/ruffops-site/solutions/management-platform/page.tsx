import type { Metadata } from "next";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { PRODUCT_SHOTS, SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "Custom SaaS Management Platform",
  description:
    "ruffOPS management platform for pet facility owners, managers, and staff — live status, schedules, handoffs, alerts, and department workflows in one place.",
  openGraph: {
    title: `Custom SaaS Management Platform | ${SITE.name}`,
    description: "One operations command center for dog daycares, boarding hotels, grooming, training, and multi-service pet facilities."
  }
};

const capabilities = [
  ["Management dashboards", "Give owners and managers a clear view of facility status, priorities, and what needs attention across departments."],
  ["Staff workspaces", "Floor teams get role-appropriate views for check-ins, tasks, handoffs, and live dog or room status — without digging through chat threads."],
  ["Live facility visibility", "Track check-in / check-out flow and operational status so the front desk and floor stay aligned during busy windows."],
  ["Department workflows", "Support front desk, yard, boarding, grooming, and transport workflows with the same connected system instead of siloed tools."],
  ["Shift handoffs & alerts", "Reduce dropped context between shifts with clearer handoffs, alerts, and shared operational notes."],
  ["Multi-device access", "Run from office desktops, lobby tablets, and floor devices so the same source of truth travels with the team."]
];

const faqs = [
  ["Is this a generic pet software clone?", "No. ruffOPS is built around real facility operations — management and staff coordination, department workflows, and the digital whiteboards your lobby and rooms already depend on."],
  ["Can it work with our existing booking tools?", "Many facilities already use booking or CRM tools. We design around your current stack and focus on operational visibility, staff coordination, and display workflows where those tools fall short."],
  ["Who is it for?", "Dog daycares, boarding hotels, grooming and training businesses, rescues, transportation services, and multi-service pet facilities that need managers and floor staff on the same page."]
];

export default function ManagementPlatformPage() {
  return (
    <>
      <PageHero
        eyebrow="For managers & staff"
        title="Custom SaaS Management Platform"
        description="One operations command center that keeps owners, managers, and staff connected — live status, schedules, handoffs, alerts, and department workflows in a single system built for pet facilities."
        secondaryLabel="Digital Whiteboards"
        secondaryHref="/solutions/digital-whiteboards"
      />

      <section className="container-page pb-12">
        <Reveal className="ro-shot mx-auto max-w-5xl">
          <Image src={PRODUCT_SHOTS.dashboardHero} alt="ruffOPS operations dashboard reference" fill className="object-cover object-top" sizes="(max-width: 1024px) 100vw, 64rem" priority />
        </Reveal>
      </section>

      <section className="container-page pb-16">
        <Reveal>
          <p className="eyebrow">Capabilities</p>
          <h2 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl">Built for how pet facilities actually run</h2>
        </Reveal>
        <div className="ro-feature-grid cols-3 mt-8">
          {capabilities.map(([title, copy]) => (
            <article key={title} className="ro-feature-card">
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ro-band-light ro-section">
        <div className="container-page grid gap-10 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <p className="eyebrow eyebrow--light">Why facilities choose it</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Less chaos between the desk, the yard, and leadership</h2>
            <ul className="ro-check-list mt-6">
              {[
                "Owners see what is happening without hovering over every shift",
                "Managers get clearer priorities and fewer missed handoffs",
                "Staff work from shared status instead of tribal knowledge",
                "Lobby and department boards can reflect the same live operational truth"
              ].map((item) => (
                <li key={item}>
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={80} className="ro-shot">
            <Image src={PRODUCT_SHOTS.staffPreview} alt="Staff whiteboard theme preview" fill className="object-cover object-top" sizes="(max-width: 1024px) 100vw, 50vw" />
          </Reveal>
        </div>
      </section>

      <section className="container-page py-16">
        <h2 className="text-2xl font-bold text-white">FAQ</h2>
        <div className="ro-faq mt-6 grid gap-3">
          {faqs.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <MidCta secondaryLabel="Compare Solutions" secondaryHref="/solutions" />
      <FinalCta />
    </>
  );
}
