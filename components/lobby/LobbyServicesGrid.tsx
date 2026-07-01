"use client";

import Image from "next/image";
import { lobbyAssets, lobbyIconPath } from "@/lib/lobby/assets";
import { LOBBY_SERVICES } from "@/lib/lobby/services";

export function LobbyServicesGrid() {
  return (
    <section className="lobby-services-panel relative h-full overflow-hidden rounded-2xl border-2 border-lobby-teal/30 bg-lobby-card/60 p-3 backdrop-blur-sm sm:p-4">
      <Image src={lobbyAssets.servicesCard} alt="" fill className="pointer-events-none object-cover opacity-20" loading="lazy" />
      <div className="relative z-10 flex h-full flex-col">
        <div className="mb-3 flex items-center gap-2">
          <Image src={lobbyIconPath("member")} alt="" width={22} height={22} className="h-5 w-5" />
          <h3 className="text-base font-black uppercase tracking-[0.2em] text-white xl:text-lg">Services We Love</h3>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-2">
          {LOBBY_SERVICES.map((service) => (
            <article
              key={service.title}
              className="lobby-service-card flex flex-col items-center justify-center rounded-xl border border-lobby-teal/20 bg-lobby-card/80 p-2 text-center"
            >
              <div className="mb-1.5 flex h-10 w-10 items-center justify-center rounded-full border border-lobby-teal/30 bg-lobby-teal/10">
                <Image
                  src={lobbyIconPath(service.icon)}
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6"
                  loading="lazy"
                />
              </div>
              <h4 className="text-[10px] font-bold leading-tight text-white xl:text-xs">{service.title}</h4>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
