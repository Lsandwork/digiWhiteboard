"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageCircleHeart, Send, Sparkles, Video, X } from "lucide-react";
import { FitdogAiMessage, type FitdogAiChatMessage, type FitdogAiVideoAnalysis } from "@/components/ai/FitdogAiMessage";
import { FitdogAiVideoScan } from "@/components/ai/FitdogAiVideoScan";
import { FitdogAiVideoAnalysisCard } from "@/components/ai/FitdogAiVideoAnalysisCard";
import type { FitdogActionLink } from "@/lib/ai/fitdogActionLinks";

const QUICK_PROMPTS = [
  { label: "Scan Video", mode: "video" as const },
  { label: "Help me document this", message: "Help me document this clearly for Fitdog." },
  { label: "Where should this go?", message: "Where should this go in Fitdog — Front Desk Log, complaint, request, or something else?" },
  { label: "I'm frustrated", message: "I'm frustrated and need help figuring out the right next step." },
  { label: "Owner complaint", message: "An owner complained and I need help with next steps." },
  { label: "Grooming push", message: "I need a dog put in catch for grooming." }
];

function newMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `fitdog-ai-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type FitdogAiChatWindowProps = {
  open: boolean;
  onClose: () => void;
  currentPage?: string;
};

export function FitdogAiChatWindow({ open, onClose, currentPage }: FitdogAiChatWindowProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"chat" | "video">("chat");
  const [messages, setMessages] = useState<FitdogAiChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/fitdog-ai/chat", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => setConfigured(Boolean(body.configured)))
      .catch(() => setConfigured(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending, open, mode]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      const userMessage: FitdogAiChatMessage = {
        id: newMessageId(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString()
      };

      setMessages((current) => [...current, userMessage]);
      setDraft("");
      setSending(true);
      setError(null);

      try {
        const response = await fetch("/api/fitdog-ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, currentPage })
        });
        const body = (await response.json()) as {
          error?: string;
          reply?: string;
          actionLinks?: FitdogActionLink[];
          tone?: FitdogAiChatMessage["tone"];
        };

        if (!response.ok && !body.reply) {
          throw new Error(body.error ?? "Fitdog AI could not respond right now.");
        }

        const assistantMessage: FitdogAiChatMessage = {
          id: newMessageId(),
          role: "assistant",
          content: body.reply ?? body.error ?? "Fitdog AI could not respond right now.",
          actionLinks: body.actionLinks,
          tone: body.tone,
          createdAt: new Date().toISOString()
        };
        setMessages((current) => [...current, assistantMessage]);
      } catch (sendError) {
        setError(sendError instanceof Error ? sendError.message : "Fitdog AI could not respond right now.");
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [currentPage, sending]
  );

  function handleVideoComplete(analysis: FitdogAiVideoAnalysis) {
    const userMessage: FitdogAiChatMessage = {
      id: newMessageId(),
      role: "user",
      content: "Shared a video for Fitdog AI to review.",
      createdAt: new Date().toISOString()
    };
    const assistantMessage: FitdogAiChatMessage = {
      id: newMessageId(),
      role: "assistant",
      content: analysis.reply,
      actionLinks: analysis.actionLinks,
      tone: analysis.tone,
      videoAnalysis: analysis,
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setMode("chat");
  }

  if (!open) return null;

  return (
    <div className="fitdog-ai-window" role="dialog" aria-label="Fitdog AI">
      <header className="fitdog-ai-window__header">
        <div className="fitdog-ai-window__title-wrap">
          <Sparkles className="h-5 w-5 text-fitdog-orange" aria-hidden />
          <div>
            <p className="fitdog-ai-window__title">Fitdog AI</p>
            <p className="fitdog-ai-window__subtitle">Santa Monica shift support</p>
          </div>
        </div>
        <button type="button" className="fitdog-ai-window__close" onClick={onClose} aria-label="Close Fitdog AI">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="fitdog-ai-window__tabs">
        <button type="button" className={mode === "chat" ? "is-active" : ""} onClick={() => setMode("chat")}>
          <MessageCircleHeart className="h-4 w-4" aria-hidden />
          Chat
        </button>
        <button type="button" className={mode === "video" ? "is-active" : ""} onClick={() => setMode("video")}>
          <Video className="h-4 w-4" aria-hidden />
          Scan Video
        </button>
      </div>

      {configured === false ? (
        <div className="fitdog-ai-window__alert">
          Fitdog AI is not configured yet. Ask an admin to add <code>GEMINI_API_KEY</code> in Vercel.
        </div>
      ) : null}

      {mode === "video" ? (
        <div className="fitdog-ai-window__body">
          <FitdogAiVideoScan currentPage={currentPage} onComplete={handleVideoComplete} />
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="fitdog-ai-window__thread">
            {messages.length === 0 ? (
              <div className="fitdog-ai-window__empty">
                <p>Ask for help with a dog, client, shift note, complaint, request, or next step.</p>
                <div className="fitdog-ai-quick-actions">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt.label}
                      type="button"
                      className="fitdog-ai-quick-action"
                      onClick={() => {
                        if ("mode" in prompt && prompt.mode === "video") {
                          setMode("video");
                          return;
                        }
                        if ("message" in prompt) void sendMessage(prompt.message);
                      }}
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id}>
                  <FitdogAiMessage message={message} />
                  {message.videoAnalysis ? <FitdogAiVideoAnalysisCard analysis={message.videoAnalysis} /> : null}
                </div>
              ))
            )}
            {sending ? (
              <div className="fitdog-ai-typing" aria-live="polite">
                <span />
                <span />
                <span />
              </div>
            ) : null}
          </div>

          {error ? <p className="fitdog-ai-error fitdog-ai-error--inline">{error}</p> : null}

          <form
            className="fitdog-ai-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(draft);
            }}
          >
            <textarea
              ref={inputRef}
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask for help with a dog, client, shift note, complaint, request, or next step..."
              disabled={sending || configured === false}
            />
            <button type="submit" className="fitdog-ai-send" disabled={sending || !draft.trim() || configured === false}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
