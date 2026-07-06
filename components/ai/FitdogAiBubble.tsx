"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import type { AdminTab, AdminBoardType } from "@/lib/admin/types";

const FitdogAiChatWindow = dynamic(
  () => import("@/components/ai/FitdogAiChatWindow").then((module) => module.FitdogAiChatWindow),
  { ssr: false }
);

type FitdogAiBubbleProps = {
  board?: AdminBoardType;
  tab?: AdminTab;
};

export function FitdogAiBubble({ board = "staff", tab }: FitdogAiBubbleProps) {
  const [open, setOpen] = useState(false);

  const currentPage = useMemo(() => {
    const params = new URLSearchParams();
    params.set("board", board);
    if (tab) params.set("tab", tab);
    return `/admin?${params.toString()}`;
  }, [board, tab]);

  return (
    <>
      <button
        type="button"
        className="fitdog-ai-bubble"
        aria-label={open ? "Close Fitdog AI" : "Open Fitdog AI"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Sparkles className="h-6 w-6" aria-hidden />
        <span>Fitdog AI</span>
      </button>

      <FitdogAiChatWindow open={open} onClose={() => setOpen(false)} currentPage={currentPage} />
    </>
  );
}
