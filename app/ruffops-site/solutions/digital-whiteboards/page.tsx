import type { Metadata } from "next";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { PRODUCT_SHOTS, SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "Custom Kiosk Digital Whiteboards",
  description:
    "Fully custom ruffOPS digital whiteboards for lobby TVs and staff kiosks — live dog information, lobby activities, check-in/checkout experiences, themes, and cast-ready layouts.",
  openGraph: {
    title: `Custom Kiosk Digital Whiteboards | ${SITE.name}`,
    description: "Lobby and department digital whiteboards designed for pet facilities — branded, cast-ready, and built for real daily flow."
  }
};

const features = [
  "Lobby check-in and check-out showcase boards",
  "Live dog information and lobby activity displays",
  "Staff whiteboards for every department",
  "Brand-matched themes, motion, and content zones",
  "Cast-ready layouts for TV, tablet, and kiosk hardware",
  "Always-on displays readable across the room",
  "Checkout spotlight and idle slideshow experiences",
  "Theme support for light, dark, and coastal facility looks"
];

const useCases = [
  ["Lobby guest experience", "Show arriving and departing dogs, facility energy, and branded lobby moments that make the front of house feel intentional — not like a waiting room TV."],
  ["Checkout moments", "Highlight dogs ready for pickup with clear, room-readable layouts so clients and staff share the same visual cue during rush periods."],
  ["Department staff boards", "Give yard, boarding, grooming, and transport teams dedicated boards that match how each department works."],
  ["Brand-matched facilities", "Themes, motion, and content zones are designed around your brand and rooms — not a one-size-fits-all template."]
];

export default function DigitalWhiteboardsPage() {
  return (
    <>
      <PageHero
        eyebrow="For lobby activities"
        title="Custom Kiosk Digital Whiteboards"
        description="Fully custom digital whiteboards for lobby TVs and staff kiosks — live updates, dog information, lobby activities, checkout experiences, and brand-matched themes built for real pet facilities."
        secondaryLabel="Advertising Screens"
        secondaryHref="/solutions/advertising"
      />

      <section className="container-page grid gap-4 pb-12 lg:grid-cols-2">
        <Reveal className="ro-shot">
          <Image src={PRODUCT_SHOTS.lobbyBoard} alt="Approved Fitdog lobby whiteboard light mockup" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" priority />
        </Reveal>
        <Reveal delay={80} className="ro-shot">
          <Image src={PRODUCT_SHOTS.lobbyCheckout} alt="Lobby checkout board layout reference" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
        </Reveal>
      </section>

      <section className="container-page pb-16">
        <Reveal>
          <p className="eyebrow">What you get</p>
          <h2 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl">Boards guests notice — and boards staff actually run from</h2>
        </Reveal>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <ul className="ro-check-list">
            {features.map((item) => (
              <li key={item} className="!text-slate-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                {item}
              </li>
            ))}
          </ul>
          <div className="ro-feature-grid">
            {useCases.map(([title, copy]) => (
              <article key={title} className="ro-feature-card">
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ro-band-light ro-section">
        <div className="container-page">
          <Reveal>
            <p className="eyebrow eyebrow--light">Real product visuals</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Designed for cast TVs and always-on kiosks</h2>
            <p className="mt-4 max-w-2xl text-slate-600">These are real ruffOPS / Digi-Board lobby and staff board references from the product — not invented SaaS illustrations.</p>
          </Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              [PRODUCT_SHOTS.lobbyCoastal, "Coastal light lobby TV background"],
              [PRODUCT_SHOTS.lobbyDark, "Dark active lobby TV background"],
              [PRODUCT_SHOTS.staffPreview, "Staff whiteboard clear-white theme"]
            ].map(([src, alt], index) => (
              <Reveal key={alt} delay={index * 60} className="ro-shot">
                <Image src={src} alt={alt} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <MidCta secondaryLabel="Platform Overview" secondaryHref="/solutions/management-platform" />
      <FinalCta />
    </>
  );
}
