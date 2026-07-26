"use client";

import { useCallback, useEffect, useState } from "react";

type Conversation = {
  id: string;
  channel: string;
  status: string;
  priority: string;
  last_message_preview?: string | null;
  unread_count?: number;
  contact?: { first_name?: string; last_name?: string; preferred_name?: string } | null;
};

export function RufflyInboxPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState("open");
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ id: string; body: string; direction: string; created_at: string }>>(
    []
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/ruffly/inbox?status=${encodeURIComponent(filter)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load inbox.");
      setItems(body.conversations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load inbox.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function openConversation(id: string) {
    setSelected(id);
    const response = await fetch(`/api/ruffly/inbox/${id}`, { cache: "no-store" });
    const body = await response.json();
    if (response.ok) setMessages(body.messages ?? []);
  }

  async function sendReply() {
    if (!selected || !draft.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/ruffly/inbox/${selected}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reply", body: draft, channel: "sms" })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Send failed.");
      setDraft("");
      await openConversation(selected);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[#1f2933]">Inbox</h2>
        <p className="mt-1 text-sm text-slate-500">
          Shared customer conversations across SMS, email, web chat, and more.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["open", "waiting_staff", "waiting_client", "snoozed", "closed"].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filter === value ? "bg-[#ff6f26] text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {value.replaceAll("_", " ")}
          </button>
        ))}
      </div>
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div> : null}
      <div className="grid min-h-[480px] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="border-b border-slate-200 lg:border-b-0 lg:border-r">
          {loading ? <div className="p-4 text-sm text-slate-500">Loading conversations…</div> : null}
          {!loading && items.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No conversations yet. Connect SMS or install web chat to start receiving messages.
            </div>
          ) : null}
          <ul className="max-h-[560px] overflow-auto">
            {items.map((item) => {
              const name =
                item.contact?.preferred_name ||
                `${item.contact?.first_name ?? ""} ${item.contact?.last_name ?? ""}`.trim() ||
                "Unknown";
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void openConversation(item.id)}
                    className={`block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                      selected === item.id ? "bg-orange-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{name}</span>
                      <span className="text-[11px] uppercase text-slate-400">{item.channel}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {item.last_message_preview || "No messages yet"}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex flex-col">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">Select a conversation</div>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-auto p-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      message.direction === "outbound"
                        ? "ml-auto bg-[#ff6f26] text-white"
                        : message.direction === "internal"
                          ? "bg-amber-50 text-amber-950"
                          : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {message.body}
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 p-3">
                <textarea
                  className="min-h-[80px] w-full rounded-xl border border-slate-200 p-3 text-sm"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a reply…"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={busy || !draft.trim()}
                    onClick={() => void sendReply()}
                    className="rounded-xl bg-[#ff6f26] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
