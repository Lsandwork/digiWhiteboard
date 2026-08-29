import type { Metadata } from "next";
import {
  Bell,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  Settings,
  Shield,
  Sparkles,
  Target,
  Users
} from "lucide-react";
import { ContactForm, ChecklistForm } from "@/components/ruffops-site/ContactForm";
import { FinalCta } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";
import { SiteLink } from "@/components/ruffops-site/SiteLink";
import { PACKAGES, PRIMARY_CTA, SITE } from "@/lib/ruffops-site/config";

export const metadata: Metadata = {
  title: `${SITE.name} | Pet Business Consulting in Santa Monica, CA + AI Operations Nationwide`,
  description: SITE.description
};

const pains = [
  { icon: Settings, title: "Too Many Tools", copy: "Overwhelmed by disconnected apps." },
  { icon: MessageSquare, title: "Generic AI Output", copy: "Answers that don’t fit your business." },
  { icon: Clock, title: "Wasted Time", copy: "Hours lost testing instead of running." },
  { icon: FileText, title: "Missing SOPs", copy: "Important processes live in your head." },
  { icon: Bell, title: "Weak Follow-Up", copy: "Leads slip through the cracks." },
  { icon: Users, title: "Inconsistent Training", copy: "Staff perform differently every shift." },
  { icon: Shield, title: "Late Client Replies", copy: "Slow responses lose bookings." },
  { icon: Target, title: "Operational Gaps", copy: "Growth stalls without strong systems." }
];

export default function RuffopsHomePage() {
  return (
    <>
      <section className="relative overflow-hidden pt-12 sm:pt-16">
        <div className="pointer-events-none absolute inset-0 bg-radial-accent" />
        <div className="pointer-events-none absolute inset-0 bg-radial-electric" />
        <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-50 [background-size:46px_46px]" />
        <div className="container-page relative grid items-center gap-12 pb-16 lg:grid-cols-[1.1fr_1fr]">
          <Reveal>
            <p className="eyebrow">
              <Sparkles className="h-3.5 w-3.5" /> AI + Operations Consulting for Pet Businesses
            </p>
            <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              We Help Pet Businesses
              <br />
              Run <span className="text-gradient-accent">Smarter</span>.
            </h1>
            <p className="mt-3 text-xl font-semibold text-ro-accent">Operate Smarter. Serve More Dogs. Lead Your Market.</p>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
              We help dog daycares, boarding, grooming, rescues, trainers, and pet businesses build efficient operations,
              stronger teams, better client experiences, and sustainable growth — powered by AI and proven systems. On-site
              in Santa Monica, CA and within 10 miles. Nationwide online.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <SiteLink href={PRIMARY_CTA.href} className="btn-primary">
                Book a Free Strategy Call
              </SiteLink>
              <SiteLink href="/ai-platform" className="btn-secondary">
                Explore the AI Platform
              </SiteLink>
            </div>
            <ul className="mt-8 grid gap-3 text-sm text-slate-400 sm:grid-cols-2">
              {["Pet Industry Specialists", "Real Facility Experience", "AI + Ops Implementation", "Systems That Scale"].map(
                (item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    {item}
                  </li>
                )
              )}
            </ul>
          </Reveal>
          <Reveal delay={120} className="card p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between text-sm">
              <p className="font-semibold tracking-wider text-ro-accent">
                RUFFOPS <span className="text-slate-400">COMMAND CENTER</span>
              </p>
              <p className="text-xs text-slate-500">
                Today <span className="font-semibold text-emerald-400">● Live</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Daily Bookings", "46", "▲ 15% vs yesterday"],
                ["Staff Coverage", "94%", "All shifts covered"],
                ["Owner Messages", "23", "Needs reply"],
                ["Incident Risk", "LOW", "Stable"],
                ["Revenue Today", "$3,650", "▲ 28% week"],
                ["AI Time Saved", "7.8 hrs", "Today"],
                ["Capacity", "72%", "Spots left"],
                ["Satisfaction", "4.9", "★★★★★"]
              ].map(([label, value, note]) => (
                <div key={label} className="rounded-xl border border-ro-line bg-ro-900/60 p-3">
                  <p className="text-[11px] text-slate-500">{label}</p>
                  <p className="mt-1 text-xl font-bold text-white">{value}</p>
                  <p className="text-[11px] text-emerald-400">{note}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-xl border border-ro-accent/40 bg-ro-accent/10 p-3 text-sm text-orange-100">
              <strong className="text-ro-accent">AI Insight:</strong> Follow-up delay detected on 4 leads. Automated
              reminders sent to lift conversions.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="container-page grid gap-4 py-6 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Boots-on-the-Floor Experience", "Real-world operational experience you can trust."],
          ["AI-Powered Systems", "Intelligent tools that turn data into action."],
          ["Operational Frameworks", "Proven systems that bring consistency and clarity."],
          ["Safety & Revenue Focus", "Stronger safety. Smarter operations. Better results."]
        ].map(([title, copy]) => (
          <Reveal key={title} className="card card-hover p-5">
            <h2 className="font-semibold text-white">{title}</h2>
            <p className="mt-2 text-sm text-slate-400">{copy}</p>
          </Reveal>
        ))}
      </section>

      <section className="container-page py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Running a Dog Business Is Hard Enough. <span className="text-gradient-accent">AI Overwhelm Doesn’t Help.</span>
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pains.map((pain, index) => (
            <Reveal key={pain.title} delay={index * 40} className="card card-hover p-5">
              <pain.icon className="h-6 w-6 text-ro-electric" />
              <h3 className="mt-3 font-semibold text-white">{pain.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{pain.copy}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="container-page py-8" id="method">
        <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
          From AI Overwhelm to AI Action: <span className="text-gradient-accent">The RuffOps Method</span>
        </h2>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {[
            ["1", "Build Custom AI Tools", ["Custom GPTs for your processes", "Documented workflows & SOPs", "Smart automations that save hours"]],
            ["2", "Turn It Into Results", ["More time back in your day", "Better client experience", "More revenue and profit"]],
            ["3", "Scale With Confidence", ["Continuous optimization", "Data-driven decisions", "Sustainable growth"]]
          ].map(([num, title, items]) => (
            <Reveal key={String(title)} className="card p-6">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ro-electric font-bold text-white">
                {num}
              </span>
              <h3 className="mt-4 text-xl font-semibold text-white">{title}</h3>
              <ul className="mt-4 space-y-2 text-sm text-slate-400">
                {(items as string[]).map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="container-page py-16" id="offers">
        <h2 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Ways to Work With <span className="text-gradient-accent">RuffOps</span>
        </h2>
        <p className="mx-auto mt-4 max-w-3xl text-center text-slate-400">
          Start with one operational problem, or let RuffOps help rebuild the system behind the chaos. The goal is simple:
          cleaner workflows, stronger teams, fewer dropped balls, and more revenue from the business you already have.
        </p>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {PACKAGES.map((pack) => (
            <Reveal
              key={pack.id}
              id={pack.id}
              className={`card flex scroll-mt-24 flex-col p-6 ${pack.featured ? "border-ro-accent shadow-[0_18px_44px_rgba(245,130,31,0.22)]" : ""}`}
            >
              <span className={`eyebrow ${pack.featured ? "border-ro-accent bg-ro-accent text-ro-950" : ""}`}>{pack.tag}</span>
              <h3 className="mt-4 text-xl font-semibold text-white">{pack.name}</h3>
              <p className="mt-3 text-sm text-slate-400">{pack.summary}</p>
              <ul className="mt-4 grow space-y-2 text-sm text-slate-400">
                {pack.bullets.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
              <p className="mt-5 text-lg font-bold text-white">{pack.price}</p>
              <p className="mt-2 text-sm text-slate-500">{pack.note}</p>
              <SiteLink href="/contact" className={`mt-5 ${pack.featured ? "btn-primary" : "btn-secondary"}`}>
                {pack.cta}
              </SiteLink>
            </Reveal>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-3xl rounded-xl border border-ro-accent/30 bg-ro-accent/10 px-4 py-3 text-sm text-slate-200">
          Not sure where to start? Book the 1:1 Strategy Session first. If you move into a larger RuffOps package within 14
          days, we’ll credit the session toward your setup.
        </p>
      </section>

      <section className="container-page py-10">
        <h2 className="text-center text-3xl font-bold text-white">
          The Math Is Simple: <span className="text-gradient-accent">Chaos Is Expensive.</span>
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ["5–10 hrs/wk", "Admin Time Recovered"],
            ["2–4x", "Faster Lead Follow-Up"],
            ["15–30%", "Revenue Upside Potential"]
          ].map(([stat, label]) => (
            <div key={label} className="card p-6">
              <p className="text-3xl font-bold text-ro-accent">{stat}</p>
              <h3 className="mt-2 font-semibold text-white">{label}</h3>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page py-10" id="platform">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="eyebrow">The RuffOps AI Platform</p>
            <h2 className="mt-4 text-3xl font-bold text-white">Your all-in-one command center for AI tools, SOPs, automations, and operational insights.</h2>
            <ul className="mt-6 space-y-3 text-slate-300">
              <li>Custom GPTs for your business</li>
              <li>Documented workflows & SOPs</li>
              <li>Automations that save time</li>
              <li>Operational dashboards & reporting</li>
              <li>Team training & resource library</li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <SiteLink href="/attune" className="btn-primary">
                Explore Attune™
              </SiteLink>
              <SiteLink href="/ai-platform" className="btn-secondary">
                See the Platform
              </SiteLink>
            </div>
          </div>
          <div className="card p-5">
            <p className="mb-4 text-sm text-slate-400">
              Dashboard Overview <span className="text-emerald-400">● Live</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[["Today’s Bookings", "46"], ["Revenue Today", "$3,650"], ["Leads", "12"], ["Tasks Completed", "34"]].map(
                ([label, value]) => (
                  <div key={label} className="rounded-xl border border-ro-line bg-ro-900/60 p-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="text-xl font-bold text-white">{value}</p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-16" id="industries">
        <h2 className="text-center text-3xl font-bold text-white">Industries We Serve</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            "Dog Daycares",
            "Hotels & Boarding",
            "Grooming Salons",
            "Sitters & Walkers",
            "Dog Trainers",
            "Rescues & Shelters",
            "Transportation",
            "Multi-Service"
          ].map((name) => (
            <SiteLink key={name} href="/industries" className="card card-hover p-5 font-semibold text-white">
              {name}
            </SiteLink>
          ))}
        </div>
      </section>

      <section className="container-page py-10" id="about">
        <h2 className="text-center text-3xl font-bold text-white">What Pet Business Owners Are Saying</h2>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {[
            ["Melissa D.", "Dog Daycare Owner", "RuffOps helped us build systems and GPTs that save us hours every week. Our team is more confident, and our owners are happier than ever."],
            ["James R.", "Boarding Facility Owner", "The mastermind has been a game changer. I finally understand AI and how to use it in my business. Bookings are up and stress is down."],
            ["Laura S.", "Grooming Salon Owner", "They truly know the pet industry and they know AI. That combination is why results came so fast for us."]
          ].map(([name, role, quote]) => (
            <figure key={name} className="card p-6">
              <p className="text-amber-400">★★★★★</p>
              <blockquote className="mt-3 text-slate-200">“{quote}”</blockquote>
              <figcaption className="mt-4 text-sm">
                <strong className="text-white">{name}</strong>
                <span className="block text-slate-500">{role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="container-page py-10" id="checklist">
        <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="card bg-radial-electric p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-ro-accent">RuffOps</p>
            <h3 className="mt-3 text-2xl font-bold text-white">Dog Facility Operations Risk Checklist</h3>
            <p className="mt-3 text-slate-400">Identify hidden risks. Prevent costly problems. Strengthen every operation.</p>
          </div>
          <div>
            <p className="eyebrow">Free Download</p>
            <h2 className="mt-4 text-3xl font-bold text-white">
              Find the Hidden Problems Inside Your Facility — <span className="text-gradient-accent">Before They Get Expensive.</span>
            </h2>
            <ChecklistForm />
          </div>
        </div>
      </section>

      <section className="container-page py-16" id="contact">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Stop Guessing. <span className="text-gradient-accent">Start Operating Smarter.</span>
          </h2>
          <p className="mt-4 text-slate-400">
            Book your free strategy call and let’s map your next steps. No obligation, tailored to your business, actionable.
          </p>
        </div>
        <div className="mx-auto mt-10 max-w-3xl">
          <ContactForm />
        </div>
      </section>
      <FinalCta />
    </>
  );
}
