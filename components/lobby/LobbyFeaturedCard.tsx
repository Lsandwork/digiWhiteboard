"use client";

import Image from "next/image";
import { lobbyAssets } from "@/lib/lobby/assets";
import type { LobbyCheckoutDog } from "@/lib/lobby/types";
import { LobbyDogAvatar } from "@/components/lobby/LobbyDogAvatar";

type LobbyFeaturedCardProps = {
  dog: LobbyCheckoutDog;
  message?: string | null;
};

export function LobbyFeaturedCard({ dog, message }: LobbyFeaturedCardProps) {
  return (
    <section className="lobby-featured-card relative overflow-hidden rounded-[2rem] border border-fitdog-orange/30 bg-ink-900/70 p-6 sm:p-8">
      <Image
        src={lobbyAssets.featuredGlow}
        alt=""
        fill
        className="pointer-events-none object-cover opacity-80"
        priority
      />
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center">
        <LobbyDogAvatar dogName={dog.dog_name} imageUrl={dog.dog_photo_url} size="featured" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-fitdog-orange">Now Ready for Pickup</p>
          <h2 className="mt-2 text-5xl font-black text-white sm:text-7xl">{dog.dog_name}</h2>
          {dog.breed ? <p className="mt-2 text-2xl font-medium text-slate-300">{dog.breed}</p> : null}
          <div className="mt-5 inline-flex rounded-full border border-fitdog-orange/40 bg-fitdog-orange/10 px-5 py-2 text-lg font-semibold text-orange-100">
            {dog.checkout_status}
          </div>
          {message ? <p className="mt-5 max-w-2xl text-lg text-slate-300 sm:text-xl">{message}</p> : null}
        </div>
      </div>
    </section>
  );
}
