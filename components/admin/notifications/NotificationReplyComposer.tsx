"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { QUICK_REPLIES } from "@/lib/staff/notification-hub";

type NotificationReplyComposerProps = {
  value: string;
  busy: boolean;
  canReply: boolean;
  canInternalNote: boolean;
  canResolve: boolean;
  onChange: (value: string) => void;
  onSend: (options: { internalNote: boolean; markResolved: boolean }) => void;
};

export function NotificationReplyComposer({
  value,
  busy,
  canReply,
  canInternalNote,
  canResolve,
  onChange,
  onSend
}: NotificationReplyComposerProps) {
  const [internalNote, setInternalNote] = useState(false);
  const [markResolved, setMarkResolved] = useState(false);

  if (!canReply) return null;

  return (
    <div className="notif-hub-composer">
      <label className="notif-hub-composer__label" htmlFor="notif-reply">
        Reply
      </label>
      <textarea
        id="notif-reply"
        className="notif-hub-composer__textarea"
        rows={4}
        placeholder="Write your response…"
        value={value}
        disabled={busy}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="notif-hub-composer__quick">
        {QUICK_REPLIES.map((reply) => (
          <button
            key={reply}
            type="button"
            className="notif-hub-composer__quick-btn"
            disabled={busy}
            onClick={() => onChange(reply)}
          >
            {reply}
          </button>
        ))}
      </div>
      <div className="notif-hub-composer__actions">
        {canInternalNote ? (
          <label className="notif-hub-composer__check">
            <input type="checkbox" checked={internalNote} onChange={(event) => setInternalNote(event.target.checked)} />
            Internal note only
          </label>
        ) : null}
        {canResolve && !internalNote ? (
          <label className="notif-hub-composer__check">
            <input type="checkbox" checked={markResolved} onChange={(event) => setMarkResolved(event.target.checked)} />
            Mark as resolved
          </label>
        ) : null}
        <button
          type="button"
          className="crossover-btn crossover-btn--primary notif-hub-composer__send"
          disabled={busy || !value.trim()}
          onClick={() => onSend({ internalNote, markResolved })}
        >
          <Send className="mr-2 h-4 w-4" aria-hidden />
          Send
        </button>
      </div>
    </div>
  );
}
