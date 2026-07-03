"use client";

import { LobbySectionDogIcon } from "@/components/lobby/LobbySectionDogIcon";
import { LobbyAssetImage } from "@/components/lobby/LobbyAssetImage";
import { lobbyServiceIconPath } from "@/lib/lobby/assets";
import { LOBBY_SERVICES, type LobbyServiceItem } from "@/lib/lobby/services";

function ServiceCard({ service }: { service: LobbyServiceItem }) {
  const iconSrc = lobbyServiceIconPath(service.icon);

  return (
    <article className="lobby-service-card">
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

export function LobbyServicesGrid() {
  return (
    <section className="lobby-panel lobby-services-panel flex h-full flex-col rounded-2xl p-4">
      <div className="mb-4 flex items-center gap-2">
        <LobbySectionDogIcon />
        <h3 className="text-lg font-black uppercase tracking-[0.16em] text-white">Services We Love</h3>
      </div>
      <div className="lobby-services-grid grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LOBBY_SERVICES.map((service) => (
          <ServiceCard key={service.title} service={service} />
        ))}
      </div>
    </section>
  );
}
