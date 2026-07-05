"use client";

import { Video } from "lucide-react";
import { YardVideoCard } from "@/components/YardVideoCard";
import { YARD_LINK_FEEDS } from "@/lib/yard-links/config";

export function YardLinksPanel() {
  return (
    <div className="crossover-dashboard crossover-dashboard__layout space-y-5">
      <header className="crossover-dashboard__page-header">
        <div className="flex items-start gap-3">
          <div className="crossover-icon-tile h-12 w-12 text-fitdog-orange">
            <Video className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h2 className="crossover-dashboard__page-title">Yard Links</h2>
            <p className="crossover-dashboard__page-subtitle">Quick access to live yard video links.</p>
          </div>
        </div>
      </header>

      <div className="yard-links-grid">
        {YARD_LINK_FEEDS.map((feed) => (
          <YardVideoCard
            key={feed.videoId}
            title={feed.title}
            videoId={feed.videoId}
            fallbackUrl={feed.fallbackUrl}
            description={feed.description}
          />
        ))}
      </div>
    </div>
  );
}
