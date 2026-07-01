"use client";

import Image from "next/image";
import { lobbyAssets, lobbyIconPath } from "@/lib/lobby/assets";
import { LOBBY_SERVICES } from "@/lib/lobby/services";

type LobbyServicesGridProps = {
  sidebar?: boolean;
};

export function LobbyServicesGrid({ sidebar = false }: LobbyServicesGridProps) {
  return (
    <section className="relative h-full overflow-hidden rounded-[1.5rem] border border-white/10 p-4">
      <Image src={lobbyAssets.servicesCard} alt="" fill className="pointer-events-none object-cover opacity-30" loading="lazy" />
      <div className="relative z-10">
        <h3 className="text-lg font-black uppercase tracking-[0.22em] text-white xl:text-xl">Services We Love</h3>
        <div className={`mt-3 grid gap-2 ${sidebar ? "grid-cols-2" : "grid-cols-2 xl:grid-cols-3"}`}>
          {LOBBY_SERVICES.map((service) => (
            <article
              key={service.title}
              className="lobby-service-card rounded-xl border border-white/10 bg-lobby-card/85 p-3"
            >
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-lobby-orange/15">
                <Image
                  src={lobbyIconPath(service.icon)}
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6"
                  loading="lazy"
                />
              </div>
              <h4 className="text-sm font-bold leading-tight text-white xl:text-base">{service.title}</h4>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
