"use client";

import Link from "next/link";
import { Megaphone } from "lucide-react";
import type { FitdogActionLink } from "@/lib/ai/fitdogActionLinks";
import type { FitdogAiTone } from "@/lib/ai/fitdogAiGuards";
import type { FitdogAiPushNoticeDraft } from "@/lib/ai/fitdogAiPushNotice";

export type FitdogAiPushNoticeResult = {
  id: string;
  title: string;
  message: string | null;
};

export type FitdogAiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actionLinks?: FitdogActionLink[];
  tone?: FitdogAiTone;
  videoAnalysis?: FitdogAiVideoAnalysis | null;
  pushNoticeResult?: FitdogAiPushNoticeResult | null;
  pendingPushNotice?: FitdogAiPushNoticeDraft | null;
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
  pushNoticeResult?: FitdogAiPushNoticeResult | null;
};

type FitdogAiMessageProps = {
  message: FitdogAiChatMessage;
  onPushNotice?: (draft: FitdogAiPushNoticeDraft, messageId: string) => Promise<void>;
  pushingNoticeId?: string | null;
};

export function FitdogAiMessage({ message, onPushNotice, pushingNoticeId }: FitdogAiMessageProps) {
  const isUser = message.role === "user";
  const pending = message.pendingPushNotice;
  const canConfirmPush = Boolean(pending?.title && onPushNotice && !message.pushNoticeResult);
  const isPushing = pushingNoticeId === message.id;

  return (
    <div className={`fitdog-ai-message ${isUser ? "fitdog-ai-message--user" : "fitdog-ai-message--assistant"}`}>
      {!isUser ? <p className="fitdog-ai-message__label">Fitdog AI</p> : null}
      <div className="fitdog-ai-message__bubble">
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>

      {message.pushNoticeResult ? (
        <div className="fitdog-ai-push-result" role="status">
          <Megaphone className="h-4 w-4 shrink-0 text-fitdog-orange" aria-hidden />
          <div>
            <p className="fitdog-ai-push-result__title">Pushed to whiteboard</p>
            <p className="fitdog-ai-push-result__text">{message.pushNoticeResult.title}</p>
            {message.pushNoticeResult.message ? (
              <p className="fitdog-ai-push-result__meta">{message.pushNoticeResult.message}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {canConfirmPush && pending ? (
        <div className="fitdog-ai-push-preview">
          <p className="fitdog-ai-push-preview__label">Ready to broadcast</p>
          <p className="fitdog-ai-push-preview__title">{pending.title}</p>
          {pending.message ? <p className="fitdog-ai-push-preview__text">{pending.message}</p> : null}
          <button
            type="button"
            className="fitdog-ai-push-btn"
            disabled={isPushing}
            onClick={() => {
              if (onPushNotice) void onPushNotice(pending, message.id);
            }}
          >
            <Megaphone className="h-4 w-4" aria-hidden />
            {isPushing ? "Pushing…" : "Push to Whiteboard"}
          </button>
        </div>
      ) : null}

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
