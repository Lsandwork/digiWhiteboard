"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageCircleHeart, Paperclip, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type { HrConsultMessage } from "@/lib/hr/consult-store";

type ConsultSettings = {
  hr_consult_enabled: boolean;
  hr_company_city: string;
  hr_company_region: string;
  hr_company_country: string;
  hr_company_situation: string;
  hr_consult_model: string;
  business_display_name: string;
};

type ConsultPayload = {
  thread: { messages: HrConsultMessage[]; updated_at: string };
  settings: ConsultSettings;
  gemini_configured: boolean;
};

const STARTERS = [
  "I need to document a performance issue — where do I start?",
  "An owner complained about a handler on the yard. What should I do first?",
  "How should I talk to an employee about a repeated tardiness pattern?",
  "What should be in a written warning for a safety violation?"
];

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function HrConsultPanel({ initialRecordId }: { initialRecordId?: string | null }) {
  const { showToast } = useToast();
  const [payload, setPayload] = useState<ConsultPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachedRecordId, setAttachedRecordId] = useState<string | null>(initialRecordId ?? null);
  const [attachedLabel, setAttachedLabel] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/hr-consult", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load HR Consult.");
      setPayload(body as ConsultPayload);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to load HR Consult.", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!initialRecordId) return;
    setAttachedRecordId(initialRecordId);
    void (async () => {
      try {
        const response = await fetch(`/api/admin/hr?id=${encodeURIComponent(initialRecordId)}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) return;
        const report = body.report as { title?: string; report_type?: string };
        setAttachedLabel(report.title ?? "Attached HR record");
      } catch {
        setAttachedLabel("Attached HR record");
      }
    })();
  }, [initialRecordId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [payload?.thread.messages.length, sending]);

  const messages = payload?.thread.messages ?? [];
  const ready = payload?.gemini_configured && payload.settings.hr_consult_enabled;

  const locationLabel = useMemo(() => {
    if (!payload) return "";
    const { hr_company_city, hr_company_region } = payload.settings;
    return `${hr_company_city}, ${hr_company_region}`;
  }, [payload]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setDraft("");
    try {
      const response = await fetch("/api/admin/hr-consult", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          message: trimmed,
          report_id: attachedRecordId
        })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to send message.");
      setPayload((current) =>
        current
          ? { ...current, thread: body.thread as ConsultPayload["thread"] }
          : current
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to send message.", "error");
      setDraft(trimmed);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function clearThread() {
    try {
      const response = await fetch("/api/admin/hr-consult", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear" })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to clear conversation.");
      setPayload((current) => (current ? { ...current, thread: body.thread } : current));
      showToast("Conversation cleared.", "info");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to clear conversation.", "error");
    }
  }

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">HR Consult</h2>
          <p className="admin-page-subtitle">
            Talk with Sam, your HR thinking partner — grounded in {locationLabel || "California"} context for {payload?.settings.business_display_name ?? "Fitdog"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="crossover-btn crossover-btn--ghost inline-flex items-center gap-2" onClick={() => void clearThread()} disabled={!messages.length || sending}>
            <RotateCcw className="h-4 w-4" />
            New conversation
          </button>
        </div>
      </header>

      {!loading && !payload?.gemini_configured ? (
        <section className="hr-consult-alert crossover-card p-5">
          <p className="font-bold text-white">Gemini API key needed</p>
          <p className="mt-2 text-sm text-admin-muted">
            Add <code className="text-fitdog-orange">GEMINI_API_KEY</code> to your Vercel project environment variables, then redeploy. Company context can be configured in Settings → HR Consult.
          </p>
        </section>
      ) : null}

      {!loading && payload && !payload.settings.hr_consult_enabled ? (
        <section className="hr-consult-alert crossover-card p-5">
          <p className="font-bold text-white">HR Consult is turned off</p>
          <p className="mt-2 text-sm text-admin-muted">Enable it in Settings → HR Consult (Gemini).</p>
        </section>
      ) : null}

      <section className="hr-consult-shell crossover-card overflow-hidden">
        <div className="hr-consult-header">
          <div className="hr-consult-avatar" aria-hidden="true">
            <MessageCircleHeart className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-black text-white">Sam · HR Consult</p>
            <p className="text-xs text-admin-muted">
              {ready ? "Here to help you think it through — not legal advice." : "Checking availability…"}
            </p>
          </div>
          <div className="ml-auto hidden items-center gap-2 text-xs text-admin-muted sm:flex">
            <Sparkles className="h-4 w-4 text-[var(--crossover-gold)]" />
            Powered by Gemini
          </div>
        </div>

        <div ref={scrollRef} className="hr-consult-thread">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-admin-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading conversation…
            </div>
          ) : messages.length === 0 ? (
            <div className="hr-consult-empty">
              <p className="text-lg font-black text-white">Hey — what&apos;s on your mind?</p>
              <p className="mt-2 max-w-lg text-sm text-admin-muted">
                Ask about write-ups, complaints, conversations with staff, or documentation. Sam knows Fitdog is in {locationLabel} and will keep things practical and human.
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    className="hr-consult-starter"
                    disabled={!ready || sending}
                    onClick={() => void sendMessage(starter)}
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`hr-consult-message ${message.role === "assistant" ? "hr-consult-message--sam" : "hr-consult-message--you"}`}
                >
                  <div className="hr-consult-message__meta">
                    <span>{message.role === "assistant" ? "Sam" : "You"}</span>
                    <span>{formatTime(message.created_at)}</span>
                  </div>
                  <div className="hr-consult-message__bubble">
                    {message.content.split("\n").map((line, index) => (
                      <p key={`${message.id}-${index}`} className={index > 0 ? "mt-3" : undefined}>
                        {line}
                      </p>
                    ))}
                  </div>
                </article>
              ))}
              {sending ? (
                <article className="hr-consult-message hr-consult-message--sam">
                  <div className="hr-consult-message__meta"><span>Sam</span><span>typing…</span></div>
                  <div className="hr-consult-message__bubble hr-consult-typing">
                    <span /><span /><span />
                  </div>
                </article>
              ) : null}
            </div>
          )}
        </div>

        <div className="hr-consult-composer">
          {attachedRecordId ? (
            <div className="hr-consult-attach">
              <Paperclip className="h-4 w-4" />
              <span>{attachedLabel ?? "HR record attached for context"}</span>
              <button type="button" aria-label="Remove attached record" onClick={() => { setAttachedRecordId(null); setAttachedLabel(null); }}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          <div className="hr-consult-input-row">
            <textarea
              ref={inputRef}
              className="hr-consult-input"
              rows={2}
              placeholder={ready ? "Tell Sam what's going on…" : "HR Consult unavailable"}
              value={draft}
              disabled={!ready || sending}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage(draft);
                }
              }}
            />
            <button
              type="button"
              className="hr-consult-send"
              disabled={!ready || sending || !draft.trim()}
              onClick={() => void sendMessage(draft)}
              aria-label="Send message"
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
          <p className="hr-consult-footnote">
            Guidance only — not legal advice. For high-risk situations, consult qualified employment counsel in California.
          </p>
        </div>
      </section>
    </div>
  );
}
