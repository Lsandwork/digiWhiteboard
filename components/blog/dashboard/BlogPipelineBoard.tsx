"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useDraggable } from "@dnd-kit/core";
import { MoreHorizontal } from "lucide-react";
import { BLOG_APP_PATH } from "@/lib/blog/constants";
import type { PipelineColumn } from "@/lib/blog/workflow";

type PipelineItem = {
  id: string;
  title: string;
  status: string;
  updatedAt: string | null;
  coverImage?: string | null;
  score?: number | null;
  factCheckStatus?: string | null;
  kind: "article" | "topic";
};

type PipelineBucket = { count: number; items: PipelineItem[] };

type Props = {
  pipeline: {
    topicIdeas: PipelineBucket;
    drafts: PipelineBucket;
    needsReview: PipelineBucket;
    approved: PipelineBucket;
    scheduled: PipelineBucket;
  };
  onChanged: () => void;
};

const COLUMNS: Array<{
  id: PipelineColumn;
  title: string;
  accent: string;
  bg: string;
}> = [
  { id: "topicIdeas", title: "Topic Ideas", accent: "#ff6f26", bg: "#fff7f2" },
  { id: "drafts", title: "Drafts", accent: "#3b82f6", bg: "#eff6ff" },
  { id: "needsReview", title: "Needs Review", accent: "#ec4899", bg: "#fdf2f8" },
  { id: "approved", title: "Approved", accent: "#10b981", bg: "#ecfdf5" },
  { id: "scheduled", title: "Scheduled", accent: "#8b5cf6", bg: "#f5f3ff" }
];

function formatWhen(value: string | null) {
  if (!value) return "Updated recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updated recently";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function PipelineCard({ item, dragging }: { item: PipelineItem; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${item.kind}:${item.id}`,
    data: item
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1
  };
  const href =
    item.kind === "topic"
      ? `${BLOG_APP_PATH}?page=generate&topicId=${item.id}`
      : `${BLOG_APP_PATH}?page=editor&id=${item.id}`;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-[var(--fitdog-border)] bg-white p-2.5 shadow-sm ${dragging ? "shadow-md" : ""}`}
      {...listeners}
      {...attributes}
    >
      <div className="flex gap-2">
        {item.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.coverImage} alt="" className="h-10 w-10 rounded-lg object-cover" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-500">
            {item.kind === "topic" ? "T" : "A"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <Link href={href} className="line-clamp-2 text-[12px] font-semibold text-[var(--fitdog-heading)] hover:text-[var(--fitdog-orange)]">
            {item.title}
          </Link>
          <p className="mt-1 text-[10px] text-[var(--fitdog-muted)]">{formatWhen(item.updatedAt)}</p>
        </div>
        <button type="button" className="text-slate-400" aria-label="More actions" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

function Column({
  column,
  bucket,
  onMoveKeyboard
}: {
  column: (typeof COLUMNS)[number];
  bucket: PipelineBucket;
  onMoveKeyboard: (item: PipelineItem, to: PipelineColumn) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section
      ref={setNodeRef}
      className="min-w-[210px] flex-1 rounded-xl border border-[var(--fitdog-border)] p-3"
      style={{ background: isOver ? "#fff" : column.bg }}
      aria-label={`${column.title}, ${bucket.count} items`}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: column.accent }} aria-hidden />
          <h3 className="text-[13px] font-semibold text-[var(--fitdog-heading)]">{column.title}</h3>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--fitdog-body)]">{bucket.count}</span>
      </header>
      <div className="space-y-2">
        {bucket.items.map((item) => (
          <div key={`${item.kind}-${item.id}`} className="space-y-1">
            <PipelineCard item={item} />
            <label className="sr-only" htmlFor={`move-${item.id}`}>
              Move {item.title}
            </label>
            <select
              id={`move-${item.id}`}
              className="w-full rounded-md border border-[var(--fitdog-border)] bg-white px-2 py-1 text-[10px] text-[var(--fitdog-muted)]"
              defaultValue=""
              onChange={(e) => {
                const value = e.target.value as PipelineColumn;
                if (!value) return;
                onMoveKeyboard(item, value);
                e.target.value = "";
              }}
            >
              <option value="">Move to…</option>
              {COLUMNS.filter((c) => c.id !== column.id).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        ))}
        {!bucket.items.length ? (
          <p className="rounded-lg border border-dashed border-[var(--fitdog-border)] bg-white/70 px-3 py-6 text-center text-xs text-[var(--fitdog-muted)]">
            No items
          </p>
        ) : null}
        {bucket.count > bucket.items.length ? (
          <Link href={`${BLOG_APP_PATH}?page=${column.id === "topicIdeas" ? "topics" : column.id === "needsReview" ? "human-review" : column.id === "drafts" ? "drafts" : column.id === "approved" ? "approved" : "scheduled"}`} className="block pt-1 text-center text-[11px] font-semibold text-[var(--fitdog-orange)] hover:underline">
            More
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function BlogPipelineBoard({ pipeline, onChanged }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<PipelineItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const buckets = useMemo(
    () => ({
      topicIdeas: pipeline.topicIdeas,
      drafts: pipeline.drafts,
      needsReview: pipeline.needsReview,
      approved: pipeline.approved,
      scheduled: pipeline.scheduled
    }),
    [pipeline]
  );

  async function runMove(item: PipelineItem, fromColumn: PipelineColumn, toColumn: PipelineColumn, confirm = false, scheduledFor?: string) {
    setError(null);
    const res = await fetch("/api/blog/dashboard/workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "pipeline_move",
        kind: item.kind,
        id: item.id,
        fromColumn,
        toColumn,
        confirm,
        scheduledFor
      })
    });
    const json = await res.json();
    if (res.status === 200 && json.requiresConfirm) {
      const ok = window.confirm(json.message || "Confirm this change?");
      if (!ok) return;
      if (json.action === "schedule") {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const when = window.prompt(
          "Schedule publish date/time (ISO or local datetime)",
          tomorrow.toISOString().slice(0, 16)
        );
        if (!when) return;
        return runMove(item, fromColumn, toColumn, true, new Date(when).toISOString());
      }
      return runMove(item, fromColumn, toColumn, true, scheduledFor);
    }
    if (!res.ok) {
      setError(json.error || "Workflow update failed");
      return;
    }
    if (json.redirect) {
      router.push(json.redirect);
      return;
    }
    onChanged();
  }

  function findColumnForItem(itemId: string): PipelineColumn | null {
    for (const column of COLUMNS) {
      if (buckets[column.id].items.some((row) => `${row.kind}:${row.id}` === itemId || row.id === itemId)) {
        return column.id;
      }
    }
    return null;
  }

  function onDragStart(event: DragStartEvent) {
    const item = event.active.data.current as PipelineItem | undefined;
    setActive(item || null);
  }

  async function onDragEnd(event: DragEndEvent) {
    setActive(null);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    const toColumn = COLUMNS.some((c) => c.id === overId) ? (overId as PipelineColumn) : null;
    if (!toColumn) return;
    const item = event.active.data.current as PipelineItem | undefined;
    if (!item) return;
    const fromColumn = findColumnForItem(`${item.kind}:${item.id}`) || findColumnForItem(item.id);
    if (!fromColumn || fromColumn === toColumn) return;
    await runMove(item, fromColumn, toColumn);
  }

  return (
    <div className="blog-dash-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--fitdog-heading)]">Content Pipeline</h2>
          <p className="text-xs text-[var(--fitdog-muted)]">Drag cards between permitted stages, or use Move to… for keyboard access.</p>
        </div>
      </div>
      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={(e) => void onDragEnd(e)}>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {COLUMNS.map((column) => (
            <Column
              key={column.id}
              column={column}
              bucket={buckets[column.id]}
              onMoveKeyboard={(item, to) => {
                void runMove(item, column.id, to);
              }}
            />
          ))}
        </div>
        <DragOverlay>{active ? <PipelineCard item={active} dragging /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
