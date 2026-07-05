"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { buildYouTubeEmbedUrl, isValidYouTubeVideoId } from "@/lib/yard-links/youtube";

type YardVideoCardProps = {
  title: string;
  videoId: string;
  fallbackUrl: string;
  description?: string;
};

export function YardVideoCard({ title, videoId, fallbackUrl, description = "Live yard camera link" }: YardVideoCardProps) {
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);

  const validVideoId = isValidYouTubeVideoId(videoId);
  const embedUrl = validVideoId ? buildYouTubeEmbedUrl(videoId) : null;

  useEffect(() => {
    const timer = window.setTimeout(() => setIframeReady(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!iframeReady || !embedUrl) return;
    const timeout = window.setTimeout(() => {
      if (!iframeLoaded) setIframeBlocked(true);
    }, 12000);
    return () => window.clearTimeout(timeout);
  }, [embedUrl, iframeLoaded, iframeReady]);

  return (
    <article className="yard-video-card crossover-card p-5">
      <header className="yard-video-card__header">
        <h3 className="crossover-card__title">{title}</h3>
        <p className="crossover-card__subtitle">{description}</p>
      </header>

      <div className="yard-video-card__player">
        {!validVideoId || !embedUrl ? (
          <div className="yard-video-card__fallback" role="status">
            <p className="yard-video-card__fallback-title">Video unavailable</p>
            <p className="yard-video-card__fallback-copy">This yard link could not be loaded. Open the feed directly in YouTube.</p>
          </div>
        ) : (
          <>
            {!iframeLoaded && !iframeBlocked ? <div className="yard-video-card__skeleton" aria-hidden="true" /> : null}
            {iframeBlocked ? (
              <div className="yard-video-card__fallback" role="status">
                <p className="yard-video-card__fallback-title">Embed blocked</p>
                <p className="yard-video-card__fallback-copy">Your browser or network blocked the embedded player. Use Open in YouTube below.</p>
              </div>
            ) : null}
            {iframeReady && !iframeBlocked ? (
              <iframe
                src={embedUrl}
                title={`${title} live yard video`}
                loading="lazy"
                className={`yard-video-card__iframe ${iframeLoaded ? "yard-video-card__iframe--loaded" : ""}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                onLoad={() => setIframeLoaded(true)}
              />
            ) : null}
          </>
        )}
      </div>

      <div className="yard-video-card__actions">
        <a
          href={fallbackUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="crossover-btn crossover-btn--outline inline-flex items-center gap-2"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          Open in YouTube
        </a>
      </div>
    </article>
  );
}
