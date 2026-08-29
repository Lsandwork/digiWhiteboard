import type { Metadata } from "next";
import { FinalCta, MidCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SiteLink } from "@/components/ruffops-site/SiteLink";

export const metadata: Metadata = {
  title: "AI Software for Dog Daycares — The AI Dog Operations Command Center",
  description:
    "The RuffOps AI Dog Operations Command Center: one operational picture across dogs, staff, services, transportation, bookings, incidents, and revenue."
};

const features = [
  ["Owner Dashboard", "Owners view dog profiles, bookings, updates, service history, and facility communication."],
  ["Admin Center", "Manage users, roles, permissions, dogs, bookings, service settings, staff access, and operational controls."],
  ["Dog Profiles", "Centralized dog records with behavior notes, care instructions, service history, and owner details."],
  ["AI Behavior Notes", "AI-supported behavior documentation that detects patterns, arousal trends, stress signals, and follow-up needs."],
  ["Driver Dispatch", "Track pickup and drop-off status, route assignments, driver notes, and transportation visibility."],
  ["Booking Engine", "Service selection for daycare, boarding, grooming, training, hikes, transportation, and special add-ons."],
  ["Grooming Add-Ons", "Identify grooming opportunities and connect grooming with daycare, boarding, and transportation."],
  ["Staff Roles", "Role-based access for admin, staff, drivers, owners, and managers."],
  ["Incident Visibility", "Improve documentation, escalation, communication, and follow-through."],
  ["Revenue Tracking", "Surface service opportunities, add-ons, memberships, and missed revenue."]
];

export default function AiPlatformPage() {
  return (
    <>
      <PageHero
        eyebrow="AI Operations Platform"
        title="The AI Dog Operations Command Center"
        description="Built around the real daily pressure of dog facilities, not generic business software."
      />
      <section className="container-page grid items-start gap-10 pb-10 lg:grid-cols-[1.2fr_1fr]">
        <Reveal>
          <h2 className="text-2xl font-bold text-white">One operational picture across your whole facility</h2>
          <p className="mt-4 text-slate-400">
            See dogs, staff, services, transportation, bookings, incidents, and revenue opportunities in one place — with AI
            quietly watching for the patterns your team is too busy to catch.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {["Dogs", "Staff", "Services", "Transportation", "Bookings", "Incidents", "Revenue", "Communication"].map(
              (item) => (
                <span key={item} className="rounded-full border border-ro-line bg-ro-800/70 px-3 py-1 text-xs text-slate-300">
                  {item}
                </span>
              )
            )}
          </div>
        </Reveal>
        <Reveal className="card p-5">
          <div className="mb-4 flex items-center justify-between text-sm">
            <span>Live Operations</span>
            <span className="text-emerald-400">AI active</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Daily dog count", "84", "12 checking in"],
              ["Staff coverage", "6 / 7", "1 break rotation"],
              ["Incident risk", "Low", "2 to watch"],
              ["Decompression", "3 dogs", "flagged by AI"],
              ["Grooming add-ons", "9", "opportunities today"],
              ["Transport", "On route", "4 pickups left"],
              ["Owner updates", "7", "pending send"],
              ["Revenue ops", "$1,240", "surfaced this week"]
            ].map(([label, value, note]) => (
              <div key={label} className="rounded-xl border border-ro-line bg-ro-900/60 p-3">
                <p className="text-[11px] text-slate-500">{label}</p>
                <p className="text-lg font-bold text-white">{value}</p>
                <p className="text-[11px] text-slate-400">{note}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-400">
            Risk score <strong className="text-white">92 / 100</strong> · AI pattern detection running
          </p>
        </Reveal>
      </section>
      <section className="container-page pb-10">
        <h2 className="text-2xl font-bold text-white">Everything a serious dog operation needs</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {features.map(([title, copy]) => (
            <Reveal key={title} className="card card-hover p-5">
              <h3 className="font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm text-slate-400">{copy}</p>
            </Reveal>
          ))}
        </div>
      </section>
      <section className="container-page grid gap-4 pb-8 lg:grid-cols-3">
        {[
          ["How AI helps", ["Organizes scattered notes into a clear record", "Detects behavior, arousal, and stress patterns", "Flags risk and follow-ups before they slip", "Surfaces add-on and revenue opportunities"]],
          ["How staff use it", ["Fast, structured documentation on every shift", "Clear handoffs between teams", "Role-based views that match each job", "Decision support instead of guesswork"]],
          ["How owners benefit", ["Timely, consistent updates they can trust", "A clear view of their dog’s day and history", "Smoother bookings and transportation", "A premium, professional experience"]]
        ].map(([title, items]) => (
          <div key={String(title)} className="card p-6">
            <h3 className="font-semibold text-white">{title}</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-400">
              {(items as string[]).map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <MidCta title="Show Me What AI Can Fix in My Facility" secondaryLabel="Talk to Us" secondaryHref="/contact" />
      <p className="container-page pb-6 text-center">
        <SiteLink href="/attune" className="text-ro-accent-soft hover:underline">
          Explore Attune™ behavioral intelligence →
        </SiteLink>
      </p>
      <FinalCta />
    </>
  );
}
