"use client";

import Image from "next/image";
import { LobbyAssetImage } from "@/components/lobby/LobbyAssetImage";
import { lobbyAssets, lobbyServiceIconPath } from "@/lib/lobby/assets";
import { LOBBY_SERVICES, type LobbyServiceItem } from "@/lib/lobby/services";

function ServiceIcon({ service, index }: { service: LobbyServiceItem; index: number }) {
  const iconSrc = lobbyServiceIconPath(service.icon);

  return (
    <div
      className="lobby-service-icon-wrap"
      style={{ animationDelay: `${index * 0.35}s` }}
      aria-hidden
    >
      <LobbyAssetImage
        src={iconSrc}
        alt=""
        width={72}
        height={72}
        className="lobby-service-icon-image h-[4.5rem] w-[4.5rem] object-contain"
      />
    </div>
  );
}

export function LobbyServicesGrid() {
  return (
    <section className="lobby-panel lobby-services-panel flex h-full flex-col rounded-2xl p-4">
      <div className="mb-4 flex items-center gap-2">
        <Image src={lobbyAssets.heartIcon} alt="" width={22} height={22} className="h-5 w-5" unoptimized />
        <h3 className="text-lg font-black uppercase tracking-[0.16em] text-white">Services We Love</h3>
      </div>
      <div className="grid flex-1 grid-cols-3 gap-x-3 gap-y-4">
        {LOBBY_SERVICES.map((service, index) => (
          <article key={service.title} className="flex flex-col items-center justify-start text-center">
            <ServiceIcon service={service} index={index} />
            <h4 className="lobby-service-label mt-2 text-xs font-bold leading-tight">{service.title}</h4>
          </article>
        ))}
      </div>
    </section>
  );
}
