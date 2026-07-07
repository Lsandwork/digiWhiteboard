"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageCircleHeart, Send, Video, X } from "lucide-react";
import { FitdogGeminiAvatar } from "@/components/ai/FitdogGeminiAvatar";
import {
  FitdogAiMessage,
  type FitdogAiChatMessage,
  type FitdogAiPushNoticeResult,
  type FitdogAiVideoAnalysis
} from "@/components/ai/FitdogAiMessage";
import { FitdogAiVideoScan } from "@/components/ai/FitdogAiVideoScan";
import { FitdogAiVideoAnalysisCard } from "@/components/ai/FitdogAiVideoAnalysisCard";
import type { FitdogActionLink } from "@/lib/ai/fitdogActionLinks";
import type { FitdogAiPushNoticeDraft } from "@/lib/ai/fitdogAiPushNotice";

const QUICK_PROMPTS = [
  { label: "Scan Video", mode: "video" as const },
  { label: "Push team notice", message: "I need to push a notice to the team on the whiteboard." },
  { label: "Help me document this", message: "Help me document this clearly for Fitdog." },
  { label: "Where should this go?", message: "Where should this go in Fitdog — Front Desk Log, complaint, or request?" },
  { label: "I'm frustrated", message: "I'm frustrated and need help figuring out the right next step." },
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
  const [pushingNoticeId, setPushingNoticeId] = useState<string | null>(null);
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

  const pushNoticeFromChat = useCallback(async (noticeDraft: FitdogAiPushNoticeDraft, messageId: string) => {
    setPushingNoticeId(messageId);
    setError(null);
    try {
      const response = await fetch("/api/admin/push-notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_and_push",
          title: noticeDraft.title,
          message: noticeDraft.message,
          priority: noticeDraft.priority ?? "important",
          display_mode: noticeDraft.display_mode ?? "normal"
        })
      });
      const body = (await response.json()) as { error?: string; notice?: { id: string; title: string; message: string | null } };
      if (!response.ok || !body.notice) {
        throw new Error(body.error ?? "Unable to push notice.");
      }
      const result: FitdogAiPushNoticeResult = {
        id: body.notice.id,
        title: body.notice.title,
        message: body.notice.message
      };
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                pushNoticeResult: result,
                pendingPushNotice: null,
                content: `Done — it's live on the staff whiteboard.\n\n${result.title}${result.message ? `\n${result.message}` : ""}`,
                actionLinks: [{ label: "Open Staff Digital Whiteboard", href: "/" }]
              }
            : item
        )
      );
    } catch (pushError) {
      setError(pushError instanceof Error ? pushError.message : "Unable to push notice.");
    } finally {
      setPushingNoticeId(null);
    }
  }, []);

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

      const history = [...messages, userMessage].slice(-8).map((item) => ({
        role: item.role,
        content: item.content
      }));

      setMessages((current) => [...current, userMessage]);
      setDraft("");
      setSending(true);
      setError(null);

      try {
        const response = await fetch("/api/fitdog-ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, currentPage, history })
        });
        const body = (await response.json()) as {
          error?: string;
          reply?: string;
          actionLinks?: FitdogActionLink[];
          tone?: FitdogAiChatMessage["tone"];
          pushNoticeResult?: FitdogAiPushNoticeResult | null;
          pendingPushNotice?: FitdogAiPushNoticeDraft | null;
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
          pushNoticeResult: body.pushNoticeResult ?? null,
          pendingPushNotice: body.pendingPushNotice ?? null,
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
    [currentPage, messages, sending]
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
          <FitdogGeminiAvatar size="lg" />
          <div>
            <p className="fitdog-ai-window__title">Fitdog AI</p>
            <p className="fitdog-ai-window__subtitle">Powered by Gemini · Santa Monica shift support</p>
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
                <p>Ask for help with a dog, client, shift note, team notice, complaint, or next step.</p>
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
                  <FitdogAiMessage
                    message={message}
                    onPushNotice={pushNoticeFromChat}
                    pushingNoticeId={pushingNoticeId}
                  />
                  {message.videoAnalysis ? <FitdogAiVideoAnalysisCard analysis={message.videoAnalysis} /> : null}
                </div>
              ))
            )}
            {sending ? (
              <div className="fitdog-ai-typing" aria-live="polite">
                <FitdogGeminiAvatar size="md" active />
                <div className="fitdog-ai-typing__dots">
                  <span />
                  <span />
                  <span />
                </div>
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
              placeholder="Ask for help — or say what notice to push to the team..."
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
