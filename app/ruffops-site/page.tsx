import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowRight,
  CheckCircle2,
  LayoutDashboard,
  MonitorPlay,
  ShieldCheck,
  Sparkles,
  Users,
  Wallpaper
} from "lucide-react";
import { ContactForm } from "@/components/ruffops-site/ContactForm";
import { FinalCta } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SiteLink } from "@/components/ruffops-site/SiteLink";
import { PACKAGES, PRIMARY_CTA, PRODUCT_SHOTS, SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: `${SITE.name} | Operations Platform & Custom Kiosk Whiteboards for Dog Facilities`,
  description: SITE.description
};

const pillars = [
  {
    icon: LayoutDashboard,
    title: "Management command center",
    copy: "Owners and managers see live facility status, staffing, risk, and revenue signals without chasing radios or spreadsheets."
  },
  {
    icon: Users,
    title: "Staff workspaces that stick",
    copy: "Every department gets clear boards, handoffs, and task context — so floor teams execute the same way every shift."
  },
  {
    icon: MonitorPlay,
    title: "Custom lobby kiosks",
    copy: "Brand-matched digital whiteboards for lobby TVs that showcase check-ins, check-outs, and the energy of your facility."
  },
  {
    icon: Wallpaper,
    title: "Department staff boards",
    copy: "Purpose-built displays for front desk, yard, boarding, grooming, training, and transport — not generic slideshows."
  }
];

const departments = [
  ["Lobby", "Guest-facing check-in / check-out boards"],
  ["Front Desk", "Arrivals, notes, and owner messaging"],
  ["Daycare Yard", "Group status and safety cues"],
  ["Boarding", "Suite occupancy and care plans"],
  ["Grooming", "Queue, timing, and handoff boards"],
  ["Transport", "Route boards and live van status"]
] as const;

export default async function RuffopsHomePage({
  searchParams
}: {
  searchParams: Promise<{ submit?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <section className="ro-hero">
        <div className="ro-hero-glow" aria-hidden />
        <div className="ro-hero-grid" aria-hidden />
        <div className="container-page ro-hero-inner">
          <Reveal className="ro-hero-copy">
            <p className="eyebrow">
              <Sparkles className="h-3.5 w-3.5" />
              SaaS for management &amp; staff · Custom kiosk whiteboards
            </p>
            <p className="ro-brand-mark">{SITE.name}</p>
            <h1 className="ro-hero-title">
              Run the facility from one platform.
              <span className="text-gradient-accent"> Put the lobby on a board worth watching.</span>
            </h1>
            <p className="ro-hero-lede">
              RuffOps gives owners, managers, and staff a shared operations system — plus fully custom digital whiteboards
              for lobby TVs and every department kiosk.
            </p>
            <div className="ro-hero-actions">
              <SiteLink href={PRIMARY_CTA.href} className="btn-primary">
                {PRIMARY_CTA.label}
                <ArrowRight className="h-4 w-4" />
              </SiteLink>
              <SiteLink href="/ai-platform" className="btn-secondary">
                Explore the platform
              </SiteLink>
            </div>
            <ul className="ro-hero-proof">
              {["Management + staff roles", "Lobby & department kiosks", "Cast-ready TV layouts"].map((item) => (
                <li key={item}>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120} className="ro-hero-stage">
            <div className="ro-device-frame ro-device-frame--hero">
              <div className="ro-device-bezel">
                <Image
                  src={PRODUCT_SHOTS.lobbyBoard}
                  alt="RuffOps lobby digital whiteboard on a facility television"
                  fill
                  className="ro-device-screen"
                  priority
                  sizes="(max-width: 1024px) 100vw, 52vw"
                />
              </div>
              <div className="ro-device-caption">
                <span className="ro-live-dot" aria-hidden />
                Lobby kiosk · Custom brand theme · Always-on TV
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="container-page ro-logo-strip" aria-label="Built for">
        <p>Built for dog daycares, boarding hotels, grooming, training, rescue, and multi-service facilities</p>
      </section>

      <section className="container-page ro-section" id="platform">
        <Reveal className="ro-section-head">
          <p className="eyebrow">What RuffOps is</p>
          <h2>
            Not another generic dashboard.
            <span className="text-gradient-accent"> An operations system your whole team can run.</span>
          </h2>
          <p>
            Management gets the command view. Staff get department boards. Guests see a polished lobby display. Everything
            stays readable on a 55&quot; TV across the room.
          </p>
        </Reveal>
        <div className="ro-pillar-grid">
          {pillars.map((pillar, index) => (
            <Reveal key={pillar.title} delay={index * 60} className="ro-pillar-card">
              <span className="ro-pillar-icon">
                <pillar.icon className="h-5 w-5" />
              </span>
              <h3>{pillar.title}</h3>
              <p>{pillar.copy}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="ro-section ro-section--stage" id="whiteboards">
        <div className="container-page">
          <div className="ro-split">
            <Reveal>
              <p className="eyebrow">Custom kiosk whiteboards</p>
              <h2>
                Lobby boards that wow.
                <span className="text-gradient-accent"> Staff boards that actually get used.</span>
              </h2>
              <p>
                Every facility gets layouts designed for its brand, rooms, and daily rhythm — check-in theater for the
                lobby, operational clarity for the floor.
              </p>
              <ul className="ro-check-list">
                {[
                  "Full-bleed TV compositions that never look stretched or squashed",
                  "Brand colors, type, and motion matched to your facility",
                  "Separate experiences for lobby guests vs. staff departments",
                  "Cast / kiosk ready for wall mounts, desks, and reception counters"
                ].map((item) => (
                  <li key={item}>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <SiteLink href="/services" className="btn-primary">
                  See whiteboard options
                </SiteLink>
                <SiteLink href="/contact" className="btn-secondary">
                  Request a board mockup
                </SiteLink>
              </div>
            </Reveal>
            <Reveal delay={80} className="ro-shot-stack">
              <div className="ro-device-frame">
                <div className="ro-device-bezel">
                  <Image
                    src={PRODUCT_SHOTS.lobbyCheckout}
                    alt="RuffOps lobby checkout whiteboard layout"
                    fill
                    className="ro-device-screen"
                    sizes="(max-width: 1024px) 100vw, 46vw"
                  />
                </div>
              </div>
              <div className="ro-device-frame ro-device-frame--offset">
                <div className="ro-device-bezel">
                  <Image
                    src={PRODUCT_SHOTS.lobbyDark}
                    alt="RuffOps dark lobby television theme"
                    fill
                    className="ro-device-screen"
                    sizes="(max-width: 1024px) 100vw, 40vw"
                  />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="container-page ro-section" id="departments">
        <Reveal className="ro-section-head">
          <p className="eyebrow">Every department</p>
          <h2>
            One platform.
            <span className="text-gradient-accent"> A board for each room that needs one.</span>
          </h2>
        </Reveal>
        <div className="ro-dept-grid">
          {departments.map(([name, copy], index) => (
            <Reveal key={name} delay={index * 40} className="ro-dept-card">
              <h3>{name}</h3>
              <p>{copy}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="ro-section ro-section--cinema" aria-label="Product showcase">
        <div className="container-page">
          <Reveal className="ro-cinema">
            <div className="ro-cinema-bezel">
              <Image
                src={PRODUCT_SHOTS.lobbyCoastal}
                alt="RuffOps coastal light lobby television background"
                fill
                className="ro-device-screen"
                sizes="100vw"
              />
            </div>
            <div className="ro-cinema-copy">
              <ShieldCheck className="h-5 w-5 text-sky-300" />
              <p>
                Designed for real lobbies and real staff rooms — readable across the room, branded to your facility, and
                built to stay on all day.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="container-page ro-section" id="offers">
        <Reveal className="ro-section-head">
          <p className="eyebrow">Ways to start</p>
          <h2>
            Pick the path that fits
            <span className="text-gradient-accent"> your facility right now.</span>
          </h2>
        </Reveal>
        <div className="ro-offer-grid">
          {PACKAGES.map((pack) => (
            <Reveal
              key={pack.id}
              id={pack.id}
              className={`ro-offer-card ${pack.featured ? "ro-offer-card--featured" : ""}`}
            >
              <span className={`eyebrow ${pack.featured ? "eyebrow--accent" : ""}`}>{pack.tag}</span>
              <h3>{pack.name}</h3>
              <p className="ro-offer-summary">{pack.summary}</p>
              <ul>
                {pack.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="ro-offer-price">{pack.price}</p>
              <p className="ro-offer-note">{pack.note}</p>
              <SiteLink href="/contact" className={pack.featured ? "btn-primary" : "btn-secondary"}>
                {pack.cta}
              </SiteLink>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="container-page ro-section" id="contact">
        <div className="ro-contact-wrap">
          <Reveal>
            <p className="eyebrow">Talk with RuffOps</p>
            <h2>
              See your lobby board.
              <span className="text-gradient-accent"> See your staff command view.</span>
            </h2>
            <p>
              Tell us about your facility and we&apos;ll map the right mix of platform modules and custom kiosk displays —
              no generic pitch deck.
            </p>
            <ul className="ro-check-list mt-6">
              {[
                "Product walkthrough for owners and managers",
                "Whiteboard concepts for lobby + departments",
                "Clear rollout plan for software and screens"
              ].map((item) => (
                <li key={item}>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={80}>
            <ContactForm defaultFormType="Product Demo Request" initialSuccess={params.submit === "ok"} />
          </Reveal>
        </div>
      </section>

      <FinalCta />
    </>
  );
}
