import type { Metadata } from "next";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "About — Operators Building for Pet Facilities",
  description:
    "ruffOPS was created by operators who have lived the dog yard, the front desk, boarding chaos, incidents, and client complaints. Santa Monica on-site, nationwide online.",
  openGraph: {
    title: `About | ${SITE.name}`,
    description: "The story behind ruffOPS — built by people who understand real pet facility operations."
  }
};

const sections = [
  {
    title: "Mission",
    copy: "Help pet businesses run with clearer operations, stronger staff coordination, and digital whiteboards that match how facilities actually work — so dogs, teams, and clients all benefit."
  },
  {
    title: "The problem we solve",
    copy: "Dog facilities manage daycare, boarding, grooming, training, transportation, and client expectations at once. Most tools were never designed for that pressure, so teams improvise with chat threads, paper, and disconnected screens."
  },
  {
    title: "Why ruffOPS was built",
    copy: "We created this company because better operations protect dogs, staff, clients, reputation, and revenue at the same time — and generic software rarely understands the daily reality of a pet facility."
  },
  {
    title: "Connection to the pet industry",
    copy: "Our work is grounded in dog daycare, hotel, boarding, grooming, training, rescue, and multi-service environments. The platform and whiteboards are shaped by those workflows, not borrowed from another vertical."
  },
  {
    title: "Vision",
    copy: "A connected operations ecosystem where management software, staff boards, and lobby displays reinforce each other — so every location can run with more clarity and less chaos."
  },
  {
    title: "How we work",
    copy: "Santa Monica on-site support and nationwide online engagement. We start from your real facility constraints, then recommend platform modules, custom boards, advertising screens, or a focused operations review."
  }
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About"
        title="Operators first. Technology second."
        description="ruffOPS was created by people who have lived the dog yard, the front desk, boarding chaos, incidents, and client complaints — then built systems that fit that world."
        secondaryLabel="Why ruffOPS"
        secondaryHref="/why-ruffops"
      />

      <section className="container-page grid gap-4 pb-10 lg:grid-cols-2">
        {sections.map((item, index) => (
          <Reveal key={item.title} delay={index * 40}>
            <article className="card h-full p-6">
              <h2 className="text-xl font-semibold text-white">{item.title}</h2>
              <p className="mt-3 text-slate-400">{item.copy}</p>
            </article>
          </Reveal>
        ))}
      </section>

      <section className="container-page pb-10">
        <div className="card p-8">
          <h2 className="text-2xl font-bold text-white">Who we help</h2>
          <p className="mt-3 max-w-3xl text-slate-400">
            Operators ready to modernize without losing control. From single-location daycares to multi-service facilities,
            we help teams that take dog care and client trust seriously.
          </p>
          <p className="mt-4 max-w-3xl text-slate-400">
            Dog daycare, hotel, and boarding owners; grooming and training businesses; rescues and shelters; transportation
            services; multi-service facilities; and operators who want to grow without the wheels coming off.
          </p>
          <p className="mt-6 text-sm text-slate-500">{SITE.serviceArea}</p>
        </div>
      </section>

      <MidCta />
      <FinalCta />
    </>
  );
}
