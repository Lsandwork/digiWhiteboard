"use client";

import Image from "next/image";
import { lobbyAssets } from "@/lib/lobby/assets";
import type { LobbyCheckoutDog } from "@/lib/lobby/types";
import { LobbyDogAvatar } from "@/components/lobby/LobbyDogAvatar";

type LobbyQueueListProps = {
  dogs: LobbyCheckoutDog[];
};

export function LobbyQueueList({ dogs }: LobbyQueueListProps) {
  if (!dogs.length) return null;

  return (
    <section className="lobby-queue">
      <h3 className="mb-4 text-xl font-black uppercase tracking-[0.24em] text-white sm:text-2xl">Checking Out Next</h3>
      <div className="space-y-3">
        {dogs.map((dog) => (
          <article
            key={dog.id}
            className="lobby-queue-row relative overflow-hidden rounded-2xl border border-white/10 px-4 py-3 sm:px-5 sm:py-4"
          >
            <Image src={lobbyAssets.queueRowBg} alt="" fill className="pointer-events-none object-cover opacity-70" />
            <div className="relative z-10 flex items-center gap-4">
              <LobbyDogAvatar dogName={dog.dog_name} imageUrl={dog.dog_photo_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-2xl font-bold text-white sm:text-3xl">{dog.dog_name}</p>
                {dog.breed ? <p className="truncate text-base text-slate-300 sm:text-lg">{dog.breed}</p> : null}
              </div>
              <p className="shrink-0 rounded-full bg-lobby-orange/15 px-4 py-2 text-sm font-semibold text-orange-50 sm:text-base">
                {dog.checkout_status}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
