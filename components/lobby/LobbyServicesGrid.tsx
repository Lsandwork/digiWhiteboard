"use client";

import { useEffect, useMemo, useState } from "react";
import { LobbySectionDogIcon } from "@/components/lobby/LobbySectionDogIcon";
import { LobbyAssetImage } from "@/components/lobby/LobbyAssetImage";
import { lobbyAssets, lobbyServiceIconPath } from "@/lib/lobby/assets";
import {
  LOBBY_SERVICES_SLIDE_INTERVAL_MS,
  getLobbyServicePages,
  type LobbyServiceItem
} from "@/lib/lobby/services";

function ServiceCard({ service }: { service: LobbyServiceItem }) {
  const iconSrc = lobbyServiceIconPath(service.icon);

  return (
    <article className="lobby-service-card lobby-services-page__card">
      <div className="lobby-service-icon-shell" aria-hidden>
        <LobbyAssetImage
          src={iconSrc}
          alt=""
          width={56}
          height={56}
          className="lobby-service-icon"
          loading="eager"
        />
      </div>
      <h4 className="lobby-service-label">
        {service.labelLines ? (
          <>
            <span>{service.labelLines[0]}</span>
            <span>{service.labelLines[1]}</span>
          </>
        ) : (
          <span>{service.title}</span>
        )}
      </h4>
    </article>
  );
}

function ServicePage({ services, active }: { services: LobbyServiceItem[]; active: boolean }) {
  return (
    <article className={`lobby-services-page ${active ? "is-active" : ""}`} aria-hidden={!active}>
      <div className="lobby-services-page__grid">
        {services.map((service) => (
          <ServiceCard key={service.title} service={service} />
        ))}
      </div>
    </article>
  );
}

export function LobbyServicesGrid() {
  const servicePages = useMemo(() => getLobbyServicePages(), []);
  const [pageIndex, setPageIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reduceMotion || servicePages.length < 2) return;

    const timer = window.setInterval(() => {
      setPageIndex((current) => (current + 1) % servicePages.length);
    }, LOBBY_SERVICES_SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [reduceMotion, servicePages.length]);

  const activePage = servicePages[pageIndex];

  return (
    <section className="lobby-panel lobby-services-panel flex h-full min-h-0 flex-col rounded-2xl p-4">
      <div className="mb-3 flex shrink-0 items-center gap-2">
        <LobbySectionDogIcon />
        <h3 className="text-lg font-black uppercase tracking-[0.16em] text-white">Services We Love</h3>
      </div>

      <div className="lobby-services-slideshow flex min-h-0 flex-1 flex-col" aria-live="off">
        <div className="lobby-services-slideshow__stage">
          <LobbyAssetImage
            src={lobbyAssets.servicesScenery}
            alt=""
            width={640}
            height={960}
            fill
            className="lobby-services-slideshow__texture pointer-events-none object-cover opacity-[0.08]"
            loading="eager"
          />

          {servicePages.map((services, index) => (
            <ServicePage key={services.map((service) => service.title).join("-")} services={services} active={index === pageIndex} />
          ))}
        </div>

        <p className="sr-only">{activePage.map((service) => service.title).join(", ")}</p>
      </div>
    </section>
  );
}
