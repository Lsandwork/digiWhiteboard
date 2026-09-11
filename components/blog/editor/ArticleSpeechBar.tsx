"use client";

import { Pause, Play, Square } from "lucide-react";
import type { ArticleSpeechStatus } from "@/components/blog/editor/useArticleSpeech";

type Props = {
  status: ArticleSpeechStatus;
  voiceLabel: string;
  progress: { chunk: number; total: number };
  error?: string | null;
  canPlay: boolean;
  canPause: boolean;
  canStop: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
};

export function ArticleSpeechBar({
  status,
  voiceLabel,
  progress,
  error,
  canPlay,
  canPause,
  canStop,
  onPlay,
  onPause,
  onStop
}: Props) {
  const statusLabel =
    status === "loading"
      ? "Preparing natural voice…"
      : status === "playing"
        ? "Playing"
        : status === "paused"
          ? "Paused"
          : "Ready to listen";

  return (
    <div className="blog-editor-speech">
      <div className="blog-editor-speech__meta">
        <strong>{statusLabel}</strong>
        <span>{voiceLabel}</span>
        {progress.total > 1 ? (
          <span>
            Part {Math.max(progress.chunk, 1)} of {progress.total}
          </span>
        ) : null}
      </div>
      <div className="blog-editor-speech__controls">
        <button
          type="button"
          className="blog-dash-toolbar-btn blog-dash-toolbar-btn--primary"
          disabled={!canPlay}
          onClick={onPlay}
          aria-label={status === "paused" ? "Resume listening" : "Play article aloud"}
        >
          <Play className="h-4 w-4" aria-hidden />
          {status === "paused" ? "Resume" : "Play"}
        </button>
        <button type="button" className="blog-dash-toolbar-btn" disabled={!canPause} onClick={onPause} aria-label="Pause listening">
          <Pause className="h-4 w-4" aria-hidden />
          Pause
        </button>
        <button type="button" className="blog-dash-toolbar-btn" disabled={!canStop} onClick={onStop} aria-label="Stop listening">
          <Square className="h-4 w-4" aria-hidden />
          Stop
        </button>
      </div>
      {error ? (
        <p className="blog-editor-speech__error" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
