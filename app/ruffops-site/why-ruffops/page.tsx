import type { Metadata } from "next";
import Image from "next/image";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { PRODUCT_SHOTS, SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "Why ruffOPS",
  description:
    "Why pet facilities choose ruffOPS — built for dog daycares, boarding, grooming, and multi-service ops with a connected display stack, not generic SaaS with a pet filter.",
  openGraph: {
    title: `Why ruffOPS | ${SITE.name}`,
    description: "Built for pet facility operations — not office software wearing a leash."
  }
};

const pillars = [
  {
    title: "Built for pet facilities, period",
    copy: "Daycare, boarding, grooming, training, transport, multi-service — workflows generic software never bothered to model. We started there."
  },
  {
    title: "People who’ve worked the floor",
    copy: "Front desk crush, yard tempo, boarding handoffs, incidents, the client who wants an update right now. Not slide-deck empathy."
  },
  {
    title: "One connected stack",
    copy: "Management tools, staff boards, lobby TVs, department displays — same operational truth, different rooms."
  },
  {
    title: "Custom where it counts",
    copy: "Themes, content zones, department layouts, platform modules shaped around how your building actually moves dogs."
  },
  {
    title: "Whiteboards that survive rush hour",
    copy: "Lobby and staff boards are cast-ready, brand-matched, and readable from across the room when six cars pull up at once."
  },
  {
    title: "Modern tech with a governor",
    copy: "We use new tooling when it helps operators move faster — not to invent demos that die on a busy Saturday."
  }
];

export default function WhyRuffopsPage() {
  return (
    <>
      <PageHero
        eyebrow="Why ruffOPS"
        title="Because a dog facility is not a quiet office with snacks"
        description="ruffOPS exists to put the people running the place and the screens clients stare at on the same page — with systems shaped by real dog-business days."
        secondaryLabel="About the Company"
        secondaryHref="/about"
      />

      <section className="container-page pb-16">
        <div className="ro-feature-grid cols-3">
          {pillars.map((item) => (
            <Reveal key={item.title}>
              <article className="ro-feature-card h-full">
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="ro-band-light ro-section">
        <div className="container-page grid gap-10 lg:grid-cols-2 lg:items-center">
          <Reveal>
            <p className="eyebrow eyebrow--light">The problem we solve</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Ops dies in the gaps between tools
            </h2>
            <p className="mt-4 text-slate-600">
              Booking software holds appointments. Chat apps hold opinions. Spreadsheets hold notes someone meant to
              update. None of that guarantees the lobby board, the floor team, and leadership agree when the next dog
              walks in.
            </p>
            <p className="mt-4 text-slate-600">
              ruffOPS closes those gaps with a management platform and custom digital whiteboards built around pet
              facility rhythm — not borrowed from another industry and hoped.
            </p>
          </Reveal>
          <Reveal delay={80} className="ro-shot">
            <Image
              src={PRODUCT_SHOTS.lobbyBoard}
              alt="Lobby whiteboard showing facility-ready display design"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </Reveal>
        </div>
      </section>

      <MidCta />
      <FinalCta />
    </>
  );
}
