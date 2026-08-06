"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { BLOG_APP_PATH } from "@/lib/blog/constants";

type Props = {
  canCreate: boolean;
  canSubmitIdea: boolean;
};

export function NewArticleSplitButton({ canCreate, canSubmitIdea }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function createManualDraft() {
    if (!canCreate || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/blog/dashboard/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_draft", title: "Untitled draft" })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not create draft");
      router.push(`${BLOG_APP_PATH}?page=editor&id=${json.article.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create draft");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  if (!canCreate && !canSubmitIdea) return null;

  return (
    <div className="relative" ref={ref}>
      <div className="inline-flex overflow-hidden rounded-lg shadow-sm">
        <button
          type="button"
          disabled={busy || !canCreate}
          onClick={() => void createManualDraft()}
          className="inline-flex items-center gap-1.5 bg-[var(--fitdog-orange)] px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--fitdog-orange-hover)] disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New Article
        </button>
        <button
          type="button"
          className="border-l border-orange-400/40 bg-[var(--fitdog-orange)] px-2 text-white hover:bg-[var(--fitdog-orange-hover)]"
          aria-label="More new article options"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 min-w-[220px] rounded-xl border border-[var(--fitdog-border)] bg-white p-1 shadow-lg"
        >
          {canCreate ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => void createManualDraft()}
            >
              Write Manually
            </button>
          ) : null}
          {canCreate ? (
            <Link
              href={`${BLOG_APP_PATH}?page=generate`}
              role="menuitem"
              className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Generate with AI
            </Link>
          ) : null}
          {canSubmitIdea || canCreate ? (
            <Link
              href={`${BLOG_APP_PATH}?page=topics`}
              role="menuitem"
              className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              Add Topic Idea
            </Link>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
