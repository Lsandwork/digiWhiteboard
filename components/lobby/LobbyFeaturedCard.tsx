"use client";

import type { LobbyCheckoutDog } from "@/lib/lobby/types";
import { LobbyDogAvatar } from "@/components/lobby/LobbyDogAvatar";

type LobbyFeaturedCardProps = {
  dog: LobbyCheckoutDog;
};

export function LobbyFeaturedCard({ dog }: LobbyFeaturedCardProps) {
  return (
    <section className="lobby-panel lobby-featured-card relative overflow-hidden rounded-2xl border-l-[6px] border-l-lobby-orange px-6 py-5">
      <div className="relative z-10 flex items-center gap-6">
        <LobbyDogAvatar dogName={dog.dog_name} imageUrl={dog.dog_photo_url} size="featured" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-lobby-orange">{dog.checkout_status}</p>
          <h2 className="mt-2 text-5xl font-black leading-none text-white">{dog.dog_name}</h2>
          {dog.breed ? <p className="mt-2 text-xl text-lobby-muted">{dog.breed}</p> : null}
        </div>
      </div>
    </section>
  );
}
