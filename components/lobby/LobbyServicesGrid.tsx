"use client";

import Image from "next/image";
import { lobbyAssets, lobbyIconPath } from "@/lib/lobby/assets";
import { LOBBY_SERVICES } from "@/lib/lobby/services";

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
            <Image
              src={lobbyIconPath(service.icon, "png")}
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 object-contain"
              unoptimized
            />
            <h4 className="mt-2 text-xs font-bold leading-tight text-white">{service.title}</h4>
          </article>
        ))}
      </div>
    </section>
  );
}
