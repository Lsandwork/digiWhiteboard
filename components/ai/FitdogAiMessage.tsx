"use client";

import Link from "next/link";
import type { FitdogActionLink } from "@/lib/ai/fitdogActionLinks";
import type { FitdogAiTone } from "@/lib/ai/fitdogAiGuards";

export type FitdogAiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actionLinks?: FitdogActionLink[];
  tone?: FitdogAiTone;
  videoAnalysis?: FitdogAiVideoAnalysis | null;
  createdAt: string;
};

export type FitdogAiVideoAnalysis = {
  reply: string;
  summary?: string;
  timeline?: Array<{ timestamp: string; observation: string }>;
  keyObservations?: string[];
  safetyConcerns?: string[];
  dogBodyLanguage?: string[];
  staffHandlingNotes?: string[];
  recommendedNextSteps?: string[];
  documentationSuggestion?: string;
  suggestedLogText?: string;
  actionLinks?: FitdogActionLink[];
  suggestedNextStep?: string;
  tone?: FitdogAiTone;
};

type FitdogAiMessageProps = {
  message: FitdogAiChatMessage;
};

export function FitdogAiMessage({ message }: FitdogAiMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`fitdog-ai-message ${isUser ? "fitdog-ai-message--user" : "fitdog-ai-message--assistant"}`}>
      {!isUser ? <p className="fitdog-ai-message__label">Fitdog AI</p> : null}
      <div className="fitdog-ai-message__bubble">
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
      {!isUser && message.actionLinks?.length ? (
        <div className="fitdog-ai-message__actions">
          {message.actionLinks.map((link) => (
            <Link key={`${message.id}-${link.href}`} href={link.href} className="fitdog-ai-action-link">
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
