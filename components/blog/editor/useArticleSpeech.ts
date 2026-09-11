"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chunkSpeechText, pickBestSpeechVoice } from "@/lib/blog/utils/natural-speech-voice";

export type ArticleSpeechStatus = "idle" | "loading" | "playing" | "paused";

type SpeechMode = "hd" | "browser";

function isLikelyMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export function useArticleSpeech(text: string) {
  const [status, setStatus] = useState<ArticleSpeechStatus>("idle");
  const [mode, setMode] = useState<SpeechMode>("hd");
  const [voiceLabel, setVoiceLabel] = useState<string>("Natural voice");
  const [progress, setProgress] = useState({ chunk: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const chunksRef = useRef<string[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const browserPausedRef = useRef(false);
  const unlockedAudioRef = useRef<HTMLAudioElement | null>(null);
  const speakBrowserChunkRef = useRef<(index: number) => void>(() => undefined);
  const playHdChunkRef = useRef<(index: number) => Promise<void>>(async () => undefined);
  const playBrowserRef = useRef<() => void>(() => undefined);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
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
    chunksRef.current = [];
    setProgress({ chunk: 0, total: 0 });
    setStatus("idle");
  }, [cleanupAudio]);

  useEffect(() => () => stop(), [stop]);

  const unlockAudioForGesture = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const silent = unlockedAudioRef.current || new Audio();
      unlockedAudioRef.current = silent;
      silent.muted = true;
      void silent
        .play()
        .then(() => {
          silent.pause();
          silent.muted = false;
          silent.removeAttribute("src");
        })
        .catch(() => undefined);
    } catch {
      // ignore
    }
  }, []);

  const speakBrowserChunk = useCallback(
    (index: number) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        setError("Speech is not available in this browser.");
        setStatus("idle");
        return;
      }
      const chunks = chunksRef.current;
      const chunk = chunks[index];
      if (!chunk) {
        stop();
        return;
      }

      const voices = window.speechSynthesis.getVoices();
      const voice = pickBestSpeechVoice(voices);
      setVoiceLabel(voice?.name || "System voice");

      const utter = new SpeechSynthesisUtterance(chunk);
      utter.lang = voice?.lang || "en-US";
      if (voice) utter.voice = voice;
      utter.rate = 0.96;
      utter.pitch = 1;
      utter.volume = 1;

      utter.onend = () => {
        const next = index + 1;
        if (next < chunks.length) {
          setProgress({ chunk: next + 1, total: chunks.length });
          speakBrowserChunkRef.current(next);
        } else {
          stop();
        }
      };
      utter.onerror = () => {
        setError("Playback stopped. Tap Play to try again.");
        stop();
      };

      utteranceRef.current = utter;
      window.speechSynthesis.speak(utter);
      setStatus("playing");
      setError(null);
    },
    [stop]
  );

  const playBrowser = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setVoiceLabel("Speech unavailable");
      setError("Speech is not available in this browser.");
      return;
    }

    const chunks = chunkSpeechText(text, 2800);
    if (!chunks.length) {
      setError("Nothing to read aloud yet.");
      return;
    }

    window.speechSynthesis.cancel();
    chunksRef.current = chunks;
    setMode("browser");
    setProgress({ chunk: 1, total: chunks.length });
    setError(null);
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
      setError(null);

      let res: Response;
      try {
        res = await fetch("/api/blog/articles/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ text, chunkIndex: index })
        });
      } catch {
        playBrowserRef.current();
        return;
      }

      if (!res.ok) {
        playBrowserRef.current();
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
          setProgress({ chunk: next + 1, total: chunks.length });
          void playHdChunkRef.current(next);
        } else {
          stop();
        }
      };
      audio.onerror = () => {
        setError("HD voice failed. Falling back to system voice.");
        playBrowserRef.current();
      };

      try {
        await audio.play();
        setStatus("playing");
      } catch {
        setError("Could not start HD audio. Using system voice instead.");
        playBrowserRef.current();
      }
    },
    [cleanupAudio, stop, text]
  );

  useEffect(() => {
    speakBrowserChunkRef.current = speakBrowserChunk;
  }, [speakBrowserChunk]);

  useEffect(() => {
    playBrowserRef.current = playBrowser;
  }, [playBrowser]);

  useEffect(() => {
    playHdChunkRef.current = playHdChunk;
  }, [playHdChunk]);

  const play = useCallback(async () => {
    if (!text.trim()) {
      setError("Add article text before playing.");
      return;
    }

    setError(null);

    if (status === "paused") {
      if (mode === "hd" && audioRef.current) {
        try {
          await audioRef.current.play();
          setStatus("playing");
          return;
        } catch {
          setError("Could not resume audio. Tap Play to restart.");
          stop();
          return;
        }
      }
      if (mode === "browser" && typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.resume();
        setStatus("playing");
        browserPausedRef.current = false;
        return;
      }
    }

    unlockAudioForGesture();

    // Mobile: start system speech inside the click gesture (HD fetch breaks iOS autoplay).
    if (isLikelyMobileBrowser()) {
      stop();
      playBrowser();
      return;
    }

    stop();
    const chunks = chunkSpeechText(text, 3200);
    chunksRef.current = chunks;
    setProgress({ chunk: 1, total: chunks.length });
    await playHdChunk(0);
  }, [mode, playBrowser, playHdChunk, status, stop, text, unlockAudioForGesture]);

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
    error,
    play,
    pause,
    stop,
    canPlay: Boolean(text.trim()) && (status === "idle" || status === "paused"),
    canPause: status === "playing",
    canStop: status === "playing" || status === "paused" || status === "loading"
  };
}
