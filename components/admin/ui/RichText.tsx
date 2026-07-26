"use client";

import { useMemo } from "react";
import { htmlToPlainText, toDisplayHtml } from "@/lib/html/rich-text";

type RichTextProps = {
  value?: string | null;
  empty?: string;
  className?: string;
  /** Use for compact table/list previews — always plain text. */
  plain?: boolean;
};

export function RichText({ value, empty = "—", className, plain = false }: RichTextProps) {
  const display = useMemo(() => {
    const raw = String(value ?? "").trim();
    if (!raw) return { mode: "empty" as const };
    if (plain) {
      const text = htmlToPlainText(raw);
      return text ? ({ mode: "text" as const, text } as const) : ({ mode: "empty" as const } as const);
    }
    const next = toDisplayHtml(raw);
    if (next.mode === "text" && !next.text) return { mode: "empty" as const };
    return next;
  }, [value, plain]);

  if (display.mode === "empty") {
    return <span className={className}>{empty}</span>;
  }

  if (display.mode === "text") {
    return (
      <span className={className} style={{ whiteSpace: "pre-wrap" }}>
        {display.text}
      </span>
    );
  }

  return (
    <div
      className={["rich-text", className].filter(Boolean).join(" ")}
      dangerouslySetInnerHTML={{ __html: display.html || "" }}
    />
  );
}
