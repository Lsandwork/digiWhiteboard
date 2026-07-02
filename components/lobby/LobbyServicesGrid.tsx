"use client";

import { useState } from "react";
import Image from "next/image";
import { LobbyAssetImage } from "@/components/lobby/LobbyAssetImage";
import { lobbyAssets, lobbyServiceIconFallbackPath, lobbyServiceIconPath } from "@/lib/lobby/assets";
import { LOBBY_SERVICES, type LobbyServiceItem } from "@/lib/lobby/services";

function ServiceIcon({ service }: { service: LobbyServiceItem }) {
  const [failed, setFailed] = useState(false);
  const primarySrc = lobbyServiceIconPath(service.icon);
  const fallbackSrc = lobbyServiceIconFallbackPath(service.icon);

  if (failed) {
    return (
      <div
        className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-white/5 text-lg font-black text-lobby-teal"
        aria-hidden
      >
        {service.title.trim().slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    <LobbyAssetImage
      src={primarySrc}
      fallbackSrc={fallbackSrc}
      alt=""
      width={48}
      height={48}
      className="h-12 w-12 object-contain"
      onFailed={() => setFailed(true)}
    />
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
        {LOBBY_SERVICES.map((service) => (
          <article key={service.title} className="flex flex-col items-center justify-start text-center">
            <ServiceIcon service={service} />
            <h4 className="mt-2 text-xs font-bold leading-tight text-white">{service.title}</h4>
          </article>
        ))}
      </div>
    </section>
  );
}
