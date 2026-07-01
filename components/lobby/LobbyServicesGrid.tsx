"use client";

import Image from "next/image";
import { lobbyIconPath } from "@/lib/lobby/assets";
import type { LobbyPromotion } from "@/lib/lobby/types";

type LobbyServicesGridProps = {
  promotions: LobbyPromotion[];
};

export function LobbyServicesGrid({ promotions }: LobbyServicesGridProps) {
  return (
    <section>
      <h3 className="mb-4 text-xl font-black uppercase tracking-[0.24em] text-white sm:text-2xl">Services We Love</h3>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {promotions.slice(0, 6).map((promotion) => (
          <article
            key={promotion.id}
            className="lobby-service-card rounded-2xl border border-white/10 bg-ink-900/60 p-4"
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-fitdog-orange/15">
              <Image
                src={lobbyIconPath(promotion.icon_key)}
                alt=""
                width={28}
                height={28}
                className="h-7 w-7"
                loading="lazy"
              />
            </div>
            <h4 className="text-lg font-bold text-white sm:text-xl">{promotion.title}</h4>
            {promotion.subtitle ? <p className="mt-1 text-sm leading-snug text-slate-400">{promotion.subtitle}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
