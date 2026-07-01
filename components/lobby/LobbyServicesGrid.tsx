"use client";

import Image from "next/image";
import { lobbyAssets, lobbyIconPath } from "@/lib/lobby/assets";
import { LOBBY_SERVICES } from "@/lib/lobby/services";

export function LobbyServicesGrid() {
  return (
    <section className="relative overflow-hidden rounded-[1.5rem] border border-white/10 p-4 sm:p-5">
      <Image src={lobbyAssets.servicesCard} alt="" fill className="pointer-events-none object-cover opacity-35" loading="lazy" />
      <div className="relative z-10">
        <h3 className="text-xl font-black uppercase tracking-[0.24em] text-white sm:text-2xl">Services We Love</h3>
        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
          {LOBBY_SERVICES.map((service) => (
            <article
              key={service.title}
              className="lobby-service-card rounded-2xl border border-white/10 bg-lobby-card/85 p-4"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-lobby-orange/15">
                <Image
                  src={lobbyIconPath(service.icon)}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7"
                  loading="lazy"
                />
              </div>
              <h4 className="text-base font-bold leading-tight text-white sm:text-lg">{service.title}</h4>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
