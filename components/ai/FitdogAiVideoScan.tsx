"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, Video } from "lucide-react";
import type { FitdogAiVideoAnalysis } from "@/components/ai/FitdogAiMessage";
import { FitdogAiVideoAnalysisCard } from "@/components/ai/FitdogAiVideoAnalysisCard";

const ACCEPTED_TYPES = "video/mp4,video/mpeg,video/quicktime,video/webm,video/avi,video/x-flv,video/mpg,video/wmv,video/3gpp,.mov,.mp4,.webm";

type FitdogAiVideoScanProps = {
  currentPage?: string;
  onComplete: (analysis: FitdogAiVideoAnalysis) => void;
};

export function FitdogAiVideoScan({ currentPage, onComplete }: FitdogAiVideoScanProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [userNote, setUserNote] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FitdogAiVideoAnalysis | null>(null);
  const [progress, setProgress] = useState(0);

  async function scanVideo() {
    if (!file || scanning) return;
    setScanning(true);
    setError(null);
    setProgress(12);

    try {
      const form = new FormData();
      form.append("video", file);
      if (userNote.trim()) form.append("userNote", userNote.trim());
      if (currentPage) form.append("currentPage", currentPage);

      const xhr = new XMLHttpRequest();
      const result = await new Promise<FitdogAiVideoAnalysis>((resolve, reject) => {
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          setProgress(Math.min(88, Math.round((event.loaded / event.total) * 70) + 12));
        };
        xhr.onreadystatechange = () => {
          if (xhr.readyState !== XMLHttpRequest.DONE) return;
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(xhr.responseText || "{}") as Record<string, unknown>;
          } catch {
            reject(new Error("Fitdog AI returned an unexpected response."));
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(body as FitdogAiVideoAnalysis);
            return;
          }
          reject(new Error(String(body.error ?? "Unable to scan this video right now.")));
        };
        xhr.open("POST", "/api/fitdog-ai/video-scan");
        xhr.send(form);
      });

      setProgress(100);
      setAnalysis(result);
      onComplete(result);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Unable to scan this video right now.");
    } finally {
      setScanning(false);
      setProgress(0);
    }
  }

  return (
    <div className="fitdog-ai-video-scan">
      <div className="fitdog-ai-video-scan__intro">
        <Video className="h-5 w-5 text-fitdog-orange" aria-hidden />
        <div>
          <p className="font-bold text-white">Upload a short video and Fitdog AI will help you understand what happened.</p>
          <p className="mt-1 text-sm text-admin-muted">Short clips work best. Trim to the key moment when possible.</p>
        </div>
      </div>

      <button type="button" className="fitdog-ai-video-scan__upload" onClick={() => inputRef.current?.click()}>
        <Upload className="h-5 w-5" aria-hidden />
        <span>{file ? file.name : "Choose video file"}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setAnalysis(null);
          setError(null);
        }}
      />

      <label className="fitdog-ai-field">
        <span>What do you want help reviewing?</span>
        <textarea
          rows={3}
          value={userNote}
          onChange={(event) => setUserNote(event.target.value)}
          placeholder="Example: Was this safe handling? Help me write a Front Desk Log note. Should this be documented?"
        />
      </label>

      <button type="button" className="fitdog-ai-send" onClick={() => void scanVideo()} disabled={!file || scanning}>
        {scanning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {scanning ? "Reviewing the video..." : "Scan Video"}
      </button>

      {scanning && progress > 0 ? (
        <div className="fitdog-ai-progress" aria-hidden>
          <div className="fitdog-ai-progress__bar" style={{ width: `${progress}%` }} />
        </div>
      ) : null}

      {error ? <p className="fitdog-ai-error">{error}</p> : null}
      {analysis ? <FitdogAiVideoAnalysisCard analysis={analysis} /> : null}
    </div>
  );
}
