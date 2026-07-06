"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FitdogAiVideoAnalysis } from "@/components/ai/FitdogAiMessage";

type FitdogAiVideoAnalysisCardProps = {
  analysis: FitdogAiVideoAnalysis;
};

function CollapsibleSection({
  title,
  items,
  defaultOpen = false
}: {
  title: string;
  items: string[] | Array<{ timestamp: string; observation: string }>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!items.length) return null;

  return (
    <section className="fitdog-ai-video-card__section">
      <button type="button" className="fitdog-ai-video-card__section-toggle" onClick={() => setOpen((value) => !value)}>
        <span>{title}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open ? (
        <div className="fitdog-ai-video-card__section-body">
          {typeof items[0] === "string"
            ? (items as string[]).map((item) => <p key={item}>{item}</p>)
            : (items as Array<{ timestamp: string; observation: string }>).map((item) => (
                <p key={`${item.timestamp}-${item.observation}`}>
                  <strong>{item.timestamp}</strong> — {item.observation}
                </p>
              ))}
        </div>
      ) : null}
    </section>
  );
}

export function FitdogAiVideoAnalysisCard({ analysis }: FitdogAiVideoAnalysisCardProps) {
  const nextStep = analysis.recommendedNextSteps?.[0] ?? analysis.suggestedNextStep;

  return (
    <article className="fitdog-ai-video-card">
      <p className="fitdog-ai-video-card__eyebrow">Video Scan</p>
      <h4 className="fitdog-ai-video-card__title">What I&apos;m seeing</h4>
      <p className="fitdog-ai-video-card__reply">{analysis.reply}</p>

      {nextStep ? (
        <div className="fitdog-ai-video-card__highlight">
          <p className="fitdog-ai-video-card__highlight-label">Recommended next step</p>
          <p>{nextStep}</p>
        </div>
      ) : null}

      {analysis.suggestedLogText ? (
        <div className="fitdog-ai-video-card__note">
          <p className="fitdog-ai-video-card__highlight-label">Suggested note</p>
          <p>{analysis.suggestedLogText}</p>
        </div>
      ) : null}

      <CollapsibleSection title="Key moments" items={analysis.timeline ?? []} />
      <CollapsibleSection title="Safety check" items={analysis.safetyConcerns ?? []} />
      <CollapsibleSection title="Dog body language" items={analysis.dogBodyLanguage ?? []} />
      <CollapsibleSection title="Handling notes" items={analysis.staffHandlingNotes ?? []} />

      {analysis.actionLinks?.length ? (
        <div className="fitdog-ai-message__actions">
          {analysis.actionLinks.map((link) => (
            <Link key={link.href} href={link.href} className="fitdog-ai-action-link">
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}
