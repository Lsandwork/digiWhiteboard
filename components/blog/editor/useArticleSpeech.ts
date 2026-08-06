"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chunkSpeechText, pickBestSpeechVoice } from "@/lib/blog/utils/natural-speech-voice";

export type ArticleSpeechStatus = "idle" | "loading" | "playing" | "paused";

type SpeechMode = "hd" | "browser";

export function useArticleSpeech(text: string) {
  const [status, setStatus] = useState<ArticleSpeechStatus>("idle");
  const [mode, setMode] = useState<SpeechMode>("hd");
  const [voiceLabel, setVoiceLabel] = useState<string>("Natural voice");
  const [progress, setProgress] = useState({ chunk: 0, total: 0 });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const chunksRef = useRef<string[]>([]);
  const chunkIndexRef = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const browserPausedRef = useRef(false);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cleanupAudio();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    utteranceRef.current = null;
    browserPausedRef.current = false;
    chunkIndexRef.current = 0;
    chunksRef.current = [];
    setProgress({ chunk: 0, total: 0 });
    setStatus("idle");
  }, [cleanupAudio]);

  useEffect(() => () => stop(), [stop]);

  const speakBrowserChunk = useCallback(
    (index: number) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      const chunks = chunksRef.current;
      const chunk = chunks[index];
      if (!chunk) {
        stop();
        return;
      }

      const voices = window.speechSynthesis.getVoices();
      const voice = pickBestSpeechVoice(voices);
      if (voice) {
        setVoiceLabel(voice.name);
      } else {
        setVoiceLabel("System voice");
      }

      const utter = new SpeechSynthesisUtterance(chunk);
      utter.lang = voice?.lang || "en-US";
      if (voice) utter.voice = voice;
      utter.rate = 0.96;
      utter.pitch = 1;
      utter.volume = 1;

      utter.onend = () => {
        const next = index + 1;
        if (next < chunks.length) {
          chunkIndexRef.current = next;
          setProgress({ chunk: next + 1, total: chunks.length });
          speakBrowserChunk(next);
        } else {
          stop();
        }
      };
      utter.onerror = () => stop();

      utteranceRef.current = utter;
      window.speechSynthesis.speak(utter);
      setStatus("playing");
    },
    [stop]
  );

  const playBrowser = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setVoiceLabel("Speech unavailable");
      return;
    }

    const chunks = chunkSpeechText(text, 2800);
    if (!chunks.length) return;

    window.speechSynthesis.cancel();
    chunksRef.current = chunks;
    chunkIndexRef.current = 0;
    setMode("browser");
    setProgress({ chunk: 1, total: chunks.length });
    speakBrowserChunk(0);
  }, [speakBrowserChunk, text]);

  const playHdChunk = useCallback(
    async (index: number) => {
      const chunks = chunksRef.current;
      const chunk = chunks[index];
      if (!chunk) {
        stop();
        return;
      }

      setStatus("loading");
      const res = await fetch("/api/blog/articles/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, chunkIndex: index })
      });

      if (!res.ok) {
        playBrowser();
        return;
      }

      cleanupAudio();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      setMode("hd");
      setVoiceLabel(res.headers.get("X-Speech-Provider") === "openai" ? "OpenAI natural voice (HD)" : "HD voice");

      audio.onended = () => {
        const next = index + 1;
        if (next < chunks.length) {
          chunkIndexRef.current = next;
          setProgress({ chunk: next + 1, total: chunks.length });
          void playHdChunk(next);
        } else {
          stop();
        }
      };
      audio.onerror = () => stop();

      await audio.play();
      setStatus("playing");
    },
    [cleanupAudio, playBrowser, stop, text]
  );

  const play = useCallback(async () => {
    if (!text.trim()) return;

    if (status === "paused") {
      if (mode === "hd" && audioRef.current) {
        await audioRef.current.play();
        setStatus("playing");
        return;
      }
      if (mode === "browser" && typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.resume();
        setStatus("playing");
        browserPausedRef.current = false;
        return;
      }
    }

    stop();
    const chunks = chunkSpeechText(text, 3200);
    chunksRef.current = chunks;
    chunkIndexRef.current = 0;
    setProgress({ chunk: 1, total: chunks.length });
    await playHdChunk(0);
  }, [mode, playHdChunk, status, stop, text]);

  const pause = useCallback(() => {
    if (status !== "playing") return;

    if (mode === "hd" && audioRef.current) {
      audioRef.current.pause();
      setStatus("paused");
      return;
    }

    if (mode === "browser" && typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.pause();
      browserPausedRef.current = true;
      setStatus("paused");
    }
  }, [mode, status]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const loadVoices = () => {
      const voice = pickBestSpeechVoice(window.speechSynthesis.getVoices());
      if (voice && status === "idle") {
        setVoiceLabel(voice.name);
      }
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [status]);

  return {
    status,
    voiceLabel,
    progress,
    play,
    pause,
    stop,
    canPlay: Boolean(text.trim()) && (status === "idle" || status === "paused"),
    canPause: status === "playing",
    canStop: status === "playing" || status === "paused" || status === "loading"
  };
}
