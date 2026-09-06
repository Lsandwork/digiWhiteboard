import type { Metadata } from "next";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { PRODUCT_SHOTS, SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: "Remote Digital Whiteboard Advertising",
  description:
    "ruffOPS advertising and display services for pet facilities — screen deployment, remote content updates, advertising management, scheduling, and setup consulting.",
  openGraph: {
    title: `Remote Digital Whiteboard Advertising | ${SITE.name}`,
    description: "Deploy branded lobby screens with remote updates, content scheduling, and setup consulting for pet businesses."
  }
};

const offerings = [
  ["Screen deployment", "Guidance on placement, mounting, and hardware choices so lobby and waiting-area screens actually work in a busy facility."],
  ["Advertising management", "Keep promotional and informational content current without relying on someone physically updating every display."],
  ["Remote updates", "Push content changes remotely so seasonal promos, service highlights, and facility messaging stay fresh."],
  ["Content scheduling", "Schedule lobby and waiting-area content for peak hours, quieter periods, and campaign windows."],
  ["Equipment support", "Recommendations and support for the screens and cast devices that fit your rooms — not a one-device-fits-all kit."],
  ["Consulting & setup", "Rental or consulting options for single-location and multi-location facilities that want a premium display experience without building the stack alone."]
];

export default function AdvertisingPage() {
  return (
    <>
      <PageHero
        eyebrow="Rental or consulting services"
        title="Remote Digital Whiteboard Advertising"
        description="Deploy branded display screens with remote content updates, advertising management, and setup consulting — ideal when you want premium lobby screens without building the display stack alone."
        secondaryLabel="Talk With Us"
        secondaryHref="/get-started"
      />

      <section className="container-page pb-12">
        <Reveal className="ro-shot mx-auto max-w-4xl">
          <Image src={PRODUCT_SHOTS.lobbyCoastal} alt="Lobby TV display background for pet facility advertising" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 56rem" priority />
        </Reveal>
      </section>

      <section className="container-page pb-16">
        <Reveal>
          <p className="eyebrow">Service scope</p>
          <h2 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl">Screens that stay useful after install day</h2>
          <p className="mt-4 max-w-2xl text-slate-400">Advertising and display support connects to the same operational DNA as ruffOPS whiteboards — content that fits a pet facility, not a generic digital signage template.</p>
        </Reveal>
        <div className="ro-feature-grid cols-3 mt-8">
          {offerings.map(([title, copy]) => (
            <article key={title} className="ro-feature-card">
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ro-band-light ro-section">
        <div className="container-page max-w-3xl">
          <Reveal>
            <p className="eyebrow eyebrow--light">How engagements usually start</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Let’s build the right screen plan</h2>
            <ul className="ro-check-list mt-6">
              {[
                "Review your lobby and waiting-area layout",
                "Decide rental vs consulting based on your team capacity",
                "Map content needs: promos, service education, and brand presence",
                "Connect screens to your broader whiteboard and operations goals when relevant"
              ].map((item) => (
                <li key={item}>
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <MidCta secondaryLabel="Digital Whiteboards" secondaryHref="/solutions/digital-whiteboards" />
      <FinalCta />
    </>
  );
}
