import type { Metadata } from "next";
import Image from "next/image";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { PRODUCT_SHOTS, SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "Why ruffOPS",
  description:
    "Why pet businesses choose ruffOPS — built specifically for dog daycares, boarding, grooming, and multi-service facilities with real operational expertise and a connected display ecosystem.",
  openGraph: {
    title: `Why ruffOPS | ${SITE.name}`,
    description: "Built for pet facility operations — not generic SaaS bolted onto a different industry."
  }
};

const pillars = [
  {
    title: "Built specifically for pet businesses",
    copy: "Dog daycares, boarding hotels, grooming, training, transport, and multi-service facilities have workflows generic software never modeled. ruffOPS starts from that reality."
  },
  {
    title: "Operational expertise",
    copy: "The product is shaped by people who understand front desk pressure, yard tempo, boarding handoffs, incidents, and client expectations — not slide-deck theory."
  },
  {
    title: "Connected ecosystem",
    copy: "Management tools, staff boards, lobby TVs, and department displays work as one system so guests and teams see the same operational truth."
  },
  {
    title: "Custom solutions",
    copy: "Themes, content zones, department layouts, and platform modules are tailored to how your facility actually runs."
  },
  {
    title: "Customizable whiteboards",
    copy: "Lobby and staff boards are cast-ready, brand-matched, and designed to stay readable across the room during real rush periods."
  },
  {
    title: "Modern technology with restraint",
    copy: "We use modern tooling where it helps operators move faster — without inventing flashy features that do not survive a busy Saturday."
  }
];

export default function WhyRuffopsPage() {
  return (
    <>
      <PageHero
        eyebrow="Why ruffOPS"
        title="Because pet facilities are not generic offices"
        description="ruffOPS exists to connect the people running the facility with the screens clients and staff rely on — using systems shaped by real dog-business operations."
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
              Operations fall apart in the gaps between tools
            </h2>
            <p className="mt-4 text-slate-600">
              Booking software may capture appointments. Chat apps may carry messages. Spreadsheets may hold notes. None of
              that guarantees the lobby board, the floor team, and leadership are aligned when the next dog walks through
              the door.
            </p>
            <p className="mt-4 text-slate-600">
              ruffOPS closes those gaps with a management platform and custom digital whiteboards designed around pet
              facility rhythm — not borrowed from another industry.
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
