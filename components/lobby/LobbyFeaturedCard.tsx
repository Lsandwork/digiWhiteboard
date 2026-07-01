"use client";

import Image from "next/image";
import { lobbyAssets, lobbyStatusAsset } from "@/lib/lobby/assets";
import type { LobbyCheckoutDog } from "@/lib/lobby/types";
import { LobbyDogAvatar } from "@/components/lobby/LobbyDogAvatar";

type LobbyFeaturedCardProps = {
  dog: LobbyCheckoutDog;
  message?: string | null;
};

export function LobbyFeaturedCard({ dog, message }: LobbyFeaturedCardProps) {
  return (
    <section className="lobby-panel lobby-featured-card relative overflow-hidden rounded-2xl p-5 sm:p-6">
      <Image
        src={lobbyAssets.featuredCard}
        alt=""
        fill
        className="pointer-events-none object-cover opacity-95"
        priority
      />
      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center">
        <LobbyDogAvatar dogName={dog.dog_name} imageUrl={dog.dog_photo_url} size="featured" />
        <div className="min-w-0 flex-1">
          <Image
            src={lobbyStatusAsset(dog.checkout_status)}
            alt={dog.checkout_status}
            width={280}
            height={56}
            className="h-10 w-auto max-w-full sm:h-12"
          />
          <h2 className="mt-3 text-5xl font-black text-white sm:text-6xl xl:text-7xl">{dog.dog_name}</h2>
          {dog.breed ? <p className="mt-2 text-2xl font-medium text-slate-200">{dog.breed}</p> : null}
          <p className="mt-4 inline-flex rounded-full border border-lobby-orange/40 bg-lobby-orange/15 px-5 py-2 text-lg font-semibold text-orange-50">
            {dog.checkout_status}
          </p>
          {message ? <p className="mt-5 max-w-2xl text-lg text-slate-200 sm:text-xl">{message}</p> : null}
        </div>
      </div>
    </section>
  );
}
