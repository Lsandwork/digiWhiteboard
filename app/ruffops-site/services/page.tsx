import type { Metadata } from "next";
import Image from "next/image";
import { CheckCircle2, MonitorSmartphone, Tv, Wallpaper } from "lucide-react";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SiteLink } from "@/components/ruffops-site/SiteLink";
import { PRODUCT_SHOTS } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "Custom Kiosk Digital Whiteboards for Dog Facilities",
  description:
    "Fully custom lobby and department digital whiteboards for dog daycares, boarding hotels, grooming, and multi-service pet facilities — cast-ready for TV and kiosk hardware."
};

const boardTypes = [
  {
    icon: Tv,
    name: "Lobby TV Whiteboards",
    problem: "Your lobby TV either shows a static logo, a stretched slideshow, or nothing that matches your brand.",
    improve: [
      "Check-in / check-out showcase compositions",
      "Brand-matched themes, type, and motion",
      "Full-bleed layouts that stay readable across the room",
      "Always-on cast layouts for 1080p and 4K TVs"
    ],
    outcomes: [
      "A lobby display guests actually notice",
      "Professional first impression at every arrival",
      "No more stretched, squashed, or generic TV content"
    ]
  },
  {
    icon: MonitorSmartphone,
    name: "Staff Department Kiosks",
    problem: "Floor teams still run from paper lists, radios, and tribal knowledge that resets every shift.",
    improve: [
      "Front desk arrival and notes boards",
      "Yard / group status boards",
      "Boarding suite occupancy and care boards",
      "Grooming queue and transport route boards"
    ],
    outcomes: [
      "Clear handoffs between departments",
      "Fewer missed details under pressure",
      "Boards staff actually keep on-screen"
    ]
  },
  {
    icon: Wallpaper,
    name: "Brand-Matched Themes",
    problem: "Off-the-shelf dashboards look like someone else's product in your lobby.",
    improve: [
      "Facility colors, logo lockups, and typography",
      "Light, dark, and coastal / premium atmospheres",
      "Motion and hierarchy tuned for TV distance",
      "Separate guest-facing vs. staff-facing experiences"
    ],
    outcomes: [
      "Screens that feel native to your brand",
      "Consistent look across lobby and staff rooms",
      "A premium presence without a design team on payroll"
    ]
  }
];

export default function ServicesPage() {
  return (
    <>
      <PageHero
        eyebrow="Custom Kiosk Whiteboards"
        title="Lobby boards that wow. Staff boards that stick."
        description="Fully custom digital whiteboards for lobby TVs and every department kiosk — designed for your brand, rooms, and daily flow."
        secondaryLabel="Book a product demo"
        secondaryHref="/contact"
      />

      <section className="container-page pb-10">
        <Reveal className="ro-device-frame mx-auto max-w-5xl">
          <div className="ro-device-bezel">
            <Image
              src={PRODUCT_SHOTS.lobbyBoard}
              alt="Approved RuffOps lobby whiteboard mockup"
              fill
              className="ro-device-screen"
              sizes="(max-width: 1024px) 100vw, 64rem"
              priority
            />
          </div>
          <p className="ro-device-caption">
            <span className="ro-live-dot" aria-hidden />
            Lobby kiosk mockup · Fixed 16:9 frame · Never stretched
          </p>
        </Reveal>
      </section>

      <section className="container-page grid gap-6 pb-8">
        {boardTypes.map((service) => (
          <Reveal key={service.name} className="card grid gap-6 p-6 lg:grid-cols-3">
            <div>
              <span className="ro-pillar-icon mb-3 inline-flex">
                <service.icon className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-semibold text-white">{service.name}</h2>
              <p className="mt-3 text-sm font-medium uppercase tracking-wider text-ro-electric">The problem it solves</p>
              <p className="mt-2 text-sm text-slate-400">{service.problem}</p>
              <SiteLink href="/contact" className="btn-primary mt-5">
                Design my boards
              </SiteLink>
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-500">What we build</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {service.improve.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-500">Example outcomes</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                {service.outcomes.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}
      </section>

      <section className="container-page grid gap-4 pb-12 sm:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-semibold text-white">Hardware-ready layouts</h3>
          <p className="mt-2 text-sm text-slate-400">
            Designed for wall-mounted TVs, reception counters, and staff tablets — with safe margins and TV-distance
            typography.
          </p>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold text-white">Works with the RuffOps platform</h3>
          <p className="mt-2 text-sm text-slate-400">
            Pair custom boards with the management + staff operations platform, or start with displays and expand into
            software.
          </p>
        </div>
      </section>

      <MidCta
        title="Want to see your lobby on a board before you commit?"
        description="We’ll sketch the right lobby + department board set for your rooms, brand, and daily rhythm."
        secondaryLabel="Explore the Platform"
        secondaryHref="/ai-platform"
      />
      <FinalCta />
    </>
  );
}
