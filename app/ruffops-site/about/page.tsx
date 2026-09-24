import type { Metadata } from "next";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "About — Operators Building for Pet Facilities",
  description:
    "ruffOPS was built by people who have lived the dog yard, the front desk, boarding chaos, incidents, and client complaints. Santa Monica on-site, nationwide online.",
  openGraph: {
    title: `About | ${SITE.name}`,
    description: "The story behind ruffOPS — software shaped by real pet facility shifts, not a pitch deck."
  }
};

const sections = [
  {
    title: "Mission",
    copy: "Give pet facilities ops tools and digital whiteboards that match how the place actually runs — so dogs stay safer, staff stop guessing, and clients see a facility that looks like it knows what it’s doing."
  },
  {
    title: "The problem we solve",
    copy: "A dog facility is daycare, boarding, grooming, training, transport, and a lobby full of opinions — at the same time. Most software never met that pressure, so teams invent it with group chats, paper, and three TVs that disagree."
  },
  {
    title: "Why ruffOPS was built",
    copy: "Better ops protect dogs, staff, clients, reputation, and revenue together. Generic SaaS rarely survives a busy Saturday. We built this because we had lived the mess."
  },
  {
    title: "Connection to the pet industry",
    copy: "Daycare, hotel, boarding, grooming, training, rescue, multi-service — the platform and whiteboards come from those workflows. Not a restaurant POS with a paw emoji taped on."
  },
  {
    title: "Vision",
    copy: "Management software, staff boards, and lobby displays that reinforce each other. One operational truth walking from the office to the yard to the front door."
  },
  {
    title: "How we work",
    copy: "On-site in Santa Monica when you need boots on the floor. Online nationwide when you don’t. We start from your real constraints, then recommend platform modules, custom boards, advertising screens, or a tight ops review."
  }
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About"
        title="Operators first. Software second."
        description="ruffOPS was built by people who have lived the dog yard, the front desk, boarding chaos, incidents, and the client call that starts with “where’s my dog?” — then wrote systems that fit that day."
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
            Operators who want modern tools without losing the plot. Single-location daycares and multi-service shops
            that take dog care and client trust seriously — and are tired of improvising the middle.
          </p>
          <p className="mt-4 max-w-3xl text-slate-400">
            Daycare, hotel, and boarding owners. Grooming and training businesses. Rescues and shelters. Transport.
            Multi-service facilities that want to grow without the wheels coming off at 5 p.m.
          </p>
          <p className="mt-6 text-sm text-slate-500">{SITE.serviceArea}</p>
        </div>
      </section>

      <MidCta />
      <FinalCta />
    </>
  );
}
