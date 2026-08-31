import type { Metadata } from "next";
import { SITE } from "@/lib/ruffops-site/config";
import { FinalCta, PageHero } from "@/components/ruffops-site/PageChrome";
import { Reveal } from "@/components/ruffops-site/Reveal";

export const metadata: Metadata = {
  title: "Attune™ | AI-Powered Canine Behavioral Intelligence",
  description:
    "Attune™ uses AI-powered behavioral intelligence to analyze canine stress, anxiety, confidence, social engagement, and behavioral patterns for pet owners and professionals."
};

export default function AttunePage() {
  return (
    <>
      <PageHero
        eyebrow="RuffOps · Attune™"
        title="See What Most Owners Miss"
        description="Attune™ uses artificial intelligence and behavioral intelligence models to identify canine stress, anxiety, social tension, confidence, and behavioral patterns in real time. Real-time behavioral intelligence for dogs and the professionals who care for them."
        primaryLabel="Schedule Demo"
        primaryHref="/contact"
        secondaryLabel="Open Live Demo"
        secondaryHref={SITE.attuneDemoHref}
      />
      <section className="container-page grid gap-6 pb-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-lg text-slate-300">Observe. Analyze. Understand.</p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs uppercase tracking-wider text-slate-400">
            {["Behavioral indicators", "Body language analysis", "Facility intelligence"].map((item) => (
              <span key={item} className="rounded-full border border-ro-line px-3 py-1">
                {item}
              </span>
            ))}
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              ["Live stress detection", "Continuous monitoring of stress indicators and recovery patterns."],
              ["Body language monitoring", "Posture, movement, and orientation analyzed in real time."],
              ["Live risk alerts", "Early identification of escalation and tension signals."],
              ["Social interaction tracking", "Engagement, reciprocity, and group dynamics observed live."],
              ["Behavior monitoring", "Pattern recognition across sessions and environments."],
              ["Confidence assessment", "Real-time behavioral insights with AI confidence scoring."]
            ].map(([title, copy]) => (
              <Reveal key={title} className="card p-5">
                <h2 className="font-semibold text-white">{title}</h2>
                <p className="mt-2 text-sm text-slate-400">{copy}</p>
              </Reveal>
            ))}
          </div>
        </div>
        <Reveal className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Live Analysis</p>
              <p className="font-semibold text-white">Dog Name: Atlas</p>
            </div>
            <span className="text-sm font-semibold text-emerald-400">● Live</span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              ["Stress Level", "Low"],
              ["Confidence", "High"],
              ["Social Engagement", "Excellent"],
              ["Recovery Rate", "Fast"]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-ro-line bg-ro-900/60 p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-lg font-bold text-emerald-400">{value}</p>
              </div>
            ))}
          </div>
          <h3 className="mt-6 text-sm font-semibold text-white">Behavioral Notes</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-400">
            <li>Relaxed body posture</li>
            <li>Appropriate play behavior</li>
            <li>Positive social interactions</li>
            <li>Healthy recovery response</li>
          </ul>
          <p className="mt-6 text-sm text-slate-400">
            AI Confidence <strong className="text-white">94%</strong>
          </p>
        </Reveal>
      </section>
      <section className="container-page pb-10">
        <div className="card p-6">
          <h2 className="text-xl font-semibold text-white">Flagship Feature · Attune™ Live Scan</h2>
          <p className="mt-3 max-w-3xl text-slate-400">
            Point your camera at a dog and receive real-time behavioral intelligence. Live Scan is the primary way
            professionals monitor stress, arousal, and social dynamics as behavior unfolds.
          </p>
          <p className="mt-4 text-sm text-slate-500">
            Educational behavioral screening — not veterinary diagnosis. Pair Attune™ insights with certified trainers and
            veterinary professionals for clinical decisions.
          </p>
          <a href={SITE.attuneDemoHref} className="btn-primary mt-6">
            Start Live Scan Demo
          </a>
        </div>
      </section>
      <FinalCta />
    </>
  );
}
